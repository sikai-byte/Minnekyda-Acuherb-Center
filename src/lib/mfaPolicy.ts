/// Staff MFA is mandatory by default and may only be switched off for a synthetic-data
/// pilot, where the point is to get people clicking rather than to protect anything. The
/// switch is deliberately awkward — an exact env value, announced on the sign-in screen and
/// written to the audit log on every bypassed sign-in — so a host running without a second
/// factor cannot be mistaken for a hardened one. Real patient data must never sit behind it.
export const STAFF_MFA_OFF_VALUE = 'off-synthetic-pilot';

export function staffMfaRequired(): boolean {
  return process.env.STAFF_MFA?.trim() !== STAFF_MFA_OFF_VALUE;
}
