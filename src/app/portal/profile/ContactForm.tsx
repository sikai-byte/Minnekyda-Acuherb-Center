'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateMyContactDetails, type ContactFormState } from '@/lib/actions/portal';

const initialState: ContactFormState = {};

type Contact = {
  phone: string | null;
  email: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

export function ContactForm({ contact }: { contact: Contact }) {
  const [state, formAction] = useFormState(updateMyContactDetails, initialState);

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error ? <p className="field-error">{state.error}</p> : null}
      {state?.saved ? <p className="text-sm text-moss-700">Saved. Thank you.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="phone" label="Phone" type="tel" defaultValue={contact.phone} />
        <Field name="email" label="Email" type="email" defaultValue={contact.email} />
      </div>
      <Field name="streetAddress" label="Street address" defaultValue={contact.streetAddress} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="city" label="City" defaultValue={contact.city} />
        <Field name="state" label="State" defaultValue={contact.state} />
        <Field name="zip" label="ZIP" defaultValue={contact.zip} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="emergencyName" label="Emergency contact" defaultValue={contact.emergencyName} />
        <Field
          name="emergencyPhone"
          label="Emergency phone"
          type="tel"
          defaultValue={contact.emergencyPhone}
        />
      </div>
      <SubmitButton />
    </form>
  );
}

function Field({
  name,
  label,
  type = 'text',
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue: string | null;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        className="input"
        inputMode={type === 'tel' ? 'tel' : undefined}
      />
    </div>
  );
}
