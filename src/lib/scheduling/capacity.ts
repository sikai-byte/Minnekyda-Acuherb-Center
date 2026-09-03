import { prisma } from '@/lib/db';
import {
  addDays,
  clinicDayEnd,
  clinicDayStart,
  clinicIsoDate,
  clinicTimeToUtc,
  clinicWeekday,
} from './time';

/// The Weekly Clinic Capacity report: how the week was used, and where it was empty.
///
/// The arithmetic is pure and lives in `summarise` / `openCapacity`, so it can be asserted
/// against fixtures without a database. The denominators come from the same
/// `PractitionerAvailability` and `TreatmentRoom` rows the booking engine reads, so this
/// report cannot claim capacity the calendar would never have offered.
///
/// Nothing here reads a patient's name, and nothing reads a note. A visit is counted as a
/// first visit or a returning visit from its appointment type, which is scheduling data.

export type CapacityAppointment = {
  startsAt: Date;
  endsAt: Date;
  status: 'REQUESTED' | 'SCHEDULED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  practitionerId: string;
  roomId: string | null;
  firstVisit: boolean;
};

export type CapacityWindow = { fromIso: string; toIso: string };

export type UsedMinutes = { id: string; name: string; minutes: number; rate: number };

export type CapacitySummary = {
  booked: number;
  completed: number;
  cancelled: number;
  noShows: number;
  firstVisits: number;
  returning: number;
  bookedMinutes: number;
  openMinutes: number;
  roomMinutes: number;
  /// Booked room-minutes over the room-minutes the clinic was open for.
  fillRate: number;
  /// Of the visits that were meant to happen, how many did.
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
};

export type OpenBlock = { isoDate: string; startMinute: number; endMinute: number };

/// Attendance is only meaningful for visits that have already been dealt with, so the rates
/// use the closed-out count as their denominator rather than everything on the calendar.
const CLOSED_OUT = ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

/// Cancellations and no-shows are counted, but they occupy nothing: their room went back on
/// sale the moment the front desk tapped the button.
const OCCUPIES = ['REQUESTED', 'SCHEDULED', 'CHECKED_IN', 'COMPLETED'] as const;

