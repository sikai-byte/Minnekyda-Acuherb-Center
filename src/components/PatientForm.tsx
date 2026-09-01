'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { Patient } from '@prisma/client';
import type { PatientFormState } from '@/lib/actions/patients';
import { formatDateInput } from '@/lib/format';

const initialState: PatientFormState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}

type Props = {
  action: (prev: PatientFormState, formData: FormData) => Promise<PatientFormState>;
  patient?: Patient;
  submitLabel: string;
};

export function PatientForm({ action, patient, submitLabel }: Props) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="card space-y-5">
      {state.error ? <p className="field-error">{state.error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="firstName" label="First name" defaultValue={patient?.firstName} required />
        <Field name="lastName" label="Last name" defaultValue={patient?.lastName} required />
        <Field
          name="dateOfBirth"
          label="Date of birth"
          type="date"
          defaultValue={formatDateInput(patient?.dateOfBirth)}
        />
        <div>
          <label className="label" htmlFor="sex">
            Sex
          </label>
          <select id="sex" name="sex" className="input" defaultValue={patient?.sex ?? 'UNDISCLOSED'}>
            <option value="UNDISCLOSED">Prefer not to say</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <Field name="phone" label="Phone" type="tel" defaultValue={patient?.phone ?? ''} />
        <Field name="email" label="Email" type="email" defaultValue={patient?.email ?? ''} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field name="streetAddress" label="Street address" defaultValue={patient?.streetAddress ?? ''} />
        </div>
        <Field name="city" label="City" defaultValue={patient?.city ?? ''} />
        <div className="grid grid-cols-2 gap-4">
          <Field name="state" label="State" defaultValue={patient?.state ?? ''} />
          <Field name="zip" label="Zip" defaultValue={patient?.zip ?? ''} />
        </div>
        <Field name="occupation" label="Occupation" defaultValue={patient?.occupation ?? ''} />
        <Field
          name="primaryPhysician"
          label="Primary physician / clinic"
          defaultValue={patient?.primaryPhysician ?? ''}
        />
        <Field name="emergencyName" label="Emergency contact" defaultValue={patient?.emergencyName ?? ''} />
        <Field
          name="emergencyPhone"
          label="Emergency contact phone"
          type="tel"
          defaultValue={patient?.emergencyPhone ?? ''}
        />
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}

function Field({
  name,
  label,
  type = 'text',
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
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
        className="input"
        defaultValue={defaultValue}
        required={required}
      />
    </div>
  );
}
