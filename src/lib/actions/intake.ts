'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireIntakeAccess, requireUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { recordEvent } from '@/lib/telemetry';
import { getKioskSession, getSession } from '@/lib/session';
import { kioskPath } from '@/lib/kiosk';
import type { IntakeSchema, SignatureValue } from '@/lib/intake/types';

/// Answers are stored as an opaque JSON blob keyed by field. We validate the shape
/// (string / string[] / grid / signature) rather than the field names, so a new form
/// version needs no code change here.
const gridValue = z.object({
  selected: z.array(z.string()),
  notes: z.record(z.string()).optional(),
});

const signatureValue = z.object({
  dataUrl: z.string().startsWith('data:image/'),
  signedAt: z.string(),
  typedName: z.string().optional(),
});

const answersSchema = z.record(z.union([z.string(), z.boolean(), gridValue, signatureValue]));

export async function startIntake(patientId: string): Promise<void> {
  const user = await requireUser();
  const form = await prisma.intakeForm.findFirst({
    where: { active: true, slug: 'minnekyda-new-patient-intake' },
    orderBy: { version: 'desc' },
  });
  if (!form) throw new Error('No active intake form is configured');

  const submission = await prisma.intakeSubmission.create({
    data: { patientId, intakeFormId: form.id, startedById: user.id },
  });

  await recordAudit({
    userId: user.id,
    action: 'start_intake',
    entity: 'IntakeSubmission',
    entityId: submission.id,
    patientId,
  });

  await recordEvent({
    type: 'INTAKE_STARTED',
    patientId,
    userId: user.id,
    submissionId: submission.id,
  });

  /// Handing the iPad to the patient: the staff session is destroyed on this device and
  /// replaced by a token that can only reach this one submission, so a patient with the
  /// address bar cannot reach another patient's chart. Staff must sign in again after.
  const staffSession = await getSession();
  staffSession.destroy();

  const kiosk = await getKioskSession();
  kiosk.submissionId = submission.id;
  kiosk.patientId = patientId;
  await kiosk.save();

  redirect(kioskPath(submission.id));
}

/// Ends kiosk mode on the device. Staff have to authenticate again to get back in, which is
/// the point: the iPad is never a shortcut into the chart system.
export async function exitKiosk(): Promise<void> {
  const kiosk = await getKioskSession();
  const submissionId = kiosk.submissionId;
  kiosk.destroy();
  await recordAudit({
    action: 'exit_kiosk',
    entity: 'IntakeSubmission',
    entityId: submissionId ?? null,
  });
  redirect('/login');
}

export type SaveIntakeResult = { ok: boolean; error?: string };

/// Called by the kiosk form on section changes so a patient never loses work,
/// and again on submit with `submit: true`.
export async function saveIntake(
  submissionId: string,
  answers: unknown,
  submit: boolean,
): Promise<SaveIntakeResult> {
  await requireIntakeAccess(submissionId);

  const parsed = answersSchema.safeParse(answers);
  if (!parsed.success) return { ok: false, error: 'Some answers could not be saved' };

  const submission = await prisma.intakeSubmission.findUnique({
    where: { id: submissionId },
    include: { form: true },
  });
  if (!submission) return { ok: false, error: 'This intake form no longer exists' };
  if (submission.status === 'SUBMITTED') {
    return { ok: false, error: 'This intake has already been submitted' };
  }

  const signatures: Record<string, SignatureValue> = {};
  const plainAnswers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (typeof value === 'object' && value !== null && 'dataUrl' in value) {
      signatures[key] = value as SignatureValue;
    } else {
      plainAnswers[key] = value;
    }
  }

  if (submit) {
    const schema = submission.form.schemaJson as unknown as IntakeSchema;
    const missing = requiredFieldsMissing(schema, plainAnswers, signatures);
    if (missing.length > 0) {
      return { ok: false, error: `Please complete: ${missing.join(', ')}` };
    }
  }

  await prisma.intakeSubmission.update({
    where: { id: submissionId },
    data: {
      answersJson: plainAnswers as object,
      signatures: signatures as object,
      status: submit ? 'SUBMITTED' : 'IN_PROGRESS',
      submittedAt: submit ? new Date() : null,
    },
  });

  if (submit) {
    /// The patient submits from the kiosk with no session of their own, so the
    /// submission is attributed to the staff member who started the intake.
    await recordAudit({
      userId: submission.startedById,
      action: 'submit_intake',
      entity: 'IntakeSubmission',
      entityId: submissionId,
      patientId: submission.patientId,
      detail: {
        formSlug: submission.form.slug,
        formVersion: submission.form.version,
        submittedBy: 'patient on kiosk',
      },
    });

    /// How long the patient spent on the iPad, which is the number that replaces the clinic's
    /// estimate of an hour per chart of preparing and re-typing paper.
    await recordEvent({
      type: 'INTAKE_SUBMITTED',
      since: submission.createdAt,
      patientId: submission.patientId,
      userId: submission.startedById,
      submissionId,
    });
    revalidatePath(`/patients/${submission.patientId}`);
  }

  return { ok: true };
}

function requiredFieldsMissing(
  schema: IntakeSchema,
  answers: Record<string, unknown>,
  signatures: Record<string, SignatureValue>,
): string[] {
  const missing: string[] = [];
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.type === 'signature') {
        if (!signatures[field.key]) missing.push(`${section.title} — ${field.label}`);
        continue;
      }
      if (field.type === 'consent') {
        if (answers[field.key] !== true) missing.push(`${section.title} — agreement`);
        continue;
      }
      if ('required' in field && field.required) {
        const value = answers[field.key];
        if (typeof value !== 'string' || value.trim() === '') missing.push(field.label);
      }
    }
  }
  return missing;
}
