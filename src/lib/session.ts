import { cookies } from 'next/headers';
import { getIronSession, type IronSession } from 'iron-session';
import {
  kioskSessionOptions,
  sessionOptions,
  type AppSession,
  type KioskSession,
} from './session-options';

export type { AppSession, KioskSession, SessionUser } from './session-options';
export {
  KIOSK_COOKIE,
  MFA_PENDING_TTL_MS,
  SESSION_COOKIE,
  kioskSessionOptions,
  sessionOptions,
} from './session-options';

export async function getSession(): Promise<IronSession<AppSession>> {
  return getIronSession<AppSession>(cookies(), sessionOptions());
}

export async function getKioskSession(): Promise<IronSession<KioskSession>> {
  return getIronSession<KioskSession>(cookies(), kioskSessionOptions());
}
