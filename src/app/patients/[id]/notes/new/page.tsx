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

export const dynamic = 'force-dynamic';

export default async function NewNotePage({ params }: { params: { id: string } }) {
  const user = await requireRole(CLINICAL_ROLES);

  const [patient, templates] = await Promise.all([
    prisma.patient.findUnique({ where: { id: params.id } }),
    prisma.noteTemplate.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
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
      </div>
      <NoteEditor
        action={createNote.bind(null, patient.id)}
        templates={templateOptions}
        visitDate={formatDateInput(new Date())}
        templateId=""
        structured={{}}
      />
    </AppShell>
  );
}
