import { prisma } from '@/lib/db';
import {
  addDays,
  clinicDayEnd,
  clinicDayStart,
  clinicIsoDate,
  clinicWeekday,
} from '@/lib/scheduling/time';
import {
  completionToSignedNote,
  frontDeskLoad,
  intakeCompletion,
  noShowRate,
  noteCompletion,
  transcriptionAvoided,
  utilisation,
  type AppointmentRow,
  type EventRow,
} from './clinic';

export type ReportWindow = { fromIso: string; toIso: string };

export type ClinicReport = {
  window: ReportWindow;
  intake: ReturnType<typeof intakeCompletion>;
  note: ReturnType<typeof noteCompletion>;
  transcription: ReturnType<typeof transcriptionAvoided>;
  noteLag: ReturnType<typeof completionToSignedNote>;
  utilisation: ReturnType<typeof utilisation> & { openMinutes: number; rooms: number };
  noShow: ReturnType<typeof noShowRate>;
  frontDesk: ReturnType<typeof frontDeskLoad>;
};

export function lastDays(days: number, today = new Date()): ReportWindow {
  const toIso = clinicIsoDate(today);
  return { fromIso: addDays(toIso, -(days - 1)), toIso };
}

/// The practitioners' working minutes across the window, which is the denominator for both
/// utilisation figures. Read from the same `PractitionerAvailability` rows the booking engine
/// uses, so a report can never claim capacity the calendar would not have offered. Days are
/// walked in clinic-local dates, so a DST week is 7 days rather than 7 × 24 hours.
async function openMinutesBetween(fromIso: string, toIso: string): Promise<number> {
  const rules = await prisma.practitionerAvailability.findMany({
    where: { practitioner: { active: true } },
    select: { weekday: true, startMinute: true, endMinute: true },
  });

  let minutes = 0;
  for (let day = fromIso; day <= toIso; day = addDays(day, 1)) {
    const weekday = clinicWeekday(day);
    for (const rule of rules) {
      if (rule.weekday === weekday) minutes += rule.endMinute - rule.startMinute;
    }
  }
  return minutes;
}

export async function clinicReport(window: ReportWindow): Promise<ClinicReport> {
  const from = clinicDayStart(window.fromIso);
  const to = clinicDayEnd(window.toIso);

  const [events, appointments, rooms, openMinutes] = await Promise.all([
    prisma.clinicEvent.findMany({
      where: { occurredAt: { gte: from, lt: to } },
      select: {
        type: true,
        occurredAt: true,
        durationMs: true,
        patientId: true,
        userId: true,
        source: true,
        minutes: true,
      },
    }) as Promise<EventRow[]>,
    prisma.appointment.findMany({
      where: { startsAt: { gte: from, lt: to } },
      select: { startsAt: true, endsAt: true, status: true, source: true },
    }) as Promise<AppointmentRow[]>,
    prisma.treatmentRoom.count({ where: { active: true } }),
    openMinutesBetween(window.fromIso, window.toIso),
  ]);

  return {
    window,
    intake: intakeCompletion(events),
    note: noteCompletion(events),
    transcription: transcriptionAvoided(events),
    noteLag: completionToSignedNote(events),
    utilisation: { ...utilisation(appointments, openMinutes, rooms), openMinutes, rooms },
    noShow: noShowRate(appointments),
    frontDesk: frontDeskLoad(appointments),
  };
}
