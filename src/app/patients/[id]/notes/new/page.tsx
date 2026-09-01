import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { NoteEditor, type NoteTemplateOption } from '@/components/NoteEditor';
import { prisma } from '@/lib/db';
import { requireRole, CLINICAL_ROLES } from '@/lib/auth';
import { createNote } from '@/lib/actions/notes';
import { formatDateInput, patientName } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function NewNotePage({ params }: { params: { id: string } }) {
  await requireRole(CLINICAL_ROLES);

  const [patient, templates] = await Promise.all([
    prisma.patient.findUnique({ where: { id: params.id } }),
    prisma.noteTemplate.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ]);
  if (!patient) notFound();

  const templateOptions: NoteTemplateOption[] = templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    fields: template.fieldsJson as Record<string, string>,
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
        draft={{
          visitDate: formatDateInput(new Date()),
          chiefComplaint: '',
          subjective: '',
          objective: '',
          tcmDiagnosis: '',
          assessment: '',
          plan: '',
          pointsUsed: '',
          herbFormula: '',
          templateId: '',
        }}
      />
    </AppShell>
  );
}
