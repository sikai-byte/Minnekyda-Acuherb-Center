/// Minimum password strength for staff accounts. Kept free of database and request imports
/// so it can be unit tested and reused by any future account-management screen.
export function passwordPolicyError(password: string): string | null {
  if (password.length < 12) return 'Use at least 12 characters';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return 'Use both upper and lower case letters';
  }
  if (!/\d/.test(password)) return 'Include at least one number';
  return null;
}
