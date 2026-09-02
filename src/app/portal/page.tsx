import Link from 'next/link';
import { PortalShell } from '@/components/portal/PortalShell';
import { prisma } from '@/lib/db';
import { requirePatient } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { formatDate, formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

/// Clinical note content never reaches the portal: patients see that a visit happened and
/// who they saw, and the chart itself is released through the clinic's records process.
/// The query below selects no note text, so there is nothing to leak even in the payload.

export default async function PortalHomePage() {
  const { user, patientId } = await requirePatient();

  const [patient, intakes, visits] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId } }),
    prisma.intakeSubmission.findMany({
      where: { patientId, status: 'SUBMITTED' },
      orderBy: { submittedAt: 'desc' },
      include: { form: true },
    }),
    prisma.clinicalNote.findMany({
      where: { patientId, status: 'SIGNED' },
      orderBy: { visitDate: 'desc' },
      select: { id: true, visitDate: true, author: { select: { name: true, credentials: true } } },
    }),
  ]);
  if (!patient) return null;

  await recordAudit({
    userId: user.id,
    action: 'portal_view_records',
    entity: 'Patient',
    entityId: patientId,
    patientId,
  });

  return (
    <PortalShell name={patient.firstName}>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">My records</h1>
        <p className="mt-1 text-sm text-clay-600">
          Everything on this page is yours alone. Call the clinic if anything looks wrong.
        </p>
      </header>

      <div className="space-y-6">
        <section className="card">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay-500">
            My paperwork
          </h2>
          {intakes.length === 0 ? (
            <p className="text-sm text-clay-600">
              No completed intake forms yet. You will fill one in on the iPad at your first visit.
            </p>
          ) : (
            <ul className="divide-y divide-clay-100">
              {intakes.map((intake) => (
                <li key={intake.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{intake.form.title}</p>
                    <p className="text-xs text-clay-500">
                      Completed {formatDateTime(intake.submittedAt)}
                    </p>
                  </div>
                  <Link href={`/portal/intake/${intake.id}`} className="btn-ghost">
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay-500">My visits</h2>
          {visits.length === 0 ? (
            <p className="text-sm text-clay-600">No visits on file yet.</p>
          ) : (
            <ul className="divide-y divide-clay-100">
              {visits.map((visit) => (
                <li key={visit.id} className="py-2.5 text-sm">
                  <p className="font-medium">{formatDate(visit.visitDate)}</p>
                  <p className="text-xs text-clay-500">
                    {visit.author.name}
                    {visit.author.credentials ? `, ${visit.author.credentials}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-clay-500">
            Treatment notes are part of your chart. Ask the front desk for a copy and we will
            release it to you in writing.
          </p>
        </section>

        <section className="card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-clay-500">Security</h2>
          <p className="text-sm text-clay-600">
            Sign out when you are finished, especially on a shared device.
          </p>
          <Link href="/account/password" className="btn-secondary mt-3 inline-block">
            Change my password
          </Link>
        </section>
      </div>
    </PortalShell>
  );
}
