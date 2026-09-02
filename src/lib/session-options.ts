import type { SessionOptions } from 'iron-session';
import type { Role } from '@prisma/client';

/// Cookie configuration only. Kept free of `next/headers` so the edge middleware can
/// import it alongside the server-side helpers in `session.ts`.

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  /// Mirrors `User.mustChangePassword` so every request can bounce the user to the password
  /// screen without an extra query.
  mustChangePassword?: boolean;
};

export type AppSession = {
  user?: SessionUser;
  /// Set after a correct password but before the second factor is verified. Carries no
  /// authority: nothing except the MFA screens may read it.
  pendingMfa?: { userId: string; startedAt: number };
};

/// A patient-held iPad never carries a staff session. Starting an intake swaps the staff
/// session for this token, which is bound to one submission and expires quickly.
export type KioskSession = {
  submissionId?: string;
  patientId?: string;
};

export const SESSION_TTL_SECONDS = 60 * 60 * 8;
export const KIOSK_TTL_SECONDS = 60 * 45;
export const MFA_PENDING_TTL_MS = 5 * 60 * 1000;

export const SESSION_COOKIE = 'minnekyda_session';
export const KIOSK_COOKIE = 'minnekyda_kiosk';

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters');
  }
  return secret;
}

function options(cookieName: string, ttl: number): SessionOptions {
  return {
    password: sessionSecret(),
    cookieName,
    ttl,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      /// Cookies are only ever sent in the clear in local development.
      secure: process.env.NODE_ENV === 'production' || process.env.SECURE_COOKIES === 'true',
      path: '/',
      maxAge: ttl,
    },
  };
}

export const sessionOptions = (): SessionOptions => options(SESSION_COOKIE, SESSION_TTL_SECONDS);
export const kioskSessionOptions = (): SessionOptions => options(KIOSK_COOKIE, KIOSK_TTL_SECONDS);
