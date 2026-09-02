import { describe, expect, it } from 'vitest';
import { patientAllowsPath } from './portalScope';

describe('patient session path scope', () => {
  it.each(['/portal', '/portal/profile', '/portal/intake/abc123', '/account/password'])(
    'allows %s',
    (pathname) => {
      expect(patientAllowsPath(pathname)).toBe(true);
    },
  );

  it.each([
    '/',
    '/patients',
    '/patients/other-patient-id',
    '/patients/other-patient-id/notes/new',
    '/notes/some-note-id',
    '/admin/audit',
    '/kiosk',
    '/intake/some-submission-id',
    '/intake/some-submission-id/view',
    /// Prefix look-alikes must not slip through a `startsWith` check.
    '/portalx',
    '/portal-admin',
    '/account/passwordless',
    '/patients/../admin/audit',
  ])('refuses %s', (pathname) => {
    expect(patientAllowsPath(pathname)).toBe(false);
  });
});
