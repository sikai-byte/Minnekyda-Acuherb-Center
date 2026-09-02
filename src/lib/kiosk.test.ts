import { describe, expect, it } from 'vitest';
import { kioskAllowsPath, kioskPath } from './kiosk';

/// The patient-held iPad carries a token scoped to one intake. These are the paths an
/// adversarial patient would try from the address bar; only their own intake may pass.
describe('kiosk containment', () => {
  const own = 'sub_own';
  const other = 'sub_other';

  it('allows only its own intake path', () => {
    expect(kioskAllowsPath(own, kioskPath(own))).toBe(true);
  });

  it.each([
    '/',
    '/patients',
    `/patients/${other}`,
    '/patients/new',
    '/admin/audit',
    '/notes/note_1',
    '/kiosk',
    `/intake/${other}`,
    `/intake/${own}/view`,
    `/intake/${own}/../${other}`,
    `/intake/${own}extra`,
    `/intake/${own}/`,
    `/INTAKE/${own}`,
  ])('refuses %s', (pathname) => {
    expect(kioskAllowsPath(own, pathname)).toBe(false);
  });
});
