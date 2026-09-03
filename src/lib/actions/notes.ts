'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, CLINICAL_ROLES } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { lastEventAt, recordEvent } from '@/lib/telemetry';
import { composeNoteText, isStructuredNote, type StructuredNote } from '@/lib/notes/structure';

const noteSchema = z.object({
  visitDate: z.string().min(1, 'Visit date is required'),
  templateId: z.string().trim().optional(),
  structured: z.string().optional(),
});

export type NoteFormState = { error?: string };

type ParsedNote = {
  visitDate: string;
  templateId: string;
  structured: StructuredNote;
  text: ReturnType<typeof composeNoteText>;
};

/// The editor posts only the tapped selections; the note's text columns are always
/// rendered here so the stored prose cannot drift from the structured answers.
function readNoteForm(formData: FormData): { ok: true; data: ParsedNote } | { ok: false; error: string } {
  const parsed = noteSchema.safeParse({
    visitDate: formData.get('visitDate') ?? '',
    templateId: formData.get('templateId') ?? '',
    structured: formData.get('structured') ?? '',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  let structured: StructuredNote = {};
  if (parsed.data.structured) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(parsed.data.structured);
    } catch {
      return { ok: false, error: 'Could not read the note selections. Please try again.' };
    }
    if (!isStructuredNote(decoded)) {
      return { ok: false, error: 'Could not read the note selections. Please try again.' };
    }
    structured = decoded;
  }

  return {
    ok: true,
    data: {
      visitDate: parsed.data.visitDate,
      templateId: parsed.data.templateId ?? '',
      structured,
      text: composeNoteText(structured),
    },
  };
}

export async function createNote(
  patientId: string,
  _prev: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const user = await requireRole(CLINICAL_ROLES);
  const parsed = readNoteForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const sign = formData.get('intent') === 'sign';
  const { visitDate, templateId, structured, text } = parsed.data;

  const note = await prisma.clinicalNote.create({
    data: {
      ...text,
      fieldsJson: { structured },
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

  if (sign) await recordSigned(note.id, patientId, user.id);

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
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.clinicalNote.findUnique({ where: { id: noteId } });
  if (!existing) return { error: 'Note not found' };
  if (existing.status === 'SIGNED') {
    return { error: 'Signed notes cannot be edited. Create an amendment instead.' };
  }

  const sign = formData.get('intent') === 'sign';
  const { visitDate, templateId, structured, text } = parsed.data;

  await prisma.clinicalNote.update({
    where: { id: noteId },
    data: {
      ...text,
      fieldsJson: { structured },
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

  if (sign) await recordSigned(noteId, existing.patientId, user.id, noteId);

  revalidatePath(`/patients/${existing.patientId}`);
  redirect(`/notes/${noteId}`);
}

/// Closes two intervals the clinic asked to see: how long the note itself took, and — paired
/// with the appointment's completion in the reports — how long after the visit it was signed.
async function recordSigned(
  noteId: string,
  patientId: string,
  userId: string,
  startedAsNoteId?: string,
): Promise<void> {
  await recordEvent({
    type: 'NOTE_SIGNED',
    since: await lastEventAt('NOTE_STARTED', { userId, patientId, noteId: startedAsNoteId }),
    noteId,
    patientId,
    userId,
  });
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
      fieldsJson: original.fieldsJson ?? undefined,
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
