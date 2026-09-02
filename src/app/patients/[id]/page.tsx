import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { StartIntakeButton } from '@/components/StartIntakeButton';
import { prisma } from '@/lib/db';
import { requireUser, canViewClinicalNotes } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { age, formatDate, formatDateTime, patientName } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PatientChartPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: {
      intakes: { orderBy: { createdAt: 'desc' }, include: { form: true } },
      notes: {
        orderBy: [{ visitDate: 'desc' }, { createdAt: 'desc' }],
        include: { author: true, amends: true },
      },
    },
  });
  if (!patient) notFound();

  await recordAudit({
    userId: user.id,
    action: 'view_chart',
    entity: 'Patient',
    entityId: patient.id,
    patientId: patient.id,
  });

  const showNotes = canViewClinicalNotes(user);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/patients" className="text-sm text-clay-600 hover:underline">
            ← Patients
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{patientName(patient)}</h1>
          <p className="mt-1 text-sm text-clay-600">
            {formatDate(patient.dateOfBirth)} · age {age(patient.dateOfBirth)}
            {patient.phone ? ` · ${patient.phone}` : ''}
            {patient.email ? ` · ${patient.email}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/patients/${patient.id}/edit`} className="btn-secondary">
            Edit details
          </Link>
          <StartIntakeButton patientId={patient.id} />
          {showNotes ? (
            <Link href={`/patients/${patient.id}/notes/new`} className="btn-primary">
              New note
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay-500">Details</h2>
          <dl className="space-y-2 text-sm">
            <Detail label="Address">
              {[patient.streetAddress, patient.city, patient.state, patient.zip].filter(Boolean).join(', ') || '—'}
            </Detail>
            <Detail label="Occupation">{patient.occupation ?? '—'}</Detail>
            <Detail label="Primary physician">{patient.primaryPhysician ?? '—'}</Detail>
            <Detail label="Emergency contact">
              {patient.emergencyName ? `${patient.emergencyName} · ${patient.emergencyPhone ?? '—'}` : '—'}
            </Detail>
            <Detail label="Patient since">{formatDate(patient.createdAt)}</Detail>
          </dl>
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay-500">Intake forms</h2>
            {patient.intakes.length === 0 ? (
              <p className="text-sm text-clay-600">No intake on file. Start one on the iPad.</p>
            ) : (
              <ul className="divide-y divide-clay-100">
                {patient.intakes.map((intake) => (
                  <li key={intake.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-medium">
                        {intake.form.title}{' '}
                        <span className="text-xs font-normal text-clay-500">v{intake.form.version}</span>
                      </p>
                      <p className="text-xs text-clay-500">
                        {intake.status === 'SUBMITTED'
                          ? `Submitted ${formatDateTime(intake.submittedAt)}`
                          : `Started ${formatDateTime(intake.createdAt)}`}
                      </p>
                    </div>
                    {intake.status === 'SUBMITTED' ? (
                      <Link href={`/intake/${intake.id}/view`} className="btn-ghost">
                        View
                      </Link>
                    ) : (
                      <Link href={`/intake/${intake.id}`} className="btn-ghost">
                        Continue
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {showNotes ? (
            <section className="card">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay-500">Visit notes</h2>
              {patient.notes.length === 0 ? (
                <p className="text-sm text-clay-600">No notes yet.</p>
              ) : (
                <ul className="divide-y divide-clay-100">
                  {patient.notes.map((note) => (
                    <li key={note.id} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Link href={`/notes/${note.id}`} className="font-medium hover:underline">
                            {formatDate(note.visitDate)}
                          </Link>
                          <p className="text-xs text-clay-500">
                            {note.author.name}
                            {note.amends ? ' · amendment' : ''}
                          </p>
                        </div>
                        <span
                          className={`badge ${
                            note.status === 'SIGNED' ? 'bg-moss-100 text-moss-700' : 'bg-clay-100 text-clay-700'
                          }`}
                        >
                          {note.status === 'SIGNED' ? 'Signed' : 'Draft'}
                        </span>
                      </div>
                      {note.chiefComplaint ? (
                        <p className="mt-1 line-clamp-2 text-sm text-clay-700">{note.chiefComplaint}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="card">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-clay-500">Visit notes</h2>
              <p className="text-sm text-clay-600">
                Clinical notes are visible to practitioners and administrators only.
              </p>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-clay-500">{label}</dt>
      <dd className="text-clay-800">{children}</dd>
    </div>
  );
}
