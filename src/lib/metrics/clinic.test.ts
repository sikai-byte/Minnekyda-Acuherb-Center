import { describe, expect, it } from 'vitest';
import { intervalMs } from '@/lib/telemetry';
import { FRONT_DESK_MINUTES_PER_VISIT, PAPER_CHART_MINUTES } from './baselines';
import {
  completionToSignedNote,
  frontDeskLoad,
  intakeCompletion,
  median,
  noShowRate,
  noteCompletion,
  transcriptionAvoided,
  utilisation,
  type AppointmentRow,
  type EventRow,
} from './clinic';

const T0 = new Date('2026-03-02T15:00:00.000Z');

function at(minutes: number): Date {
  return new Date(T0.getTime() + minutes * 60_000);
}

function event(row: Partial<EventRow> & Pick<EventRow, 'type'>): EventRow {
  return {
    occurredAt: T0,
    durationMs: null,
    patientId: null,
    userId: null,
    source: null,
    minutes: null,
    ...row,
  };
}

function appointment(row: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    startsAt: T0,
    endsAt: at(60),
    status: 'COMPLETED',
    source: 'STAFF',
    ...row,
  };
}

describe('interval capture', () => {
  it('measures forwards only and ignores intervals no human worked', () => {
    expect(intervalMs(T0, at(12))).toBe(12 * 60_000);
    /// A clock change or a bad caller must not produce a negative duration.
    expect(intervalMs(at(12), T0)).toBeNull();
    /// A form left open overnight is not a measurement.
    expect(intervalMs(T0, at(25 * 60))).toBeNull();
    expect(intervalMs(null, T0)).toBeNull();
  });
});

describe('durations', () => {
  it('takes the median of an odd and an even set', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('summarises intake and note times in minutes and reports both middle and mean', () => {
    const events = [
      event({ type: 'INTAKE_SUBMITTED', durationMs: 8 * 60_000 }),
      event({ type: 'INTAKE_SUBMITTED', durationMs: 12 * 60_000 }),
      /// An unmeasurable one — no start captured — must not be counted as zero.
      event({ type: 'INTAKE_SUBMITTED', durationMs: null }),
      event({ type: 'NOTE_SIGNED', durationMs: 3 * 60_000 }),
    ];

    expect(intakeCompletion(events)).toEqual({ count: 2, medianMinutes: 10, meanMinutes: 10 });
    expect(noteCompletion(events)).toEqual({ count: 1, medianMinutes: 3, meanMinutes: 3 });
  });
});

describe('estimated time saved', () => {
  it('multiplies charts taken in by the clinic stated paper minutes', () => {
    const events = [
      event({ type: 'INTAKE_SUBMITTED', durationMs: 60_000 }),
      event({ type: 'INTAKE_SUBMITTED', durationMs: null }),
      event({ type: 'NOTE_SIGNED' }),
    ];
    expect(transcriptionAvoided(events)).toEqual({
      charts: 2,
      estimatedMinutesSaved: 2 * PAPER_CHART_MINUTES,
    });
    expect(PAPER_CHART_MINUTES).toBe(60);
  });

  it('credits only visits the patient booked themselves', () => {
    const load = frontDeskLoad([
      appointment({ source: 'PORTAL' }),
      appointment({ source: 'PUBLIC' }),
      appointment({ source: 'STAFF' }),
      appointment({ source: 'STAFF' }),
    ]);
    expect(load).toEqual({
      total: 4,
      selfBooked: 2,
      staffBooked: 2,
      selfBookedPercent: 50,
      estimatedMinutesSaved: 2 * FRONT_DESK_MINUTES_PER_VISIT,
    });
  });
});

describe('visit to signed note', () => {
  it('pairs each completed visit with that patient next signature', () => {
    const events = [
      event({ type: 'APPOINTMENT_COMPLETED', patientId: 'a', occurredAt: T0 }),
      event({ type: 'NOTE_SIGNED', patientId: 'a', occurredAt: at(30) }),
      event({ type: 'APPOINTMENT_COMPLETED', patientId: 'b', occurredAt: at(10) }),
      event({ type: 'NOTE_SIGNED', patientId: 'b', occurredAt: at(20) }),
    ];
    expect(completionToSignedNote(events)).toEqual({
      count: 2,
      medianMinutes: 20,
      meanMinutes: 20,
    });
  });

  it('never pairs across patients or backwards in time', () => {
    const events = [
      event({ type: 'APPOINTMENT_COMPLETED', patientId: 'a', occurredAt: at(60) }),
      /// Signed before the visit was closed out, and for someone else entirely.
      event({ type: 'NOTE_SIGNED', patientId: 'a', occurredAt: T0 }),
      event({ type: 'NOTE_SIGNED', patientId: 'b', occurredAt: at(90) }),
    ];
    expect(completionToSignedNote(events).count).toBe(0);
  });

  it('does not let one note close two visits', () => {
    const events = [
      event({ type: 'APPOINTMENT_COMPLETED', patientId: 'a', occurredAt: T0 }),
      event({ type: 'APPOINTMENT_COMPLETED', patientId: 'a', occurredAt: at(5) }),
      event({ type: 'NOTE_SIGNED', patientId: 'a', occurredAt: at(15) }),
    ];
    expect(completionToSignedNote(events).count).toBe(1);
  });
});

describe('utilisation', () => {
  it('measures booked minutes against practitioner hours and against the rooms', () => {
    /// Two hours booked out of an eight-hour day across five rooms.
    const result = utilisation(
      [appointment(), appointment({ startsAt: at(60), endsAt: at(120) })],
      8 * 60,
      5,
    );
    expect(result.bookedMinutes).toBe(120);
    expect(result.appointmentPercent).toBe(25);
    expect(result.roomPercent).toBe(5);
  });

  it('frees the time a cancellation or a no-show gave back', () => {
    const result = utilisation(
      [
        appointment({ status: 'CANCELLED' }),
        appointment({ status: 'NO_SHOW' }),
        appointment({ status: 'BOOKED' }),
      ],
      8 * 60,
      1,
    );
    expect(result.bookedMinutes).toBe(60);
  });

  it('reports nothing rather than dividing by a closed day', () => {
    expect(utilisation([appointment()], 0, 5).appointmentPercent).toBe(0);
  });
});

describe('no-show rate', () => {
  it('counts no-shows against visits that were meant to happen', () => {
    const rate = noShowRate([
      appointment(),
      appointment(),
      appointment(),
      appointment({ status: 'NO_SHOW' }),
      /// A patient who called ahead is not a no-show and must not inflate the rate.
      appointment({ status: 'CANCELLED' }),
      appointment({ status: 'CANCELLED' }),
    ]);
    expect(rate).toEqual({ completed: 3, noShows: 1, percent: 25 });
  });

  it('is zero, not NaN, on a week with no visits', () => {
    expect(noShowRate([]).percent).toBe(0);
  });
});
