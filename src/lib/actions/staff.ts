'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { SIGN_IN_AGAIN, roleOrRefusal } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { temporaryPassword } from '@/lib/tempPassword';

export type StaffActionState = {
  error?: string;
  message?: string;
  /// Read to the staff member once, on screen. Never stored in the clear, never emailed.
  temporaryPassword?: string;
};

/// A patient's login is issued from their chart and is bound to their record, so it is not
/// something this screen can create or hand a staff role to.
const STAFF_ROLES = ['ADMIN', 'PRACTITIONER', 'FRONT_DESK'] as const;

const newStaffSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  name: z.string().trim().min(1, 'Enter a name'),
  role: z.enum(STAFF_ROLES),
  credentials: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => (value ? value : null)),
});

/// Loads a staff account by id, refusing patient accounts so this screen can never be used
/// to reach into a patient's portal login.
async function staffAccount(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role === 'PATIENT' || user.patientId) return null;
  return user;
}

export async function createStaffAccount(formData: FormData): Promise<StaffActionState> {
  const admin = await roleOrRefusal(['ADMIN']);
  if (!admin) return { error: SIGN_IN_AGAIN };

  const parsed = newStaffSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    role: formData.get('role'),
    credentials: formData.get('credentials'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details and try again' };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: 'That email address already has a login here.' };

  const password = temporaryPassword();
  const created = await prisma.user.create({
    data: {
      ...parsed.data,
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true,
    },
  });

  await recordAudit({
    userId: admin.id,
    action: 'staff_account_created',
    entity: 'User',
    entityId: created.id,
    detail: { role: created.role },
  });

  revalidatePath('/admin/staff');
  return { temporaryPassword: password, message: `${created.name} can now sign in.` };
}

/// Puts the account back to a one-time password that must be changed on the next sign-in.
export async function resetStaffPassword(userId: string): Promise<StaffActionState> {
  const admin = await roleOrRefusal(['ADMIN']);
  if (!admin) return { error: SIGN_IN_AGAIN };
  const user = await staffAccount(userId);
  if (!user) return { error: 'Staff account not found' };

  const password = temporaryPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true },
  });

  await recordAudit({
    userId: admin.id,
    action: 'staff_password_reset',
    entity: 'User',
    entityId: user.id,
  });

  revalidatePath('/admin/staff');
  return { temporaryPassword: password, message: `New one-time password for ${user.name}.` };
}

/// For a lost or replaced phone: clearing the enrolment lets the next sign-in set up a new
/// authenticator, and it invalidates the old secret and every unused recovery code.
export async function resetStaffMfa(userId: string): Promise<StaffActionState> {
  const admin = await roleOrRefusal(['ADMIN']);
  if (!admin) return { error: SIGN_IN_AGAIN };
  const user = await staffAccount(userId);
  if (!user) return { error: 'Staff account not found' };

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: [] },
  });

  await recordAudit({
    userId: admin.id,
    action: 'staff_mfa_reset',
    entity: 'User',
    entityId: user.id,
  });

  revalidatePath('/admin/staff');
  return {
    message: `${user.name} will set up a new authenticator app at their next sign-in.`,
  };
}

export async function setStaffActive(
  userId: string,
  active: boolean,
): Promise<StaffActionState> {
  const admin = await roleOrRefusal(['ADMIN']);
  if (!admin) return { error: SIGN_IN_AGAIN };
  const user = await staffAccount(userId);
  if (!user) return { error: 'Staff account not found' };
  /// Deactivating yourself would leave nobody able to turn the account back on.
  if (user.id === admin.id) return { error: 'You cannot turn off your own access.' };
  if (!active && (await lastActiveAdmin(user))) {
    return { error: 'This is the only active admin. Give someone else admin access first.' };
  }

  /// Deactivated, never deleted: the account is referenced by its own audit history and by
  /// the notes it signed.
  await prisma.user.update({ where: { id: user.id }, data: { active } });

  await recordAudit({
    userId: admin.id,
    action: active ? 'staff_account_reactivated' : 'staff_account_deactivated',
    entity: 'User',
    entityId: user.id,
  });

  revalidatePath('/admin/staff');
  return { message: active ? `${user.name} can sign in again.` : `${user.name} is turned off.` };
}

export async function changeStaffRole(userId: string, role: Role): Promise<StaffActionState> {
  const admin = await roleOrRefusal(['ADMIN']);
  if (!admin) return { error: SIGN_IN_AGAIN };
  const user = await staffAccount(userId);
  if (!user) return { error: 'Staff account not found' };
  if (!STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])) {
    return { error: 'Unknown role' };
  }
  if (user.id === admin.id) return { error: 'You cannot change your own role.' };
  if (role !== 'ADMIN' && (await lastActiveAdmin(user))) {
    return { error: 'This is the only active admin. Give someone else admin access first.' };
  }

  await prisma.user.update({ where: { id: user.id }, data: { role } });

  await recordAudit({
    userId: admin.id,
    action: 'staff_role_changed',
    entity: 'User',
    entityId: user.id,
    detail: { from: user.role, to: role },
  });

  revalidatePath('/admin/staff');
  return { message: `${user.name} is now ${role === 'FRONT_DESK' ? 'front desk' : role.toLowerCase()}.` };
}

async function lastActiveAdmin(user: { id: string; role: Role; active: boolean }) {
  if (user.role !== 'ADMIN' || !user.active) return false;
  const others = await prisma.user.count({
    where: { role: 'ADMIN', active: true, id: { not: user.id } },
  });
  return others === 0;
}
