import type { BookingSource, ClinicEventType } from '@prisma/client';
import { prisma } from './db';

type ClinicEventInput = {
  type: ClinicEventType;
  occurredAt?: Date;
  /// Prefer `since` and let the helper do the arithmetic, so callers cannot record a
  /// negative or wildly wrong interval by subtracting the wrong way round.
  since?: Date | null;
  patientId?: string | null;
  userId?: string | null;
  appointmentId?: string | null;
  submissionId?: string | null;
  noteId?: string | null;
  appointmentTypeId?: string | null;
  roomId?: string | null;
  source?: BookingSource | null;
  minutes?: number | null;
};

/// A day of wall clock. Longer than that is a form left open overnight or a clock change,
/// not a measurement, and averaging it in would make the reports lie.
const MAX_TRACKED_MS = 24 * 60 * 60 * 1000;

export function intervalMs(from: Date | null | undefined, to: Date): number | null {
  if (!from) return null;
  const elapsed = to.getTime() - from.getTime();
  if (elapsed < 0 || elapsed > MAX_TRACKED_MS) return null;
  return elapsed;
}

/// The start of the interval a closing event is about to measure. Deliberately the *latest*
/// matching start: a note opened on Tuesday, abandoned, and finished on Friday took one sitting
/// to write, not three days, so what is measured is the sitting it was signed in.
export async function lastEventAt(
  type: ClinicEventType,
  where: { userId?: string | null; patientId?: string | null; noteId?: string | null },
): Promise<Date | null> {
  const event = await prisma.clinicEvent.findFirst({
    where: {
      type,
      userId: where.userId ?? undefined,
      patientId: where.patientId ?? undefined,
      /// A draft that already has an id narrows to that note; a note being written for the
      /// first time has none yet, and the practitioner-and-patient pair is the best available
      /// match for the sitting that is about to be signed.
      noteId: where.noteId ?? undefined,
      occurredAt: { gt: new Date(Date.now() - MAX_TRACKED_MS) },
    },
    orderBy: { occurredAt: 'desc' },
    select: { occurredAt: true },
  });
  return event?.occurredAt ?? null;
}

/// Records one operational moment. Like the audit writer this never throws: telemetry is the
/// least important thing happening in a treatment room, and a reporting outage must not stop a
/// practitioner signing a note.
export async function recordEvent(input: ClinicEventInput): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date();
  try {
    await prisma.clinicEvent.create({
      data: {
        type: input.type,
        occurredAt,
        durationMs: intervalMs(input.since, occurredAt),
        patientId: input.patientId ?? null,
        userId: input.userId ?? null,
        appointmentId: input.appointmentId ?? null,
        submissionId: input.submissionId ?? null,
        noteId: input.noteId ?? null,
        appointmentTypeId: input.appointmentTypeId ?? null,
        roomId: input.roomId ?? null,
        source: input.source ?? null,
        minutes: input.minutes ?? null,
      },
    });
  } catch (error) {
    console.error('clinic event write failed', {
      type: input.type,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}
