import { afterEach, describe, expect, it } from 'vitest';
import { staffMfaRequired, STAFF_MFA_OFF_VALUE } from './mfaPolicy';

const original = process.env.STAFF_MFA;

afterEach(() => {
  process.env.STAFF_MFA = original;
});

describe('staffMfaRequired', () => {
  it('requires MFA when unset', () => {
    delete process.env.STAFF_MFA;
    expect(staffMfaRequired()).toBe(true);
  });

  /// Anything short of the exact opt-out keeps the second factor, so a stray "false", "0" or
  /// "off" in a deploy config cannot quietly unlock a host.
  it.each(['', 'false', '0', 'off', 'disabled', 'true'])('requires MFA for %o', (value) => {
    process.env.STAFF_MFA = value;
    expect(staffMfaRequired()).toBe(true);
  });

  it('drops the second factor only for the exact synthetic-pilot value', () => {
    process.env.STAFF_MFA = STAFF_MFA_OFF_VALUE;
    expect(staffMfaRequired()).toBe(false);
  });
});
