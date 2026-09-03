'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { BrandLockup, BrandMark } from '@/components/Brand';
import { SignaturePad } from '@/components/SignaturePad';
import { exitKiosk, saveIntake } from '@/lib/actions/intake';
import type { IntakeAnswers, IntakeField, IntakeSchema, SignatureValue } from '@/lib/intake/types';
import { isCheckboxGridValue } from '@/lib/intake/types';

type Props = {
  submissionId: string;
  patientLabel: string;
  schema: IntakeSchema;
  initialAnswers: IntakeAnswers;
  initialSignatures: Record<string, SignatureValue>;
};

const WIDTH_CLASS = {
  full: 'sm:col-span-6',
  half: 'sm:col-span-3',
  third: 'sm:col-span-2',
} as const;

export function IntakeWizard({
  submissionId,
  patientLabel,
  schema,
  initialAnswers,
  initialSignatures,
}: Props) {
  const [answers, setAnswers] = useState<IntakeAnswers>({ ...initialAnswers, ...initialSignatures });
  const [sectionIndex, setSectionIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const section = schema.sections[sectionIndex];
  const isLast = sectionIndex === schema.sections.length - 1;
  const progress = useMemo(
    () => Math.round(((sectionIndex + 1) / schema.sections.length) * 100),
    [sectionIndex, schema.sections.length],
  );

  const setValue = useCallback((key: string, value: unknown) => {
    setAnswers((previous) => {
      if (value === null || value === undefined) {
        const next = { ...previous };
        delete next[key];
        return next;
      }
      return { ...previous, [key]: value };
    });
  }, []);

  const persist = (submit: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await saveIntake(submissionId, answers, submit);
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong saving your answers');
        return;
      }
      if (submit) {
        setDone(true);
        return;
      }
      setSectionIndex((index) => Math.min(index + 1, schema.sections.length - 1));
      window.scrollTo({ top: 0 });
    });
  };

  if (done) {
    return (
      <div className="card mx-auto flex max-w-lg flex-col items-center text-center">
        <BrandLockup width={200} className="mb-6" />
        <h1 className="text-2xl font-semibold">Thank you</h1>
        <p className="mt-2 text-clay-600">
          Your intake form has been submitted. Please hand the iPad back to the front desk.
        </p>
        <form action={exitKiosk} className="mt-6">
          <button type="submit" className="btn-primary">
            Done
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <div className="mb-6">
        <p className="flex items-center gap-2 text-sm text-clay-500">
          <BrandMark height={22} />
          {schema.title} · {patientLabel}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{section.title}</h1>
        {section.description ? <p className="mt-1 text-sm text-clay-600">{section.description}</p> : null}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-clay-200">
          <div className="h-full rounded-full bg-moss-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1 text-xs text-clay-500">
          Step {sectionIndex + 1} of {schema.sections.length}
        </p>
      </div>

      <div className="card grid gap-5 sm:grid-cols-6">
        {section.fields.map((field) => (
          <div key={field.key} className={fieldClass(field)}>
            <FieldInput field={field} value={answers[field.key]} onChange={setValue} />
          </div>
        ))}
      </div>

      {error ? <p className="field-error mt-4">{error}</p> : null}

      <div className="fixed inset-x-0 bottom-0 border-t border-clay-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={sectionIndex === 0 || pending}
            onClick={() => {
              setSectionIndex((index) => Math.max(index - 1, 0));
              window.scrollTo({ top: 0 });
            }}
          >
            Back
          </button>
          <button type="button" className="btn-primary" disabled={pending} onClick={() => persist(isLast)}>
            {pending ? 'Saving…' : isLast ? 'Submit intake' : 'Save and continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function fieldClass(field: IntakeField): string {
  if (field.type === 'consent' || field.type === 'signature' || field.type === 'initials') {
    return WIDTH_CLASS.full;
  }
  return WIDTH_CLASS[field.width ?? 'full'];
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: IntakeField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  switch (field.type) {
    case 'text':
    case 'tel':
    case 'email':
    case 'date':
      return (
        <label className="block">
          <span className="label">
            {field.label}
            {field.required ? <span className="text-red-600"> *</span> : null}
          </span>
          <input
            type={field.type}
            className="input"
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder}
            onChange={(event) => onChange(field.key, event.target.value)}
          />
        </label>
      );

    case 'textarea':
      return (
        <label className="block">
          <span className="label">
            {field.label}
            {field.required ? <span className="text-red-600"> *</span> : null}
          </span>
          <textarea
            rows={3}
            className="input"
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(field.key, event.target.value)}
          />
        </label>
      );

    case 'radio':
      return (
        <fieldset>
          <legend className="label">{field.label}</legend>
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => {
              const selected = value === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChange(field.key, selected ? null : option)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    selected
                      ? 'border-moss-600 bg-moss-600 text-white'
                      : 'border-clay-300 bg-white text-clay-700 hover:bg-clay-50'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </fieldset>
      );

    case 'checkboxGrid': {
      const current = isCheckboxGridValue(value) ? value : { selected: [], notes: {} };
      const toggle = (option: string) => {
        const selected = current.selected.includes(option)
          ? current.selected.filter((item) => item !== option)
          : [...current.selected, option];
        const notes = { ...(current.notes ?? {}) };
        if (!selected.includes(option)) delete notes[option];
        onChange(field.key, { selected, notes });
      };

      return (
        <fieldset>
          {field.label ? <legend className="label">{field.label}</legend> : null}
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => {
              const selected = current.selected.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggle(option)}
                  className={`rounded-full border px-3.5 py-2 text-sm transition ${
                    selected
                      ? 'border-moss-600 bg-moss-600 text-white'
                      : 'border-clay-300 bg-white text-clay-700 hover:bg-clay-50'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
          {field.withNotes && current.selected.length > 0 ? (
            <div className="mt-4 space-y-2">
              {current.selected.map((option) => (
                <label key={option} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-40 text-clay-700">{option}</span>
                  <input
                    className="input flex-1"
                    placeholder="Dates or details"
                    value={current.notes?.[option] ?? ''}
                    onChange={(event) =>
                      onChange(field.key, {
                        selected: current.selected,
                        notes: { ...(current.notes ?? {}), [option]: event.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>
      );
    }

    case 'consent':
      return (
        <div>
          <h2 className="text-base font-semibold text-clay-900">{field.label}</h2>
          <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-line rounded-lg border border-clay-200 bg-clay-50 p-4 text-sm leading-relaxed text-clay-800">
            {field.body}
          </div>
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 rounded border-clay-300"
              checked={value === true}
              onChange={(event) => onChange(field.key, event.target.checked ? true : null)}
            />
            <span className="text-clay-700">{field.acknowledgement}</span>
          </label>
        </div>
      );

    case 'initials':
      return (
        <label className="block">
          <span className="label">{field.label}</span>
          <input
            className="input max-w-[8rem] uppercase tracking-widest"
            maxLength={4}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(field.key, event.target.value.toUpperCase())}
          />
        </label>
      );

    case 'signature': {
      const signature = isSignature(value) ? value : null;
      return (
        <div>
          <span className="label">{field.label}</span>
          <SignaturePad
            value={signature?.dataUrl}
            onChange={(dataUrl) =>
              onChange(
                field.key,
                dataUrl ? { dataUrl, signedAt: new Date().toISOString() } : null,
              )
            }
          />
        </div>
      );
    }

    default:
      return null;
  }
}

function isSignature(value: unknown): value is SignatureValue {
  return typeof value === 'object' && value !== null && typeof (value as SignatureValue).dataUrl === 'string';
}
