'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { changePassword, type FormState } from '@/lib/actions/auth';

const initialState: FormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Saving…' : 'Save password'}
    </button>
  );
}

export function PasswordForm() {
  const [state, formAction] = useFormState(changePassword, initialState);

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error ? <p className="field-error">{state.error}</p> : null}
      <div>
        <label className="label" htmlFor="currentPassword">
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          className="input"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="newPassword">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          className="input"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="confirmPassword">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          className="input"
          required
        />
      </div>
      <SubmitButton />
    </form>
  );
}
