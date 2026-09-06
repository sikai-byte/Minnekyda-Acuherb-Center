'use client';

import { useState, useTransition } from 'react';
import type { Role } from '@prisma/client';
import {
  changeStaffRole,
  resetStaffMfa,
  resetStaffPassword,
  setStaffActive,
  type StaffActionState,
} from '@/lib/actions/staff';
import { formatDateTime } from '@/lib/format';

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  credentials: string | null;
  active: boolean;
  lastLoginAt: Date | null;
  mfaEnabledAt: Date | null;
  mustChangePassword: boolean;
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'PRACTITIONER', label: 'Practitioner' },
  { value: 'FRONT_DESK', label: 'Front desk' },
];

export function StaffTable({ staff, currentUserId }: { staff: StaffRow[]; currentUserId: string }) {
  const [state, setState] = useState<{ id: string; result: StaffActionState } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (id: string, action: () => Promise<StaffActionState>) => {
    startTransition(async () => setState({ id, result: await action() }));
  };

  return (
    <div className="space-y-3">
      {staff.map((member) => {
        const result = state?.id === member.id ? state.result : null;
        const isSelf = member.id === currentUserId;

        return (
          <section key={member.id} className="card">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
              <div className="min-w-48">
                <p className="font-medium">
                  {member.name}
                  {member.credentials ? (
                    <span className="text-clay-500">, {member.credentials}</span>
                  ) : null}
                  {isSelf ? <span className="text-clay-500"> · you</span> : null}
                </p>
                <p className="text-sm text-clay-600">{member.email}</p>
              </div>
              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-clay-600">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-clay-500">Access</dt>
                  <dd>{member.active ? 'Active' : 'Turned off'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-clay-500">Authenticator</dt>
                  <dd>{member.mfaEnabledAt ? 'Set up' : 'Not set up yet'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-clay-500">Last sign-in</dt>
                  <dd>{formatDateTime(member.lastLoginAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-clay-500">Password</dt>
                  <dd>{member.mustChangePassword ? 'One-time, unchanged' : 'Their own'}</dd>
                </div>
              </dl>
              <label className="ml-auto text-sm">
                <span className="label">Role</span>
                <select
                  className="input"
                  value={member.role}
                  disabled={pending || isSelf}
                  onChange={(event) =>
                    run(member.id, () => changeStaffRole(member.id, event.target.value as Role))
                  }
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {result?.error ? <p className="field-error mt-3">{result.error}</p> : null}
            {result?.message ? (
              <p className="mt-3 text-sm text-moss-700">{result.message}</p>
            ) : null}
            {result?.temporaryPassword ? (
              <div className="mt-3 rounded border border-moss-200 bg-moss-50 p-3">
                <p className="text-xs uppercase tracking-wide text-clay-500">
                  One-time password — read it to them now
                </p>
                <p className="mt-1 font-mono text-lg">{result.temporaryPassword}</p>
                <p className="mt-1 text-xs text-clay-600">
                  It is not shown again and must be changed at their next sign-in.
                  {result.emailed
                    ? ' We have also emailed it to them.'
                    : ' Email is not going out, so pass it on yourself.'}
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => run(member.id, () => resetStaffPassword(member.id))}
              >
                Reset password
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={pending || !member.mfaEnabledAt}
                onClick={() => run(member.id, () => resetStaffMfa(member.id))}
              >
                Reset authenticator
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={pending || isSelf}
                onClick={() => run(member.id, () => setStaffActive(member.id, !member.active))}
              >
                {member.active ? 'Turn off access' : 'Turn access back on'}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
