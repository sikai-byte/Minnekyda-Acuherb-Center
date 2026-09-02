import { notFound, redirect } from 'next/navigation';
import { IntakeWizard } from '@/components/intake/IntakeWizard';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { patientName } from '@/lib/format';
import type { IntakeAnswers, IntakeSchema, SignatureValue } from '@/lib/intake/types';

export const dynamic = 'force-dynamic';

/// Kiosk screen handed to the patient: intentionally rendered without the staff nav so
/// there is no path from the iPad into any other patient's chart.
export default async function IntakePage({ params }: { params: { id: string } }) {
  await requireUser();

  const submission = await prisma.intakeSubmission.findUnique({
    where: { id: params.id },
    include: { form: true, patient: true },
  });
  if (!submission) notFound();
  if (submission.status === 'SUBMITTED') redirect(`/intake/${submission.id}/view`);

  return (
    <div className="min-h-screen px-4 py-8">
      <IntakeWizard
        submissionId={submission.id}
        patientLabel={patientName(submission.patient)}
        schema={submission.form.schemaJson as unknown as IntakeSchema}
        initialAnswers={submission.answersJson as IntakeAnswers}
        initialSignatures={submission.signatures as Record<string, SignatureValue>}
      />
    </div>
  );
}
