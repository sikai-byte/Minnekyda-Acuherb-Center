'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getKioskSession, getSession, MFA_PENDING_TTL_MS } from '@/lib/session';
import { recordAudit } from '@/lib/audit';
import { PORTAL_HOME } from '@/lib/auth';
import {
  isLockedOut,
  LOCKOUT_MESSAGE,
  passwordPolicyError,
  recordAttempt,
  requestIp,
} from '@/lib/loginGuard';
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCodes,
  verifyTotp,
} from '@/lib/mfa';
import { decryptSecret, encryptSecret, isEncrypted } from '@/lib/secretBox';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export type FormState = { error?: string };

/// Password check only. A correct password produces a pending session with no authority;
/// the second factor in `verifyMfa` is what mints a real staff session.
export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const email = parsed.data.email.toLowerCase();
  const ip = requestIp();

  if (await isLockedOut(email, ip)) {
    await recordAttempt({ email, ip, success: false, reason: 'locked_out' });
    return { error: LOCKOUT_MESSAGE };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordOk = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
  if (!user || !user.active || !passwordOk) {
    await recordAttempt({
      email,
      ip,
      success: false,
      reason: !user ? 'unknown_email' : !user.active ? 'inactive' : 'bad_password',
    });
    return { error: 'Email or password is incorrect' };
  }

  /// Handing the device back to staff must not resurrect a kiosk token.
  const kiosk = await getKioskSession();
  kiosk.destroy();

  /// Patients sign in with a password alone: the portal exposes nothing but their own
  /// record, and requiring an authenticator app of every patient would push them back to
  /// phoning the front desk. Staff MFA stays mandatory.
  if (user.role === 'PATIENT') {
    await recordAttempt({ email, ip, success: true, reason: 'patient_password' });
    await completeLogin(user);
  }

  const session = await getSession();
  session.user = undefined;
  session.pendingMfa = { userId: user.id, startedAt: Date.now() };
  await session.save();

  redirect(user.mfaEnabledAt ? '/login/mfa' : '/login/mfa/setup');
}

async function pendingUser() {
  const session = await getSession();
  const pending = session.pendingMfa;
  if (!pending || Date.now() - pending.startedAt > MFA_PENDING_TTL_MS) {
    session.destroy();
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  return user && user.active ? user : null;
}

async function completeLogin(user: {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  patientId: string | null;
}): Promise<never> {
  const session = await getSession();
  session.pendingMfa = undefined;
  session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    patientId: user.patientId ?? undefined,
  };
  session.lastSeenAt = Date.now();
  await session.save();

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({ userId: user.id, action: 'login', entity: 'User', entityId: user.id });

  redirect(user.mustChangePassword ? '/account/password' : landingPath(user.role));
}

function landingPath(role: Role): string {
  return role === 'PATIENT' ? PORTAL_HOME : '/';
}

/// Second factor for an account that already has MFA in force. Accepts either a TOTP code
/// or one single-use recovery code.
export async function verifyMfa(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await pendingUser();
  if (!user || !user.mfaEnabledAt || !user.mfaSecret) redirect('/login');

  const ip = requestIp();
  if (await isLockedOut(user.email, ip)) {
    await recordAttempt({ email: user.email, ip, success: false, reason: 'locked_out' });
    return { error: LOCKOUT_MESSAGE };
  }

  const code = String(formData.get('code') ?? '');
  if (verifyTotp(decryptSecret(user.mfaSecret), code)) {
    if (!isEncrypted(user.mfaSecret)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaSecret: encryptSecret(user.mfaSecret) },
      });
    }
    await recordAttempt({ email: user.email, ip, success: true, reason: 'totp' });
    await completeLogin(user);
  }

  const remaining = await consumeRecoveryCode(user.mfaRecoveryCodes, code);
  if (remaining) {
    await prisma.user.update({ where: { id: user.id }, data: { mfaRecoveryCodes: remaining } });
    await recordAttempt({ email: user.email, ip, success: true, reason: 'recovery_code' });
    await recordAudit({
      userId: user.id,
      action: 'mfa_recovery_code_used',
      entity: 'User',
      entityId: user.id,
      detail: { remaining: remaining.length },
    });
    await completeLogin(user);
  }

  await recordAttempt({ email: user.email, ip, success: false, reason: 'bad_mfa_code' });
  return { error: 'That code is not valid. Try the next code from your authenticator app.' };
}

export type EnrollState = { error?: string; recoveryCodes?: string[] };

/// Enrolment is mandatory: an account without MFA cannot reach anything until it finishes.
/// The secret is stored on first render of the setup page and only takes effect once a
/// generated code proves the authenticator app holds the same secret.
export async function beginMfaEnrollment(): Promise<{ secret: string; email: string } | null> {
  const user = await pendingUser();
  if (!user) return null;
  if (user.mfaEnabledAt) return null;

  if (user.mfaSecret) return { secret: decryptSecret(user.mfaSecret), email: user.email };

  const secret = generateSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: encryptSecret(secret) },
  });
  return { secret, email: user.email };
}

export async function confirmMfaEnrollment(
  _prev: EnrollState,
  formData: FormData,
): Promise<EnrollState> {
  const user = await pendingUser();
  if (!user || !user.mfaSecret) redirect('/login');

  if (!verifyTotp(decryptSecret(user.mfaSecret), String(formData.get('code') ?? ''))) {
    await recordAttempt({
      email: user.email,
      ip: requestIp(),
      success: false,
      reason: 'bad_mfa_enrollment_code',
    });
    return { error: 'That code is not valid. Check the six digits and try again.' };
  }

  const codes = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabledAt: new Date(), mfaRecoveryCodes: await hashRecoveryCodes(codes) },
  });
  await recordAudit({
    userId: user.id,
    action: 'mfa_enrolled',
    entity: 'User',
    entityId: user.id,
  });

  /// Shown once, then the practitioner continues to the app from the codes screen.
  return { recoveryCodes: codes };
}

export async function finishMfaEnrollment(): Promise<void> {
  const user = await pendingUser();
  if (!user || !user.mfaEnabledAt) redirect('/login');
  await completeLogin(user);
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  const sessionUser = session.user;
  if (!sessionUser) redirect('/login');

  const current = String(formData.get('currentPassword') ?? '');
  const next = String(formData.get('newPassword') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
    return { error: 'Your current password is incorrect' };
  }
  if (next !== confirm) return { error: 'The new passwords do not match' };
  if (await bcrypt.compare(next, user.passwordHash)) {
    return { error: 'Choose a password you have not used here before' };
  }
  const policyError = passwordPolicyError(next);
  if (policyError) return { error: policyError };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false },
  });
  session.user = { ...sessionUser, mustChangePassword: false };
  await session.save();
  await recordAudit({
    userId: user.id,
    action: 'password_changed',
    entity: 'User',
    entityId: user.id,
  });

  redirect(landingPath(sessionUser.role));
}

export async function logout(): Promise<void> {
  const session = await getSession();
  const userId = session.user?.id;
  session.destroy();
  const kiosk = await getKioskSession();
  kiosk.destroy();
  await recordAudit({ userId, action: 'logout', entity: 'User', entityId: userId });
  redirect('/login');
}
