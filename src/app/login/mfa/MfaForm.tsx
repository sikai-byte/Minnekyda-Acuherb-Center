'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { verifyMfa, type FormState } from '@/lib/actions/auth';

const initialState: FormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Verifying…' : 'Verify'}
    </button>
  );
}

export function MfaForm() {
  const [state, formAction] = useFormState(verifyMfa, initialState);

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error ? <p className="field-error">{state.error}</p> : null}
      <div>
        <label className="label" htmlFor="code">
          Authentication code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="input tracking-widest"
          placeholder="123456"
          required
        />
        <p className="mt-2 text-xs text-clay-500">
          Lost your phone? Enter one of your recovery codes instead.
        </p>
      </div>
      <SubmitButton />
    </form>
  );
}
