import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { prisma } from '@/lib/db';
import { requireUser, canViewClinicalNotes } from '@/lib/auth';
import { formatDate, formatDateTime, patientName } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const showNotes = canViewClinicalNotes(user);

  const [patientCount, recentIntakes, unsignedNotes, recentNotes] = await Promise.all([
    prisma.patient.count({ where: { archivedAt: null } }),
    prisma.intakeSubmission.findMany({
      where: { status: 'SUBMITTED' },
      orderBy: { submittedAt: 'desc' },
      take: 5,
      include: { patient: true },
    }),
    showNotes
      ? prisma.clinicalNote.count({ where: { status: 'DRAFT', authorId: user.id } })
      : Promise.resolve(0),
    showNotes
      ? prisma.clinicalNote.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 5,
          include: { patient: true, author: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Good day, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-clay-600">
            {patientCount} active {patientCount === 1 ? 'patient' : 'patients'}
            {showNotes && unsignedNotes > 0 ? ` · ${unsignedNotes} unsigned note${unsignedNotes === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/patients/new" className="btn-secondary">
            New patient
          </Link>
          <Link href="/kiosk" className="btn-primary">
            Start iPad intake
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay-500">
            Recent intake submissions
          </h2>
          {recentIntakes.length === 0 ? (
            <p className="text-sm text-clay-600">No intake forms submitted yet.</p>
          ) : (
            <ul className="divide-y divide-clay-100">
              {recentIntakes.map((intake) => (
                <li key={intake.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <Link href={`/patients/${intake.patientId}`} className="font-medium hover:underline">
                      {patientName(intake.patient)}
                    </Link>
                    <p className="text-xs text-clay-500">{formatDateTime(intake.submittedAt)}</p>
                  </div>
                  <Link href={`/intake/${intake.id}/view`} className="btn-ghost text-sm">
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {showNotes ? (
          <section className="card">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay-500">Recent notes</h2>
            {recentNotes.length === 0 ? (
              <p className="text-sm text-clay-600">No clinical notes yet.</p>
            ) : (
              <ul className="divide-y divide-clay-100">
                {recentNotes.map((note) => (
                  <li key={note.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <Link href={`/notes/${note.id}`} className="font-medium hover:underline">
                        {patientName(note.patient)}
                      </Link>
                      <p className="text-xs text-clay-500">
                        {formatDate(note.visitDate)} · {note.author.name}
                      </p>
                    </div>
                    <span
                      className={`badge ${
                        note.status === 'SIGNED' ? 'bg-moss-100 text-moss-700' : 'bg-clay-100 text-clay-700'
                      }`}
                    >
                      {note.status === 'SIGNED' ? 'Signed' : 'Draft'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
