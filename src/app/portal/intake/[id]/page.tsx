import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PortalShell } from '@/components/portal/PortalShell';
import { SubmittedIntake } from '@/components/intake/SubmittedIntake';
import { prisma } from '@/lib/db';
import { requirePatient } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import type { IntakeAnswers, IntakeSchema, SignatureValue } from '@/lib/intake/types';

export const dynamic = 'force-dynamic';

export default async function PortalIntakePage({ params }: { params: { id: string } }) {
  const { user, patientId } = await requirePatient();

  /// The patient id comes from the session and is part of the query, so another patient's
  /// submission id simply does not resolve.
  const submission = await prisma.intakeSubmission.findFirst({
    where: { id: params.id, patientId, status: 'SUBMITTED' },
    include: { form: true, patient: true },
  });
  if (!submission) notFound();

  await recordAudit({
    userId: user.id,
    action: 'portal_view_intake',
    entity: 'IntakeSubmission',
    entityId: submission.id,
    patientId,
  });

  const schema = submission.form.schemaJson as unknown as IntakeSchema;

  return (
    <PortalShell name={submission.patient.firstName}>
      <div className="no-print mb-6">
        <Link href="/portal" className="text-sm text-clay-600 hover:underline">
          ← My records
        </Link>
      </div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{schema.title}</h1>
        <p className="mt-1 text-sm text-clay-600">
          Completed {formatDateTime(submission.submittedAt)} · form v{submission.form.version}
        </p>
      </header>

      <SubmittedIntake
        schema={schema}
        answers={submission.answersJson as IntakeAnswers}
        signatures={submission.signatures as Record<string, SignatureValue>}
      />
    </PortalShell>
  );
}
