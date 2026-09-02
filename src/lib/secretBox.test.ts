import { beforeAll, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, isEncrypted } from './secretBox';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('TOTP secret encryption', () => {
  beforeAll(() => {
    process.env.MFA_ENCRYPTION_KEY = KEY;
  });

  it('round-trips a secret without storing it in the clear', () => {
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const stored = encryptSecret(secret);
    expect(stored).not.toContain(secret);
    expect(isEncrypted(stored)).toBe(true);
    expect(decryptSecret(stored)).toBe(secret);
  });

  it('uses a fresh nonce for every write', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('reads back a secret written before encryption existed', () => {
    expect(isEncrypted('JBSWY3DPEHPK3PXP')).toBe(false);
    expect(decryptSecret('JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('refuses a tampered ciphertext instead of returning garbage', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP');
    const [version, iv, tag, ciphertext] = stored.split(':');
    const flipped = Buffer.from(ciphertext, 'base64');
    flipped[0] ^= 0xff;
    expect(() =>
      decryptSecret([version, iv, tag, flipped.toString('base64')].join(':')),
    ).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64');
    expect(() => encryptSecret('x')).toThrow(/32 bytes/);
    process.env.MFA_ENCRYPTION_KEY = KEY;
  });
});