function minutes(appointment: CapacityAppointment): number {
  return Math.max(0, (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000);
}

function rate(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

export function summarise(
  appointments: CapacityAppointment[],
  openMinutes: number,
  rooms: number,
): CapacitySummary {
  const counted = (statuses: readonly string[]) =>
    appointments.filter((appointment) => statuses.includes(appointment.status));

  const occupying = counted(OCCUPIES);
  const closedOut = counted(CLOSED_OUT).length;
  const bookedMinutes = occupying.reduce((total, appointment) => total + minutes(appointment), 0);
  const roomMinutes = openMinutes * rooms;

  return {
    booked: appointments.length,
    completed: counted(['COMPLETED']).length,
    cancelled: counted(['CANCELLED']).length,
    noShows: counted(['NO_SHOW']).length,
    firstVisits: occupying.filter((appointment) => appointment.firstVisit).length,
    returning: occupying.filter((appointment) => !appointment.firstVisit).length,
    bookedMinutes,
    openMinutes,
    roomMinutes,
    fillRate: rate(bookedMinutes, roomMinutes),
    completionRate: rate(counted(['COMPLETED']).length, closedOut),
    cancellationRate: rate(counted(['CANCELLED']).length, closedOut),
    noShowRate: rate(counted(['NO_SHOW']).length, closedOut),
  };
}

/// Minutes each practitioner actually worked against the minutes they were rostered for.
export function practitionerUse(
  appointments: CapacityAppointment[],
  rostered: { id: string; name: string; minutes: number }[],
): UsedMinutes[] {
  return rostered
    .map((practitioner) => {
      const used = appointments
        .filter(
          (appointment) =>
            appointment.practitionerId === practitioner.id &&
            OCCUPIES.includes(appointment.status as (typeof OCCUPIES)[number]),
        )
        .reduce((total, appointment) => total + minutes(appointment), 0);
      return {
        id: practitioner.id,
        name: practitioner.name,
        minutes: used,
        rate: rate(used, practitioner.minutes),
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
}

/// The same for the treatment tables. Its denominator is the clinic's open minutes, because a
/// room is only sellable while somebody is here to treat in it.
export function roomUse(
  appointments: CapacityAppointment[],
  rooms: { id: string; name: string }[],
  openMinutes: number,
): UsedMinutes[] {
  return rooms.map((room) => {
    const used = appointments
      .filter(
        (appointment) =>
          appointment.roomId === room.id &&
          OCCUPIES.includes(appointment.status as (typeof OCCUPIES)[number]),
      )
      .reduce((total, appointment) => total + minutes(appointment), 0);
    return { id: room.id, name: room.name, minutes: used, rate: rate(used, openMinutes) };
  });
}

/// Where the week is empty, expressed the way the front desk thinks about it: this day, from
/// this time to this time, at least one room and one practitioner free.
///
/// Computed from clinic-local minutes rather than instants so a DST week still reads as seven
/// ordinary days.
export function openCapacity(
  days: { isoDate: string; windows: { startMinute: number; endMinute: number }[] }[],
  appointments: CapacityAppointment[],
  rooms: number,
  stepMinutes: number,
): OpenBlock[] {
  const blocks: OpenBlock[] = [];

  for (const day of days) {
    const taken = appointments.filter(
      (appointment) =>
        OCCUPIES.includes(appointment.status as (typeof OCCUPIES)[number]) &&
        clinicIsoDate(appointment.startsAt) === day.isoDate,
    );

    for (const window of day.windows) {
      /// Adjacent free steps are reported as one block, so a quiet Tuesday reads "9:00–17:00"
      /// rather than thirty-two lines.
      let open: OpenBlock | null = null;
      for (
        let minute = window.startMinute;
        minute + stepMinutes <= window.endMinute;
        minute += stepMinutes
      ) {
        /// Resolved through the clinic's calendar, not by adding minutes to midnight, so the
        /// spring-forward hour is skipped rather than reported as free.
        const start = clinicTimeToUtc(day.isoDate, minute);
        if (!start) {
          open = null;
          continue;
        }
        const from = start.getTime();
        const to = from + stepMinutes * 60_000;
        const busy = taken.filter(
          (appointment) =>
            appointment.startsAt.getTime() < to && from < appointment.endsAt.getTime(),
        ).length;

        if (busy >= rooms) {
          open = null;
          continue;
        }
        if (open && open.endMinute === minute) {
          open.endMinute = minute + stepMinutes;
          continue;
        }
        open = { isoDate: day.isoDate, startMinute: minute, endMinute: minute + stepMinutes };
        blocks.push(open);
      }
    }
  }

  return blocks;
}

export type CapacityReport = {
  window: CapacityWindow;
  summary: CapacitySummary;
  practitioners: UsedMinutes[];
  rooms: UsedMinutes[];
  open: OpenBlock[];
};

/// Monday-to-Sunday, because that is how the clinic reads its week.
export function weekOf(isoDate: string): CapacityWindow {
  const weekday = clinicWeekday(isoDate);
  const fromIso = addDays(isoDate, weekday === 0 ? -6 : 1 - weekday);
  return { fromIso, toIso: addDays(fromIso, 6) };
}

export async function capacityReport(window: CapacityWindow): Promise<CapacityReport> {
  const from = clinicDayStart(window.fromIso);
  const to = clinicDayEnd(window.toIso);

  const [rows, rooms, roster, policy] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: from, lt: to } },
      orderBy: { startsAt: 'asc' },
      /// Times, statuses and ids only. No patient is read, so this whole report is incapable
      /// of naming one.
      select: {
        startsAt: true,
        endsAt: true,
        status: true,
        practitionerId: true,
        roomId: true,
        appointmentType: { select: { firstVisit: true } },
      },
    }),
    prisma.treatmentRoom.findMany({
      where: { active: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { active: true, availability: { some: {} } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        availability: { select: { weekday: true, startMinute: true, endMinute: true } },
      },
    }),
    prisma.schedulingPolicy.findUnique({
      where: { id: 'default' },
      select: { slotStepMinutes: true },
    }),
  ]);

  const appointments: CapacityAppointment[] = rows.map((row) => ({
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    practitionerId: row.practitionerId,
    roomId: row.roomId,
    firstVisit: row.appointmentType.firstVisit,
  }));

  const dates: string[] = [];
  for (let day = window.fromIso; day <= window.toIso; day = addDays(day, 1)) dates.push(day);

  /// One roster read, then the week is expanded in memory: seven days times a handful of
  /// availability rules, rather than a query per day.
  const rostered = roster.map((practitioner) => ({
    id: practitioner.id,
    name: practitioner.name,
    minutes: dates.reduce((total, day) => {
      const weekday = clinicWeekday(day);
      return (
        total +
        practitioner.availability
          .filter((rule) => rule.weekday === weekday)
          .reduce((sum, rule) => sum + Math.max(0, rule.endMinute - rule.startMinute), 0)
      );
    }, 0),
  }));

  const days = dates.map((isoDate) => {
    const weekday = clinicWeekday(isoDate);
    return {
      isoDate,
      windows: mergeWindows(
        roster.flatMap((practitioner) =>
          practitioner.availability
            .filter((rule) => rule.weekday === weekday)
            .map((rule) => ({ startMinute: rule.startMinute, endMinute: rule.endMinute })),
        ),
      ),
    };
  });

  const openMinutes = days.reduce(
    (total, day) =>
      total + day.windows.reduce((sum, window_) => sum + (window_.endMinute - window_.startMinute), 0),
    0,
  );

  return {
    window,
    summary: summarise(appointments, openMinutes, rooms.length),
    practitioners: practitionerUse(appointments, rostered),
    rooms: roomUse(appointments, rooms, openMinutes),
    open: openCapacity(days, appointments, rooms.length, policy?.slotStepMinutes ?? 15),
  };
}

/// Two practitioners both working nine to five is one nine-to-five the clinic is open for, not
/// sixteen hours of it.
export function mergeWindows(
  windows: { startMinute: number; endMinute: number }[],
): { startMinute: number; endMinute: number }[] {
  return [...windows]
    .sort((a, b) => a.startMinute - b.startMinute)
    .reduce<{ startMinute: number; endMinute: number }[]>((merged, window) => {
      const last = merged.at(-1);
      if (last && window.startMinute <= last.endMinute) {
        last.endMinute = Math.max(last.endMinute, window.endMinute);
        return merged;
      }
      merged.push({ ...window });
      return merged;
    }, []);
}
