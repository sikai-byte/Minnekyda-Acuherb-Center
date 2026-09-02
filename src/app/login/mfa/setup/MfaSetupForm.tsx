'use client';

import Image from 'next/image';
import { useFormState, useFormStatus } from 'react-dom';
import { confirmMfaEnrollment, finishMfaEnrollment, type EnrollState } from '@/lib/actions/auth';

const initialState: EnrollState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Working…' : label}
    </button>
  );
}

export function MfaSetupForm({ qrDataUrl, secret }: { qrDataUrl: string; secret: string }) {
  const [state, formAction] = useFormState(confirmMfaEnrollment, initialState);

  if (state?.recoveryCodes) {
    return (
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Save your recovery codes</h2>
          <p className="mt-1 text-sm text-clay-600">
            Each code works once if you lose your phone. Print them or put them in your password
            manager — they are not shown again.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-2 rounded border border-clay-200 bg-clay-50 p-3 font-mono text-sm">
          {state.recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <form action={finishMfaEnrollment}>
          <SubmitButton label="I saved them — continue" />
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error ? <p className="field-error">{state.error}</p> : null}
      <Image
        src={qrDataUrl}
        alt="Two-step verification QR code"
        width={220}
        height={220}
        unoptimized
        className="mx-auto rounded bg-white"
      />
      <p className="text-center text-xs text-clay-500">
        Can&apos;t scan? Enter this key manually: <span className="font-mono">{secret}</span>
      </p>
      <div>
        <label className="label" htmlFor="code">
          Code from your app
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="input tracking-widest"
          placeholder="123456"
          required
        />
      </div>
      <SubmitButton label="Turn on two-step verification" />
    </form>
  );
}
