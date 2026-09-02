import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';

const ISSUER = 'Minnekyda Acuherb Center';
const RECOVERY_CODE_COUNT = 8;

function totp(secret: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function otpauthUri(secret: string, email: string): string {
  return totp(secret, email).toString();
}

/// A one-step window either side absorbs clock skew between the phone and the server
/// without materially widening the guessing window.
export function verifyTotp(secret: string, token: string): boolean {
  const cleaned = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  return totp(secret, 'verify').validate({ token: cleaned, window: 1 }) !== null;
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    randomBytes(5).toString('hex').replace(/(.{4})(.{6})/, '$1-$2'),
  );
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
}

/// Returns the remaining hashes with the used code removed, or null when no code matches.
export async function consumeRecoveryCode(
  hashes: string[],
  candidate: string,
): Promise<string[] | null> {
  const cleaned = candidate.trim().toLowerCase();
  for (const hash of hashes) {
    if (await bcrypt.compare(cleaned, hash)) {
      return hashes.filter((item) => item !== hash);
    }
  }
  return null;
}
