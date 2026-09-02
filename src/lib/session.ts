import { cookies } from 'next/headers';
import { getIronSession, type SessionOptions } from 'iron-session';
import type { Role } from '@prisma/client';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type AppSession = {
  user?: SessionUser;
};

const SESSION_TTL_SECONDS = 60 * 60 * 8;

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? '',
  cookieName: 'minnekyda_session',
  ttl: SESSION_TTL_SECONDS,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SECURE_COOKIES === 'true',
    maxAge: SESSION_TTL_SECONDS,
  },
};

export async function getSession(): Promise<AppSession & { save: () => Promise<void>; destroy: () => void }> {
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters');
  }
  return getIronSession<AppSession>(cookies(), sessionOptions);
}
