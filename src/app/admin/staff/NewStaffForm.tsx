'use client';

import { useState, useTransition } from 'react';
import { createStaffAccount, type StaffActionState } from '@/lib/actions/staff';

export function NewStaffForm() {
  const [state, setState] = useState<StaffActionState>({});
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        Add a staff member
      </button>
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
