'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { notifyPortalInvite } from '@/lib/email/notifications';
import { temporaryPassword } from '@/lib/tempPassword';

export type PortalAccessState = {
  error?: string;
  /// Shown to staff once, on screen, so they can read it to the patient, and emailed to the
  /// patient as well — the address is their username, so it is already known good enough to be
  /// the login. Never stored in the clear, single-use, and useless without being changed.
  temporaryPassword?: string;
  /// Whether the invitation actually left the building, so the chart never claims a delivery
  /// that failed or that no mail provider is configured for.
  emailed?: boolean;
  message?: string;
};

async function patientForAccess(patientId: string) {
  return prisma.patient.findUnique({
    where: { id: patientId },
    include: { portalAccount: { select: { id: true, email: true, active: true } } },
  });
}

/// Creates or re-enables a patient's portal login. Staff never choose or see a lasting
/// password: the temporary one must be changed at first sign-in.
export async function grantPortalAccess(patientId: string): Promise<PortalAccessState> {
  const staff = await requireUser();
  const patient = await patientForAccess(patientId);
  if (!patient) return { error: 'Patient not found' };

  const email = patient.email?.trim().toLowerCase();
  if (!email) {
    return { error: 'Add an email address to this chart first — it is the patient’s username.' };
  }

  /// A staff address must never be turned into a patient login.
  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash && clash.patientId !== patientId) {
    return { error: 'That email address already has a login here. Use a different address.' };
  }

  const password = temporaryPassword();
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { patientId },
    create: {
      email,
      name: `${patient.firstName} ${patient.lastName}`,
      passwordHash,
      role: 'PATIENT',
      patientId,
      mustChangePassword: true,
    },
    update: {
      email,
      passwordHash,
      role: 'PATIENT',
      active: true,
      mustChangePassword: true,
      /// A patient login carries no second factor, so make sure a re-grant cannot inherit
      /// stale MFA material.
      mfaSecret: null,
      mfaEnabledAt: null,
      mfaRecoveryCodes: [],
    },
  });

  await recordAudit({
    userId: staff.id,
    action: patient.portalAccount ? 'portal_access_reset' : 'portal_access_granted',
    entity: 'Patient',
    entityId: patientId,
    patientId,
  });

  const invite = await notifyPortalInvite({
    patientId,
    firstName: patient.firstName,
    email,
    temporaryPassword: password,
  });

  revalidatePath(`/patients/${patientId}`);
  return { temporaryPassword: password, emailed: invite.status === 'SENT' };
}

export async function revokePortalAccess(patientId: string): Promise<PortalAccessState> {
  const staff = await requireUser();
  const patient = await patientForAccess(patientId);
  if (!patient?.portalAccount) return { error: 'This patient has no portal login' };

  /// Deactivated rather than deleted: the account is referenced by its own audit history.
  await prisma.user.update({
    where: { id: patient.portalAccount.id },
    data: { active: false },
  });

  await recordAudit({
    userId: staff.id,
    action: 'portal_access_revoked',
    entity: 'Patient',
    entityId: patientId,
    patientId,
  });

  revalidatePath(`/patients/${patientId}`);
  return { message: 'Portal access turned off' };
}
