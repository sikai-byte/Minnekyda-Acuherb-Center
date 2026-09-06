'use client';

import { useState, useTransition } from 'react';
import {
  grantPortalAccess,
  revokePortalAccess,
  type PortalAccessState,
} from '@/lib/actions/portalAccess';

type Account = { email: string; active: boolean; lastLoginAt: Date | null } | null;

export function PortalAccessCard({
  patientId,
  account,
  patientEmail,
}: {
  patientId: string;
  account: Account;
  patientEmail: string | null;
}) {
  const [state, setState] = useState<PortalAccessState>({});
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<PortalAccessState>) => {
    startTransition(async () => setState(await action()));
  };

  const live = account?.active ?? false;

  return (
    <section className="card">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-clay-500">
        Patient portal
      </h2>

      <p className="text-sm text-clay-700">
        {live
          ? `Signs in as ${account?.email}.`
          : account
            ? `Turned off. Previously signed in as ${account.email}.`
            : patientEmail
              ? `Give this patient a login for ${patientEmail} so they can read their own paperwork.`
              : 'Add an email address to this chart to give the patient a login.'}
      </p>

      {state.error ? <p className="field-error mt-3">{state.error}</p> : null}
      {state.message ? <p className="mt-3 text-sm text-moss-700">{state.message}</p> : null}

      {state.temporaryPassword ? (
        <div className="mt-3 rounded border border-moss-200 bg-moss-50 p-3">
          <p className="text-xs uppercase tracking-wide text-clay-500">
            One-time password — read it to the patient now
          </p>
          <p className="mt-1 font-mono text-lg">{state.temporaryPassword}</p>
          <p className="mt-1 text-xs text-clay-600">
            It is not shown again and must be changed the first time they sign in.
            {state.emailed
              ? ' We have also emailed it to them.'
              : ' Email is not going out, so read it to them.'}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending || !patientEmail}
          onClick={() => run(() => grantPortalAccess(patientId))}
        >
          {live ? 'Reset portal password' : account ? 'Turn access back on' : 'Create portal login'}
        </button>
        {live ? (
          <button
            type="button"
            className="btn-ghost"
            disabled={pending}
            onClick={() => run(() => revokePortalAccess(patientId))}
          >
            Turn off access
          </button>
        ) : null}
      </div>
    </section>
  );
}
