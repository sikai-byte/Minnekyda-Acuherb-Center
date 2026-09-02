'use client';

import { useState, useTransition } from 'react';
import { createStaffAccount, type StaffActionState } from '@/lib/actions/staff';

export function NewStaffForm() {
  const [state, setState] = useState<StaffActionState>({});
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="space-y-3">
        {state.temporaryPassword ? (
          <div className="rounded border border-moss-300 bg-moss-50 p-4">
            <p className="text-sm font-medium text-moss-800">
              One-time password — read it to them now
            </p>
            <p className="mt-1 font-mono text-lg">{state.temporaryPassword}</p>
            <p className="mt-1 text-sm text-clay-600">
              It is not shown again. They must change it and set up an authenticator app the
              first time they sign in.
            </p>
            <button
              type="button"
              className="btn-ghost mt-3"
              onClick={() => setState({})}
            >
              Done
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setState({});
            setOpen(true);
          }}
        >
          Add a staff member
        </button>
      </div>
    );
  }

  return (
    <form
      className="card space-y-4"
      action={(formData) =>
        startTransition(async () => {
          const result = await createStaffAccount(formData);
          setState(result);
          if (result.temporaryPassword) setOpen(false);
        })
      }
    >
      {state.error ? <p className="field-error">{state.error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" name="name" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email — this is their username
          </label>
          <input id="email" name="email" type="email" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="role">
            Role
          </label>
          <select id="role" name="role" className="input" defaultValue="FRONT_DESK">
            <option value="FRONT_DESK">Front desk — paperwork only, no notes</option>
            <option value="PRACTITIONER">Practitioner — charts and notes</option>
            <option value="ADMIN">Admin — everything, including the audit log</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="credentials">
            Credentials <span className="text-clay-500">(optional)</span>
          </label>
          <input id="credentials" name="credentials" className="input" placeholder="L.Ac., Dipl.O.M." />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Creating…' : 'Create login'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
