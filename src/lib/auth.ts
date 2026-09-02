import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import { getKioskSession, getSession, type SessionUser } from './session';

export async function currentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session.user ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  /// A seeded or admin-reset password must be replaced before anything else is reachable.
  if (user.mustChangePassword) redirect('/account/password');
  return user;
}

/// For the password screen itself, which must stay reachable while the flag is set.
export async function requireUserPendingPasswordChange(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect('/');
  return user;
}

/// Only clinicians may read or write clinical notes; front desk staff are limited to
/// demographics and intake paperwork.
export const CLINICAL_ROLES: Role[] = ['ADMIN', 'PRACTITIONER'];

export function canViewClinicalNotes(user: SessionUser): boolean {
  return CLINICAL_ROLES.includes(user.role);
}

/// The patient-held iPad has no staff session: it carries a kiosk token bound to a single
/// submission. Intake pages and the intake save action accept either that token for their
/// own submission, or a staff session.
export type IntakeAccess =
  | { kind: 'kiosk'; submissionId: string }
  | { kind: 'staff'; user: SessionUser };

export async function intakeAccess(submissionId: string): Promise<IntakeAccess | null> {
  const kiosk = await getKioskSession();
  if (kiosk.submissionId) {
    return kiosk.submissionId === submissionId ? { kind: 'kiosk', submissionId } : null;
  }
  const user = await currentUser();
  return user ? { kind: 'staff', user } : null;
}

export async function requireIntakeAccess(submissionId: string): Promise<IntakeAccess> {
  const access = await intakeAccess(submissionId);
  if (!access) redirect('/login');
  return access;
}
