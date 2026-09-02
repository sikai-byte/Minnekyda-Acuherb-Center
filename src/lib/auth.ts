import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import { getKioskSession, getSession, type SessionUser } from './session';

export async function currentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session.user ?? null;
}

/// Every staff page and staff action goes through here, so this is the one place a patient
/// account has to be turned away: a PATIENT session is bounced to its own portal no matter
/// which staff route it asks for.
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  /// A seeded or admin-reset password must be replaced before anything else is reachable.
  if (user.mustChangePassword) redirect('/account/password');
  if (user.role === 'PATIENT') redirect(PORTAL_HOME);
  return user;
}

export const PORTAL_HOME = '/portal';

/// The portal's only source of patient identity. The id comes from the session, never from
/// the URL or a form field, so there is no id for a patient to tamper with.
export async function requirePatient(): Promise<{ user: SessionUser; patientId: string }> {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/account/password');
  if (user.role !== 'PATIENT' || !user.patientId) redirect('/');
  return { user, patientId: user.patientId };
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
  return user && user.role !== 'PATIENT' ? { kind: 'staff', user } : null;
}

export async function requireIntakeAccess(submissionId: string): Promise<IntakeAccess> {
  const access = await intakeAccess(submissionId);
  if (!access) redirect('/login');
  return access;
}
