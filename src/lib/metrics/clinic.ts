import type { AppointmentStatus, BookingSource, ClinicEventType } from '@prisma/client';
import { occupancy } from '@/lib/scheduling/slots';
import { FRONT_DESK_MINUTES_PER_VISIT, PAPER_CHART_MINUTES } from './baselines';

/// The reports, as pure functions over rows. Nothing here touches Prisma or a session, so the
/// arithmetic can be tested against fixtures instead of a seeded database.

export type EventRow = {
  type: ClinicEventType;
  occurredAt: Date;
  durationMs: number | null;
  patientId: string | null;
  userId: string | null;
  source: BookingSource | null;
  minutes: number | null;
};

export type AppointmentRow = {
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  source: BookingSource;
};

/// Durations of clinical work are skewed by the odd form left open over lunch, so the headline
/// number is the median and the mean is shown beside it rather than instead of it.
export type Duration = {
  count: number;
  medianMinutes: number | null;
  meanMinutes: number | null;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarise(minutes: number[]): Duration {
  const mean = minutes.length
    ? minutes.reduce((total, value) => total + value, 0) / minutes.length
    : null;
  const middle = median(minutes);
  return {
    count: minutes.length,
    medianMinutes: middle === null ? null : round(middle),
    meanMinutes: mean === null ? null : round(mean),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function durationsOf(events: EventRow[], type: ClinicEventType): number[] {
  return events
    .filter((event) => event.type === type && event.durationMs !== null)
    .map((event) => event.durationMs! / 60_000);
}

/// How long a patient spends filling the form in on the iPad.
export function intakeCompletion(events: EventRow[]): Duration {
  return summarise(durationsOf(events, 'INTAKE_SUBMITTED'));
}

/// How long a practitioner spends writing a note, from opening the editor to signing.
export function noteCompletion(events: EventRow[]): Duration {
  return summarise(durationsOf(events, 'NOTE_SIGNED'));
}

/// Staff time that the paper process would have consumed. An estimate by construction: the
/// platform can count the charts it took in, but it can never measure the transcription that
/// did not happen.
export function transcriptionAvoided(events: EventRow[]): {
  charts: number;
  estimatedMinutesSaved: number;
} {
  const charts = events.filter((event) => event.type === 'INTAKE_SUBMITTED').length;
  return { charts, estimatedMinutesSaved: charts * PAPER_CHART_MINUTES };
}

/// The gap between finishing with a patient and having a signed note, which is the number that
/// tends to slip. Each completed visit is paired with that patient's next signature, so a note
/// written before the visit was marked complete counts as zero rather than as a negative.
export function completionToSignedNote(events: EventRow[]): Duration {
  const signings = events
    .filter((event) => event.type === 'NOTE_SIGNED' && event.patientId)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const gaps: number[] = [];
  const claimed = new Set<EventRow>();

  for (const completion of events.filter((event) => event.type === 'APPOINTMENT_COMPLETED')) {
    const signed = signings.find(
      (event) =>
        !claimed.has(event) &&
        event.patientId === completion.patientId &&
        event.occurredAt >= completion.occurredAt,
    );
    if (!signed) continue;
    claimed.add(signed);
    gaps.push((signed.occurredAt.getTime() - completion.occurredAt.getTime()) / 60_000);
  }

  return summarise(gaps);
}

/// Booked minutes against what the clinic had open. `practitionerOpenMinutes` is the sum of the
/// practitioners' working minutes in the window; room capacity is that same window times the
/// number of treatment rooms, which is why the two percentages differ.
export function utilisation(
  appointments: AppointmentRow[],
  practitionerOpenMinutes: number,
  roomCount: number,
): { bookedMinutes: number; appointmentPercent: number; roomPercent: number } {
  const bookedMinutes = appointments
    .filter((appointment) => appointment.status !== 'CANCELLED' && appointment.status !== 'NO_SHOW')
    .reduce(
      (total, appointment) =>
        total + (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000,
      0,
    );

  return {
    bookedMinutes,
    appointmentPercent: occupancy(bookedMinutes, practitionerOpenMinutes, 1),
    roomPercent: occupancy(bookedMinutes, practitionerOpenMinutes, roomCount),
  };
}

/// No-shows as a share of visits that were meant to happen. Cancellations are excluded: a
/// patient who called ahead is a scheduling event, not a no-show, and lumping them together
/// would flatter the number.
export function noShowRate(appointments: AppointmentRow[]): {
  completed: number;
  noShows: number;
  percent: number;
} {
  const completed = appointments.filter((appointment) => appointment.status === 'COMPLETED').length;
  const noShows = appointments.filter((appointment) => appointment.status === 'NO_SHOW').length;
  const expected = completed + noShows;
  return {
    completed,
    noShows,
    percent: expected === 0 ? 0 : Math.round((noShows / expected) * 100),
  };
}

/// Bookings the front desk did not have to take. A visit booked by the patient — through the
/// portal or the public site — is the clinic's 15 minutes of check-in, rebooking and payment
/// handling given back, again at the clinic's own estimate.
export function frontDeskLoad(appointments: AppointmentRow[]): {
  total: number;
  selfBooked: number;
  staffBooked: number;
  selfBookedPercent: number;
  estimatedMinutesSaved: number;
} {
  const total = appointments.length;
  const selfBooked = appointments.filter((appointment) => appointment.source !== 'STAFF').length;
  return {
    total,
    selfBooked,
    staffBooked: total - selfBooked,
    selfBookedPercent: total === 0 ? 0 : Math.round((selfBooked / total) * 100),
    estimatedMinutesSaved: selfBooked * FRONT_DESK_MINUTES_PER_VISIT,
  };
}
