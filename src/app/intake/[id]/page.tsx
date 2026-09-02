import { notFound, redirect } from 'next/navigation';
import { IntakeWizard } from '@/components/intake/IntakeWizard';
import { KioskDone } from '@/components/intake/KioskDone';
import { prisma } from '@/lib/db';
import { requireIntakeAccess } from '@/lib/auth';
import { patientName } from '@/lib/format';
import type { IntakeAnswers, IntakeSchema, SignatureValue } from '@/lib/intake/types';

export const dynamic = 'force-dynamic';

/// Kiosk screen handed to the patient. The device carries a submission-scoped kiosk token
/// rather than a staff session (see `startIntake`), and `src/middleware.ts` refuses every
/// other route for that token — so the address bar is not a way into another chart.
export default async function IntakePage({ params }: { params: { id: string } }) {
  const access = await requireIntakeAccess(params.id);

  const submission = await prisma.intakeSubmission.findUnique({
    where: { id: params.id },
    include: { form: true, patient: true },
  });
  if (!submission) notFound();

  if (submission.status === 'SUBMITTED') {
    /// Staff reviewing paperwork go to the read-only copy; a patient reloading the iPad
    /// after submitting sees the hand-back screen instead of the chart.
    if (access.kind === 'staff') redirect(`/intake/${submission.id}/view`);
    return <KioskDone />;
  }

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
