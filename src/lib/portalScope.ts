/// A patient login exists only to read its own record, so the middleware refuses every
/// path outside the portal (plus the password screen, which patients need too). Kept
/// separate from the middleware so it can be unit-tested against hostile paths.
export const PATIENT_PREFIXES = ['/portal', '/account/password'];

export function patientAllowsPath(pathname: string): boolean {
  return PATIENT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
