import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/// Authorization is enforced server-side, so it must be impossible to add a page or a
/// server action that reads PHI without a guard. Hidden navigation is not a control: this
/// test fails the build if a new file forgets `requireUser` / `requireRole` and friends.

const SRC = path.join(__dirname, '..');
const APP = path.join(SRC, 'app');
const ACTIONS = path.join(SRC, 'lib', 'actions');

const GUARDS = /require(User|Role|IntakeAccess|UserPendingPasswordChange|Patient)\s*\(/;

/// Only these may render without a session, and each is either a sign-in step or a
/// pre-authentication screen that reads no patient data.
const UNAUTHENTICATED_PAGES = new Set([
  'login/page.tsx',
  'login/mfa/page.tsx',
  'login/mfa/setup/page.tsx',
  /// The public booking site. It reads no chart, and the checks below hold it to that.
  'book/page.tsx',
]);

/// Sign-in, sign-out and public booking are unauthenticated by design; everything else in
/// `lib/actions` needs a guard.
const UNAUTHENTICATED_ACTIONS = new Set(['auth.ts', 'publicBooking.ts']);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe('deny-by-default authorization', () => {
  const pages = walk(APP).filter((file) => /\/(page|route)\.tsx?$/.test(file));

  it('finds the app routes', () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it.each(pages)('%s guards its session', (file) => {
    const relative = path.relative(APP, file);
    if (UNAUTHENTICATED_PAGES.has(relative)) return;
    expect(readFileSync(file, 'utf8')).toMatch(GUARDS);
  });

  const actionFiles = readdirSync(ACTIONS).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
  );

  it.each(actionFiles)('lib/actions/%s guards every exported action', (file) => {
    if (UNAUTHENTICATED_ACTIONS.has(file)) return;
    const source = readFileSync(path.join(ACTIONS, file), 'utf8');
    const bodies = source.split(/^export async function /m).slice(1);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      const name = body.slice(0, body.indexOf('('));
      /// `exitKiosk` only tears the kiosk token down; it reads nothing.
      if (name === 'exitKiosk') continue;
      expect(body, name).toMatch(GUARDS);
    }
  });

  /// The portal is the one place a non-staff session can read data, so it must never be
  /// guarded by the staff helper: `requirePatient` is what pins the query to one patient.
  const portalFiles = [
    ...walk(path.join(APP, 'portal')),
    path.join(ACTIONS, 'portal.ts'),
    path.join(ACTIONS, 'portalBooking.ts'),
  ].filter((file) => /\.tsx?$/.test(file));

  it.each(portalFiles)('%s is scoped to the signed-in patient', (file) => {
    const source = readFileSync(file, 'utf8');
    if (/'use client'/.test(source)) return;
    expect(source).toMatch(/requirePatient\s*\(/);
    expect(source).not.toMatch(/requireUser\s*\(/);
  });

  /// Note text is released through the clinic's records process, never through the portal.
  const NOTE_TEXT_FIELDS = [
    'subjective',
    'objective',
    'assessment',
    'plan',
    'tcmDiagnosis',
    'chiefComplaint',
    'herbs',
    'points',
  ];

  it.each(portalFiles)('%s exposes no clinical note text', (file) => {
    const source = readFileSync(file, 'utf8');
    for (const field of NOTE_TEXT_FIELDS) {
      expect(source, field).not.toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  /// Patient names must not travel in a URL, where they would land in every access log
  /// between the browser and us. Search is a posted server action instead.
  it.each(pages)('%s takes no search term from the query string', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/searchParams\.q\b/);
    expect(source).not.toMatch(/\bq\?:\s*string/);
  });

  it('keeps the middleware allow-list to sign-in screens only', () => {
    const source = readFileSync(path.join(SRC, 'middleware.ts'), 'utf8');
    const list = source.match(/const PUBLIC_PATHS = \[([^\]]*)\]/)?.[1] ?? '';
    const paths = (list.match(/'[^']+'/g) ?? []).map((quoted) => quoted.slice(1, -1));
    expect(paths).toEqual(['/login', '/login/mfa', '/login/mfa/setup']);
  });

  /// Public booking widens the unauthenticated surface, so the list of pages it opens is
  /// pinned here too: a new page cannot join it without this test being changed on purpose.
  it('keeps the public booking allow-list to the booking page', () => {
    const source = readFileSync(path.join(SRC, 'middleware.ts'), 'utf8');
    const list = source.match(/const PUBLIC_BOOKING_PATHS = \[([^\]]*)\]/)?.[1] ?? '';
    const paths = (list.match(/'[^']+'/g) ?? []).map((quoted) => quoted.slice(1, -1));
    expect(paths).toEqual(['/book']);
  });
});
