import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/// Authorization is enforced server-side, so it must be impossible to add a page or a
/// server action that reads PHI without a guard. Hidden navigation is not a control: this
/// test fails the build if a new file forgets `requireUser` / `requireRole` and friends.

const SRC = path.join(__dirname, '..');
const APP = path.join(SRC, 'app');
const ACTIONS = path.join(SRC, 'lib', 'actions');

const GUARDS = /require(User|Role|IntakeAccess|UserPendingPasswordChange)\s*\(/;

/// Only these may render without a session, and each is either a sign-in step or a
/// pre-authentication screen that reads no patient data.
const UNAUTHENTICATED_PAGES = new Set([
  'login/page.tsx',
  'login/mfa/page.tsx',
  'login/mfa/setup/page.tsx',
]);

/// Sign-in and sign-out are the guards; everything else in `lib/actions` needs one.
const UNAUTHENTICATED_ACTIONS = new Set(['auth.ts']);

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

  it('keeps the middleware allow-list to sign-in screens only', () => {
    const source = readFileSync(path.join(SRC, 'middleware.ts'), 'utf8');
    const list = source.match(/const PUBLIC_PATHS = \[([^\]]*)\]/)?.[1] ?? '';
    const paths = (list.match(/'[^']+'/g) ?? []).map((quoted) => quoted.slice(1, -1));
    expect(paths).toEqual(['/login', '/login/mfa', '/login/mfa/setup']);
  });
});
