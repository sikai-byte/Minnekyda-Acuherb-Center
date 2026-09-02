import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { formatDateTime, patientName } from '@/lib/format';
import type { IntakeAnswers, IntakeSchema, SignatureValue } from '@/lib/intake/types';
import { isCheckboxGridValue } from '@/lib/intake/types';

export const dynamic = 'force-dynamic';

export default async function IntakeViewPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const submission = await prisma.intakeSubmission.findUnique({
    where: { id: params.id },
    include: { form: true, patient: true },
  });
  if (!submission) notFound();

  await recordAudit({
    userId: user.id,
    action: 'view_intake',
    entity: 'IntakeSubmission',
    entityId: submission.id,
    patientId: submission.patientId,
  });

  const schema = submission.form.schemaJson as unknown as IntakeSchema;
  const answers = submission.answersJson as IntakeAnswers;
  const signatures = submission.signatures as Record<string, SignatureValue>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="no-print mb-6 flex items-center justify-between">
        <Link href={`/patients/${submission.patientId}`} className="text-sm text-clay-600 hover:underline">
          ← {patientName(submission.patient)}
        </Link>
        <p className="text-sm text-clay-500">Print with your browser to file or share this intake.</p>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{schema.title}</h1>
        <p className="mt-1 text-sm text-clay-600">
          {patientName(submission.patient)} · form v{submission.form.version} ·{' '}
          {submission.status === 'SUBMITTED'
            ? `submitted ${formatDateTime(submission.submittedAt)}`
            : 'in progress'}
        </p>
      </header>

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
