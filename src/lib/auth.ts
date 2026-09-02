import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import { getSession, type SessionUser } from './session';

export async function currentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session.user ?? null;
}

export async function requireUser(): Promise<SessionUser> {
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
