import Image from 'next/image';
import { formatDateTime } from '@/lib/format';
import type { IntakeAnswers, IntakeSchema, SignatureValue } from '@/lib/intake/types';
import { isCheckboxGridValue } from '@/lib/intake/types';

/// Read-only rendering of a submission, shared by the staff review page and the patient
/// portal so the two can never drift into showing different content.
export function SubmittedIntake({
  schema,
  answers,
  signatures,
}: {
  schema: IntakeSchema;
  answers: IntakeAnswers;
  signatures: Record<string, SignatureValue>;
}) {
  return (
    <div className="space-y-6">
      {schema.sections.map((section) => {
        const rows = section.fields
          .filter((field) => field.type !== 'consent' && field.type !== 'signature')
          .map((field) => ({ field, value: answers[field.key] }))
          .filter(({ value }) => hasValue(value));

        const consents = section.fields.filter((field) => field.type === 'consent');
        const sectionSignatures = section.fields.filter((field) => field.type === 'signature');

        if (rows.length === 0 && consents.length === 0 && sectionSignatures.length === 0) return null;

        return (
          <section key={section.key} className="card break-inside-avoid">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-clay-500">
              {section.title}
            </h2>

            {rows.length > 0 ? (
              <dl className="space-y-3 text-sm">
                {rows.map(({ field, value }) => (
                  <div key={field.key}>
                    <dt className="text-xs uppercase tracking-wide text-clay-500">
                      {'label' in field && field.label ? field.label : section.title}
                    </dt>
                    <dd className="whitespace-pre-line text-clay-800">{renderValue(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {consents.map((field) => (
              <p key={field.key} className="mt-3 text-sm text-clay-700">
                {answers[field.key] === true ? '✓ Agreed to' : '✗ Not agreed to'}{' '}
                {'label' in field ? field.label : 'agreement'}
              </p>
            ))}

            {sectionSignatures.map((field) => {
              const signature = signatures[field.key];
              if (!signature) return null;
              return (
                <div key={field.key} className="mt-4">
                  <p className="text-xs uppercase tracking-wide text-clay-500">
                    {'label' in field ? field.label : 'Signature'}
                  </p>
                  <Image
                    src={signature.dataUrl}
                    alt="Patient signature"
                    width={480}
                    height={140}
                    unoptimized
                    className="mt-1 h-28 w-auto rounded border border-clay-200 bg-white"
                  />
                  <p className="mt-1 text-xs text-clay-500">Signed {formatDateTime(signature.signedAt)}</p>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (isCheckboxGridValue(value)) return value.selected.length > 0;
  return true;
}

function renderValue(value: unknown): string {
  if (isCheckboxGridValue(value)) {
    return value.selected
      .map((item) => {
        const note = value.notes?.[item];
        return note ? `${item} (${note})` : item;
      })
      .join(', ');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
