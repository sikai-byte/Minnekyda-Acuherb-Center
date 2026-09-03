import type { AppointmentStatus, BookingSource, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { recordEvent } from '@/lib/telemetry';
import {
  addMinutes,
  bookableSlots,
  dayStart,
  slotIsOpen,
  type Busy,
  type Slot,
  type WorkingWindow,
} from './slots';

/// Everything that reads or writes the calendar. Kept apart from the server actions so the
/// staff, portal and public entry points share one set of rules: they differ only in who may
/// call them and which patient they are allowed to name.

/// Statuses that still occupy a room and a practitioner. A cancellation or a no-show frees
/// the time; a completed visit keeps it, because it happened.
export const OCCUPYING_STATUSES: AppointmentStatus[] = [
  'REQUESTED',
  'BOOKED',
  'CHECKED_IN',
  'COMPLETED',
];

/// A patient booking themselves gets a two-hour cushion so the front desk is never surprised
/// by someone walking in ten minutes after clicking.
export const SELF_BOOKING_NOTICE_MINUTES = 120;

export async function activeRooms() {
  return prisma.room.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
}

export async function bookableServices(scope: 'public' | 'portal' | 'staff') {
  return prisma.service.findMany({
    where: {
      active: true,
      ...(scope === 'public' ? { publiclyBookable: true, firstVisit: true } : {}),
      ...(scope === 'portal' ? { publiclyBookable: true } : {}),
    },
    orderBy: { minutes: 'asc' },
    select: { id: true, slug: true, name: true, description: true, minutes: true, firstVisit: true },
  });
}

export async function bookablePractitioners() {
  return prisma.user.findMany({
    where: { active: true, role: { in: ['PRACTITIONER', 'ADMIN'] }, availability: { some: {} } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, credentials: true },
  });
}

async function workingWindows(practitionerId: string, isoDate: string): Promise<WorkingWindow[]> {
  const weekday = dayStart(isoDate).getUTCDay();
  const rules = await prisma.availabilityRule.findMany({
    where: { practitionerId, weekday },
    orderBy: { startMinute: 'asc' },
    select: { startMinute: true, endMinute: true },
  });
  return rules;
}

/// Appointments are the only thing that makes a room or a practitioner busy, and only their
/// times are read here — never the patient they belong to.
async function busyOn(isoDate: string): Promise<Busy[]> {
  const from = dayStart(isoDate);
  const to = addMinutes(from, 24 * 60);
  const appointments = await prisma.appointment.findMany({
    where: { status: { in: OCCUPYING_STATUSES }, startsAt: { gte: from, lt: to } },
    select: { startsAt: true, endsAt: true, roomId: true, practitionerId: true },
  });
  return appointments;
}

async function closuresOn(practitionerId: string, isoDate: string) {
  const from = dayStart(isoDate);
  const to = addMinutes(from, 24 * 60);
  const away = await prisma.timeOff.findMany({
    where: {
      OR: [{ practitionerId }, { practitionerId: null }],
      startsAt: { lt: to },
      endsAt: { gt: from },
    },
    select: { startsAt: true, endsAt: true },
  });
  return away;
}

type SlotQuery = {
  practitionerId: string;
  serviceId: string;
  isoDate: string;
  minNoticeMinutes?: number;
};

async function slotContext({ practitionerId, serviceId, isoDate }: SlotQuery) {
  const [service, rooms, windows, busy, closures] = await Promise.all([
    prisma.service.findFirst({ where: { id: serviceId, active: true }, select: { minutes: true } }),
    activeRooms(),
    workingWindows(practitionerId, isoDate),
    busyOn(isoDate),
    closuresOn(practitionerId, isoDate),
  ]);
  return { service, rooms, windows, busy, closures };
}

/// The open times for one practitioner, one service, one day. Returns times only: the caller
/// renders them to a patient who has no business knowing who else is booked.
export async function openSlots(query: SlotQuery): Promise<Slot[]> {
  const { service, rooms, windows, busy, closures } = await slotContext(query);
  if (!service || windows.length === 0) return [];

  return bookableSlots({
    isoDate: query.isoDate,
    minutes: service.minutes,
    windows,
    practitionerId: query.practitionerId,
    rooms,
    busy,
    closures,
    now: new Date(),
    minNoticeMinutes: query.minNoticeMinutes ?? 0,
  });
}

export type BookingRequest = {
  patientId: string;
  practitionerId: string;
  serviceId: string;
  startsAt: Date;
  source: BookingSource;
  createdById?: string | null;
  status?: AppointmentStatus;
  minNoticeMinutes?: number;
  /// The appointment being moved, so its own time does not block the move.
  replacingId?: string;
};

export type BookingResult =
  | { ok: true; appointmentId: string; startsAt: Date; endsAt: Date; roomId: string }
  | { ok: false; reason: string };

/// Books one appointment, re-checking the slot inside the transaction that writes it. Two
/// people clicking the same 3pm is normal — a browser is looking at a snapshot — so the
/// answer cannot come from the list the browser rendered. The advisory lock serialises
/// bookings for the day being written, which is cheap and keeps overlap checks honest
/// without relying on the caller to be first.
export async function bookAppointment(request: BookingRequest): Promise<BookingResult> {
  const isoDate = request.startsAt.toISOString().slice(0, 10);

  const service = await prisma.service.findFirst({
    where: { id: request.serviceId, active: true },
    select: { id: true, minutes: true },
  });
  if (!service) return { ok: false, reason: 'That visit type is no longer offered.' };

  const endsAt = addMinutes(request.startsAt, service.minutes);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${isoDate}`}))`;

    const [rooms, windows, closures, busyRows] = await Promise.all([
      tx.room.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      tx.availabilityRule.findMany({
        where: { practitionerId: request.practitionerId, weekday: dayStart(isoDate).getUTCDay() },
        select: { startMinute: true, endMinute: true },
      }),
      tx.timeOff.findMany({
        where: {
          OR: [{ practitionerId: request.practitionerId }, { practitionerId: null }],
          startsAt: { lt: endsAt },
          endsAt: { gt: request.startsAt },
        },
        select: { startsAt: true, endsAt: true },
      }),
      tx.appointment.findMany({
        where: {
          status: { in: OCCUPYING_STATUSES },
          startsAt: { lt: endsAt },
          endsAt: { gt: request.startsAt },
          ...(request.replacingId ? { id: { not: request.replacingId } } : {}),
        },
        select: { startsAt: true, endsAt: true, roomId: true, practitionerId: true },
      }),
    ]);

    if (windows.length === 0) {
      return { ok: false as const, reason: 'That practitioner does not work then.' };
    }

    const check = slotIsOpen(
      { startsAt: request.startsAt, endsAt },
      {
        windows,
        practitionerId: request.practitionerId,
        rooms,
        busy: busyRows,
        closures,
        now: new Date(),
        minNoticeMinutes: request.minNoticeMinutes ?? 0,
      },
    );
    if (!check.ok) return { ok: false as const, reason: check.reason };

    const data: Prisma.AppointmentUncheckedCreateInput = {
      patientId: request.patientId,
      practitionerId: request.practitionerId,
      serviceId: service.id,
      roomId: check.roomId,
      startsAt: request.startsAt,
      endsAt,
      status: request.status ?? 'BOOKED',
      source: request.source,
      createdById: request.createdById ?? null,
    };

    if (request.replacingId) {
      await tx.appointment.update({
        where: { id: request.replacingId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    }

    const created = await tx.appointment.create({ data, select: { id: true, startsAt: true, endsAt: true } });
    return {
      ok: true as const,
      appointmentId: created.id,
      startsAt: created.startsAt,
      endsAt: created.endsAt,
      roomId: check.roomId,
    };
  });

  /// Outside the transaction on purpose: which door a booking came through is worth measuring,
  /// but never at the price of failing the booking.
  if (result.ok) {
    await recordEvent({
      type: 'APPOINTMENT_BOOKED',
      patientId: request.patientId,
      userId: request.createdById,
      appointmentId: result.appointmentId,
      serviceId: service.id,
      roomId: result.roomId,
      source: request.source,
      minutes: service.minutes,
    });
  }

  return result;
}
