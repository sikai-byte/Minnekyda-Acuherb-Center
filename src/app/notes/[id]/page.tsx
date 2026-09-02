import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { NoteEditor, type NoteTemplateOption } from '@/components/NoteEditor';
import { AmendButton } from '@/components/AmendButton';
import { prisma } from '@/lib/db';
import { requireRole, CLINICAL_ROLES } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { updateNote } from '@/lib/actions/notes';
import {
  NOTE_FIELD_LABELS,
  NOTE_TEXT_FIELDS,
  structuredFromNote,
  templatePresets,
} from '@/lib/notes/structure';
import { formatDate, formatDateInput, formatDateTime, patientName } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function NotePage({ params }: { params: { id: string } }) {
  const user = await requireRole(CLINICAL_ROLES);

  const note = await prisma.clinicalNote.findUnique({
    where: { id: params.id },
    include: { patient: true, author: true, amends: true, amendedBy: true },
  });
  if (!note) notFound();

  await recordAudit({
    userId: user.id,
    action: 'view_note',
    entity: 'ClinicalNote',
    entityId: note.id,
    patientId: note.patientId,
  });

  const header = (
    <div className="mb-6">
      <Link href={`/patients/${note.patientId}`} className="text-sm text-clay-600 hover:underline">
        ← {patientName(note.patient)}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Visit {formatDate(note.visitDate)}</h1>
        <span
          className={`badge ${
            note.status === 'SIGNED' ? 'bg-moss-100 text-moss-700' : 'bg-clay-100 text-clay-700'
          }`}
        >
          {note.status === 'SIGNED' ? `Signed ${formatDateTime(note.signedAt)}` : 'Draft'}
        </span>
      </div>
      <p className="mt-1 text-sm text-clay-600">{note.author.name}</p>
      {note.amends ? (
        <p className="mt-2 text-sm text-clay-600">
          Amends the note from {formatDate(note.amends.visitDate)} ·{' '}
          <Link href={`/notes/${note.amends.id}`} className="underline">
            view original
          </Link>
        </p>
      ) : null}
      {note.amendedBy ? (
        <p className="mt-2 text-sm text-clay-600">
          Superseded by an amendment ·{' '}
          <Link href={`/notes/${note.amendedBy.id}`} className="underline">
            view amendment
          </Link>
        </p>
      ) : null}
    </div>
  );

  if (note.status === 'DRAFT') {
    const templates = await prisma.noteTemplate.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    const templateOptions: NoteTemplateOption[] = templates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      presets: templatePresets(template.fieldsJson),
    }));

    return (
      <AppShell>
        {header}
        <NoteEditor
          action={updateNote.bind(null, note.id)}
          templates={templateOptions}
          visitDate={formatDateInput(note.visitDate)}
          templateId={note.templateId ?? ''}
          structured={structuredFromNote(note.fieldsJson, note)}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {header}
      <article className="card space-y-4">
        {NOTE_TEXT_FIELDS.map((field) => {
          const value = note[field];
          if (!value) return null;
          return (
            <div key={field}>
              <h2 className="text-xs uppercase tracking-wide text-clay-500">
                {NOTE_FIELD_LABELS[field]}
              </h2>
              <p className="whitespace-pre-line text-clay-800">{value}</p>
            </div>
          );
        })}
      </article>
      {note.amendedBy ? null : (
        <div className="mt-5">
          <AmendButton noteId={note.id} />
        </div>
      )}
    </AppShell>
  );
}
