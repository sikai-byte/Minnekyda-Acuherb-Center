import type { AppointmentStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { capacityPolicy, schedulingSettings, type SchedulingSettings } from './policy';
import {
  bookableSlots,
  type ActivePhases,
  type Busy,
  type Slot,
  type WorkingWindow,
} from './slots';
import { addDays, clinicDayEnd, clinicDayStart, clinicIsoDate, clinicWeekday, isIsoDate } from './time';

/// The single source of truth for "when can this be booked".
///
/// Staff booking, portal booking, the public website and any future API all come through
/// `getAvailableSlots`, and the booking transaction re-checks the same rules against the same
/// tables. Nothing in a client component computes availability: a browser that could decide
/// what is free could also decide to double-book a room.

/// Statuses that still occupy a room and a practitioner. A cancellation or a no-show frees the
/// time immediately; a completed visit keeps it, because it happened.
export const OCCUPYING_STATUSES: AppointmentStatus[] = [
  'REQUESTED',
  'SCHEDULED',
  'CHECKED_IN',
  'COMPLETED',
];

export type BookingScope = 'public' | 'portal' | 'staff';

export async function activeRooms() {
  return prisma.treatmentRoom.findMany({
    where: { active: true },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
}

export async function bookableAppointmentTypes(scope: BookingScope) {
  return prisma.appointmentType.findMany({
    where: {
      active: true,
      ...(scope === 'public' ? { publiclyBookable: true, firstVisit: true } : {}),
      ...(scope === 'portal' ? { publiclyBookable: true } : {}),
    },
    orderBy: { minutes: 'asc' },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      minutes: true,
      firstVisit: true,
    },
  });
}

export async function bookablePractitioners() {
  return prisma.user.findMany({
    where: { active: true, role: { in: ['PRACTITIONER', 'ADMIN'] }, availability: { some: {} } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, credentials: true },
  });
}

export async function workingWindows(
  practitionerId: string,
  isoDate: string,
): Promise<WorkingWindow[]> {
  return prisma.practitionerAvailability.findMany({
    where: { practitionerId, weekday: clinicWeekday(isoDate) },
    orderBy: { startMinute: 'asc' },
    select: { startMinute: true, endMinute: true },
  });
}

/// The two columns every capacity question needs from a visit type, and the shape the slot
/// engine wants them in.
export const activePhaseSelect = {
  practitionerLeadMinutes: true,
  practitionerCloseMinutes: true,
} satisfies Prisma.AppointmentTypeSelect;

export function activePhases(type: {
  practitionerLeadMinutes: number | null;
  practitionerCloseMinutes: number | null;
}): ActivePhases {
  return {
    leadMinutes: type.practitionerLeadMinutes,
    closeMinutes: type.practitionerCloseMinutes,
  };
}

/// Appointments are the only thing that makes a room or a practitioner busy, and only their
/// times are read here — never the patient they belong to. That is deliberate: the availability
/// path is reachable by a stranger on the public form.
export async function busyOn(isoDate: string): Promise<Busy[]> {
  /// The visit type is joined for its active phases alone — how much of each booked visit
  /// needs the practitioner — which is scheduling arithmetic, not anything about the patient.
  return prisma.appointment.findMany({
    where: {
      status: { in: OCCUPYING_STATUSES },
      startsAt: { lt: clinicDayEnd(isoDate) },
      endsAt: { gt: clinicDayStart(isoDate) },
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      roomId: true,
      practitionerId: true,
      appointmentType: { select: activePhaseSelect },
    },
  }).then((rows) =>
    rows.map(({ id, appointmentType, ...rest }) => ({
      ...rest,
      appointmentId: id,
      phases: activePhases(appointmentType),
    })),
  );
}

export async function closuresOn(practitionerId: string, isoDate: string) {
  return prisma.clinicClosure.findMany({
    where: {
      OR: [{ practitionerId }, { practitionerId: null }],
      startsAt: { lt: clinicDayEnd(isoDate) },
      endsAt: { gt: clinicDayStart(isoDate) },
    },
    select: { startsAt: true, endsAt: true },
  });
}

export type SlotQuery = {
  /// Null means "any practitioner", which is what most patients actually want.
  practitionerId: string | null;
  appointmentTypeId: string;
  /// `YYYY-MM-DD` in the clinic's timezone.
  date: string;
  minNoticeMinutes?: number;
  /// The appointment being moved, so its own time does not block its own reschedule.
  ignoreAppointmentId?: string;
  now?: Date;
};

/// A time on offer. The room is chosen here and carried through to the write, but only staff
/// screens ever render it: patients are asked when, never where.
export type OfferedSlot = Slot & { practitionerId: string };

export async function getAvailableSlots(query: SlotQuery): Promise<OfferedSlot[]> {
  if (!isIsoDate(query.date)) return [];

  const settings = await schedulingSettings();
  const now = query.now ?? new Date();
  if (!withinHorizon(query.date, settings, now)) return [];

  const [appointmentType, rooms, busy] = await Promise.all([
    prisma.appointmentType.findFirst({
      where: { id: query.appointmentTypeId, active: true },
      select: { id: true, minutes: true, ...activePhaseSelect },
    }),
    activeRooms(),
    busyOn(query.date),
  ]);
  if (!appointmentType) return [];

  const practitionerIds = query.practitionerId
    ? [query.practitionerId]
    : (await bookablePractitioners()).map((practitioner) => practitioner.id);

  const perPractitioner = await Promise.all(
    practitionerIds.map(async (practitionerId) => {
      const [windows, closures] = await Promise.all([
        workingWindows(practitionerId, query.date),
        closuresOn(practitionerId, query.date),
      ]);
      if (windows.length === 0) return [];
      return bookableSlots({
        isoDate: query.date,
        minutes: appointmentType.minutes,
        phases: activePhases(appointmentType),
        windows,
        practitionerId,
        rooms,
        busy,
        closures,
        now,
        minNoticeMinutes: query.minNoticeMinutes ?? 0,
        policy: capacityPolicy(settings),
        ignoreAppointmentId: query.ignoreAppointmentId,
      }).map((slot) => ({ ...slot, practitionerId }));
    }),
  );

  return perPractitioner.flat().sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/// One entry per distinct start time, with a practitioner attached. This is what a patient
/// picker renders: three practitioners free at 3pm is one 3pm on the screen, and which of them
/// the patient gets is not information about anyone else's appointment.
export function distinctStarts(slots: OfferedSlot[]): OfferedSlot[] {
  const seen = new Set<number>();
  return slots.filter((slot) => {
    const key = slot.startsAt.getTime();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function withinHorizon(isoDate: string, settings: SchedulingSettings, now: Date): boolean {
  const today = clinicIsoDate(now);
  return isoDate >= today && isoDate <= addDays(today, settings.bookingHorizonDays);
}

/// The room-minutes the practitioners were open for on a day, which is the denominator every
/// utilisation number needs and the only honest way to say a day was "half full".
export async function openMinutesOn(isoDate: string): Promise<number> {
  const rules = await prisma.practitionerAvailability.findMany({
    where: { weekday: clinicWeekday(isoDate) },
    select: { startMinute: true, endMinute: true },
  });
  return rules.reduce((total, rule) => total + Math.max(0, rule.endMinute - rule.startMinute), 0);
}

export type DayAppointment = Prisma.AppointmentGetPayload<{
  select: typeof dayAppointmentSelect;
}>;

/// What the day views read. Every relation the screen needs is joined in this one query —
/// there is no per-row lookup anywhere in the schedule pages — and note content is not among
/// them, so the front desk's busiest screen cannot leak a chart.
export const dayAppointmentSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  source: true,
  roomId: true,
  practitionerId: true,
  patientId: true,
  checkedInAt: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      selfRegisteredAt: true,
    },
  },
  practitioner: { select: { id: true, name: true } },
  appointmentType: { select: { id: true, name: true, minutes: true, firstVisit: true } },
  room: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentSelect;

export async function appointmentsOn(
  isoDate: string,
  where: Prisma.AppointmentWhereInput = {},
): Promise<DayAppointment[]> {
  return prisma.appointment.findMany({
    where: {
      ...where,
      startsAt: { lt: clinicDayEnd(isoDate) },
      endsAt: { gt: clinicDayStart(isoDate) },
    },
    orderBy: { startsAt: 'asc' },
    select: dayAppointmentSelect,
  });
}
