import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { NoteEditor, type NoteTemplateOption } from '@/components/NoteEditor';
import { prisma } from '@/lib/db';
import { requireRole, CLINICAL_ROLES } from '@/lib/auth';
import { recordEvent } from '@/lib/telemetry';
import { createNote } from '@/lib/actions/notes';
import { templatePresets } from '@/lib/notes/structure';
import { formatDateInput, patientName } from '@/lib/format';
import { clinicDate, clinicTime } from '@/lib/scheduling/time';

export const dynamic = 'force-dynamic';

/// Reached in one tap from today's schedule. The appointment id carries the patient, the
/// practitioner and the visit date across, so there is no second patient search — and it is
/// re-checked against this chart before it is stored on the note.
export default async function NewNotePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { appointmentId?: string };
}) {
  const user = await requireRole(CLINICAL_ROLES);

  const [patient, templates, appointment] = await Promise.all([
    prisma.patient.findUnique({ where: { id: params.id } }),
    prisma.noteTemplate.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    searchParams.appointmentId
      ? prisma.appointment.findFirst({
          where: { id: searchParams.appointmentId, patientId: params.id },
          select: { id: true, startsAt: true, appointmentType: { select: { name: true } } },
        })
      : null,
  ]);
  if (!patient) notFound();

  /// The clock on "how long does a note take" starts here, because there is no note row until
  /// the practitioner saves one.
  await recordEvent({
    type: 'NOTE_STARTED',
    patientId: patient.id,
    userId: user.id,
  });

  const templateOptions: NoteTemplateOption[] = templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    presets: templatePresets(template.fieldsJson),
  }));

  return (
    <AppShell>
      <div className="mb-6">
        <Link href={`/patients/${patient.id}`} className="text-sm text-clay-600 hover:underline">
          ← {patientName(patient)}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New visit note</h1>
        {appointment ? (
          <p className="mt-1 text-sm text-clay-600">
            {appointment.appointmentType.name} · {clinicDate(appointment.startsAt)} at{' '}
            {clinicTime(appointment.startsAt)}
          </p>
        ) : null}
      </div>
      <NoteEditor
        action={createNote.bind(null, patient.id, appointment?.id ?? null)}
        templates={templateOptions}
        visitDate={formatDateInput(appointment?.startsAt ?? new Date())}
        templateId=""
        structured={{}}
      />
    </AppShell>
  );
}
