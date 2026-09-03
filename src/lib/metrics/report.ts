import { prisma } from '@/lib/db';
import { dayStart, toIsoDate } from '@/lib/scheduling/slots';
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
  const toIso = toIsoDate(today);
  const from = new Date(dayStart(toIso).getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { fromIso: toIsoDate(from), toIso };
}

/// The practitioners' working minutes across the window, which is the denominator for both
/// utilisation figures. Read from the same `AvailabilityRule` rows the booking engine uses, so
/// a report can never claim capacity the calendar would not have offered.
async function openMinutesBetween(from: Date, to: Date): Promise<number> {
  const rules = await prisma.availabilityRule.findMany({
    where: { practitioner: { active: true } },
    select: { weekday: true, startMinute: true, endMinute: true },
  });

  let minutes = 0;
  for (let day = new Date(from); day < to; day = new Date(day.getTime() + 24 * 60 * 60 * 1000)) {
    const weekday = day.getUTCDay();
    for (const rule of rules) {
      if (rule.weekday === weekday) minutes += rule.endMinute - rule.startMinute;
    }
  }
  return minutes;
}

export async function clinicReport(window: ReportWindow): Promise<ClinicReport> {
  const from = dayStart(window.fromIso);
  const to = new Date(dayStart(window.toIso).getTime() + 24 * 60 * 60 * 1000);

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
    prisma.room.count({ where: { active: true } }),
    openMinutesBetween(from, to),
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
