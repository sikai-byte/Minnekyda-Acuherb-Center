'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, CLINICAL_ROLES } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

const noteSchema = z.object({
  visitDate: z.string().min(1, 'Visit date is required'),
  chiefComplaint: z.string().trim().optional(),
  subjective: z.string().trim().optional(),
  objective: z.string().trim().optional(),
  tcmDiagnosis: z.string().trim().optional(),
  assessment: z.string().trim().optional(),
  plan: z.string().trim().optional(),
  pointsUsed: z.string().trim().optional(),
  herbFormula: z.string().trim().optional(),
  templateId: z.string().trim().optional(),
});

export type NoteFormState = { error?: string };

function readNoteForm(formData: FormData) {
  return noteSchema.safeParse({
    visitDate: formData.get('visitDate') ?? '',
    chiefComplaint: formData.get('chiefComplaint') ?? '',
    subjective: formData.get('subjective') ?? '',
    objective: formData.get('objective') ?? '',
    tcmDiagnosis: formData.get('tcmDiagnosis') ?? '',
    assessment: formData.get('assessment') ?? '',
    plan: formData.get('plan') ?? '',
    pointsUsed: formData.get('pointsUsed') ?? '',
    herbFormula: formData.get('herbFormula') ?? '',
    templateId: formData.get('templateId') ?? '',
  });
}

export async function createNote(
  patientId: string,
  _prev: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const user = await requireRole(CLINICAL_ROLES);
  const parsed = readNoteForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const sign = formData.get('intent') === 'sign';
  const { visitDate, templateId, ...rest } = parsed.data;

  const note = await prisma.clinicalNote.create({
    data: {
      ...rest,
      patientId,
      authorId: user.id,
      templateId: templateId || null,
      visitDate: new Date(visitDate),
      status: sign ? 'SIGNED' : 'DRAFT',
      signedAt: sign ? new Date() : null,
    },
  });

  await recordAudit({
    userId: user.id,
    action: sign ? 'create_and_sign_note' : 'create_note',
    entity: 'ClinicalNote',
    entityId: note.id,
    patientId,
  });

  revalidatePath(`/patients/${patientId}`);
  redirect(`/notes/${note.id}`);
}

export async function updateNote(
  noteId: string,
  _prev: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const user = await requireRole(CLINICAL_ROLES);
  const parsed = readNoteForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await prisma.clinicalNote.findUnique({ where: { id: noteId } });
  if (!existing) return { error: 'Note not found' };
  if (existing.status === 'SIGNED') {
    return { error: 'Signed notes cannot be edited. Create an amendment instead.' };
  }

  const sign = formData.get('intent') === 'sign';
  const { visitDate, templateId, ...rest } = parsed.data;

  await prisma.clinicalNote.update({
    where: { id: noteId },
    data: {
      ...rest,
      templateId: templateId || null,
      visitDate: new Date(visitDate),
      status: sign ? 'SIGNED' : 'DRAFT',
      signedAt: sign ? new Date() : null,
    },
  });

  await recordAudit({
    userId: user.id,
    action: sign ? 'sign_note' : 'update_note',
    entity: 'ClinicalNote',
    entityId: noteId,
    patientId: existing.patientId,
  });

  revalidatePath(`/patients/${existing.patientId}`);
  redirect(`/notes/${noteId}`);
}

/// Signed notes are immutable, so an amendment is a fresh draft that points back at the
/// note it supersedes. Both rows stay in the chart.
export async function amendNote(noteId: string): Promise<void> {
  const user = await requireRole(CLINICAL_ROLES);
  const original = await prisma.clinicalNote.findUnique({
    where: { id: noteId },
    include: { amendedBy: true },
  });
  if (!original) throw new Error('Note not found');
  if (original.amendedBy) redirect(`/notes/${original.amendedBy.id}`);

  const amendment = await prisma.clinicalNote.create({
    data: {
      patientId: original.patientId,
      authorId: user.id,
      templateId: original.templateId,
      visitDate: original.visitDate,
      chiefComplaint: original.chiefComplaint,
      subjective: original.subjective,
      objective: original.objective,
      tcmDiagnosis: original.tcmDiagnosis,
      assessment: original.assessment,
      plan: original.plan,
      pointsUsed: original.pointsUsed,
      herbFormula: original.herbFormula,
      amendsId: original.id,
      status: 'DRAFT',
    },
  });

  await recordAudit({
    userId: user.id,
    action: 'amend_note',
    entity: 'ClinicalNote',
    entityId: amendment.id,
    patientId: original.patientId,
    detail: { amends: original.id },
  });

  redirect(`/notes/${amendment.id}`);
}
