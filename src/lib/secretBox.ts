import crypto from 'node:crypto';

/// A TOTP secret is a bearer credential: with it, a stolen database dump is a working second
/// factor. Secrets are therefore encrypted with AES-256-GCM before they are stored, and only
/// decrypted to verify a code.
///
/// KMS-ready by design: the data key is read from `MFA_ENCRYPTION_KEY` on every call, so in
/// production that variable holds a data key decrypted from Cloud KMS at boot (or is replaced
/// with a KMS `decrypt` call here) without any change to callers or to the stored format. The
/// version prefix leaves room for a second key during rotation.

const VERSION = 'v1';

function dataKey(): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, 'base64');
    if (key.length !== 32) {
      throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
    }
    return key;
  }
  /// Development and the synthetic-data pilot: derive a key rather than store secrets in the
  /// clear. Production sets its own key so that rotating the session secret cannot lock every
  /// authenticator out.
  const fallback = process.env.SESSION_SECRET;
  if (!fallback) throw new Error('MFA_ENCRYPTION_KEY or SESSION_SECRET must be set');
  return crypto.scryptSync(fallback, 'minnekyda/mfa', 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/// Accepts a secret written before encryption existed and returns it unchanged, so enrolled
/// staff are not locked out by the upgrade. Such a secret is rewritten encrypted on next use.
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const [, iv, tag, ciphertext] = stored.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(`${VERSION}:`) && stored.split(':').length === 4;
}
