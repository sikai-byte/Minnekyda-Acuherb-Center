import type {
  AppointmentEventType,
  AppointmentStatus,
  BookingSource,
  Prisma,
  Role,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { recordEvent } from '@/lib/telemetry';
import { OCCUPYING_STATUSES } from './availability';
import { capacityPolicy, schedulingSettings } from './policy';
import { addMinutes, slotIsOpen } from './slots';
import { clinicIsoDate, clinicWeekday, minutesBetween } from './time';

/// Every write to the calendar. The reads live in `availability.ts`; both consult the same
/// rules, and the rules are re-evaluated inside the writing transaction rather than trusted
/// from the browser — the slot list a patient is looking at is a snapshot, and two people can
/// want the same three o'clock.

/// Who is asking. Recorded on the appointment's history so an admin can answer "who moved
/// this" without guessing from timestamps.
export type Actor = {
  id: string | null;
  role: Role | null;
  source: BookingSource;
};

export type BookingRequest = {
  patientId: string;
  practitionerId: string;
  appointmentTypeId: string;
  startsAt: Date;
  actor: Actor;
  /// Public website requests land as REQUESTED and hold their capacity until the front desk
  /// confirms the identity behind them.
  status?: AppointmentStatus;
  minNoticeMinutes?: number;
};

export type BookingFailure = { ok: false; reason: string };

export type BookingResult =
  | { ok: true; appointmentId: string; startsAt: Date; endsAt: Date; roomId: string }
  | BookingFailure;

/// Wording chosen so a patient learns only that a time is gone. "That practitioner is already
/// booked" would tell a stranger that someone is being treated at three o'clock.
const UNAVAILABLE = 'That time is no longer available. Pick another.';

function fail(reason: string): BookingFailure {
  return { ok: false, reason };
}

/// Locks the clinic's day, not the row: a booking's validity depends on every other
/// appointment that day, so two concurrent attempts on the last free room have to be
/// serialised against each other rather than against the record neither has created yet.
async function lockDay(tx: Prisma.TransactionClient, isoDate: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${isoDate}`}))`;
}

/// A move across midnight frees capacity on one day and takes it on another, so both days are
/// locked. Always in date order: two moves in opposite directions between the same two days
/// would otherwise be able to hold one lock each and wait forever for the other.
async function lockDays(tx: Prisma.TransactionClient, isoDates: string[]): Promise<void> {
  for (const isoDate of Array.from(new Set(isoDates)).sort()) {
    await lockDay(tx, isoDate);
  }
}

type SlotContext = {
  rooms: { id: string }[];
  windows: { startMinute: number; endMinute: number }[];
  closures: { startsAt: Date; endsAt: Date }[];
  busy: {
    appointmentId: string;
    startsAt: Date;
    endsAt: Date;
    roomId: string | null;
    practitionerId: string;
  }[];
};

async function slotContext(
  tx: Prisma.TransactionClient,
  practitionerId: string,
  isoDate: string,
  window: { startsAt: Date; endsAt: Date },
): Promise<SlotContext> {
  const [rooms, windows, closures, busy] = await Promise.all([
    tx.treatmentRoom.findMany({
      where: { active: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true },
    }),
    tx.practitionerAvailability.findMany({
      where: { practitionerId, weekday: clinicWeekday(isoDate) },
      select: { startMinute: true, endMinute: true },
    }),
    tx.clinicClosure.findMany({
      where: {
        OR: [{ practitionerId }, { practitionerId: null }],
        startsAt: { lt: window.endsAt },
        endsAt: { gt: window.startsAt },
      },
      select: { startsAt: true, endsAt: true },
    }),
    /// Widened by a day on each side so a visit that began before midnight still counts
    /// against the room it is sitting in.
    tx.appointment.findMany({
      where: {
        status: { in: OCCUPYING_STATUSES },
        startsAt: { lt: window.endsAt },
        endsAt: { gt: window.startsAt },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        roomId: true,
        practitionerId: true,
      },
    }),
  ]);

  return {
    rooms,
    windows,
    closures,
    busy: busy.map(({ id, ...rest }) => ({ ...rest, appointmentId: id })),
  };
}

/// Everything about the request that can be wrong before any capacity question is asked: a
/// discharged chart, a practitioner who has left, a visit type that was retired. Checked
/// server-side because all three are ids a browser could have kept from last week.
async function validateParties(
  tx: Prisma.TransactionClient,
  request: Pick<BookingRequest, 'patientId' | 'practitionerId' | 'appointmentTypeId'>,
): Promise<
  | { ok: true; minutes: number }
  | BookingFailure
> {
  const [patient, practitioner, appointmentType] = await Promise.all([
    tx.patient.findUnique({
      where: { id: request.patientId },
      select: { id: true, archivedAt: true },
    }),
    tx.user.findUnique({
      where: { id: request.practitionerId },
      select: { id: true, active: true, role: true },
    }),
    tx.appointmentType.findUnique({
      where: { id: request.appointmentTypeId },
      select: { id: true, minutes: true, active: true },
    }),
  ]);

  if (!patient || patient.archivedAt) return fail('That chart is archived.');
  if (!practitioner || !practitioner.active) {
    return fail('That practitioner is not taking appointments.');
  }
  if (practitioner.role !== 'PRACTITIONER' && practitioner.role !== 'ADMIN') {
    return fail('That practitioner is not taking appointments.');
  }
  if (!appointmentType || !appointmentType.active) {
    return fail('That visit type is no longer offered.');
  }
  if (appointmentType.minutes <= 0) return fail('That visit type has no length set.');

  return { ok: true, minutes: appointmentType.minutes };
}

type EventInput = {
  appointmentId: string;
  type: AppointmentEventType;
  actor: Actor;
  fromStatus?: AppointmentStatus | null;
  toStatus?: AppointmentStatus | null;
  fromStartsAt?: Date | null;
  toStartsAt?: Date | null;
  fromRoomId?: string | null;
  toRoomId?: string | null;
  fromPractitionerId?: string | null;
  toPractitionerId?: string | null;
};

/// Appointment history is written in the same transaction as the change it describes, so a
/// visit can never have been moved without the move being recorded.
export async function writeAppointmentEvent(
  tx: Prisma.TransactionClient,
  input: EventInput,
): Promise<void> {
  const { actor, ...rest } = input;
  await tx.appointmentEvent.create({
    data: {
      ...rest,
      actorId: actor.id,
      actorRole: actor.role,
      source: actor.source,
    },
  });
}

export async function bookAppointment(request: BookingRequest): Promise<BookingResult> {
  const settings = await schedulingSettings();
  const isoDate = clinicIsoDate(request.startsAt);

  const result = await prisma.$transaction(async (tx) => {
    await lockDay(tx, isoDate);

    const parties = await validateParties(tx, request);
    if (!parties.ok) return parties;

    const endsAt = addMinutes(request.startsAt, parties.minutes);
    const context = await slotContext(tx, request.practitionerId, isoDate, {
      startsAt: request.startsAt,
      endsAt,
    });
    if (context.windows.length === 0) {
      return fail('That practitioner does not work then.');
    }

    const check = slotIsOpen(
      { startsAt: request.startsAt, endsAt },
      {
        windows: context.windows,
        practitionerId: request.practitionerId,
        rooms: context.rooms,
        busy: context.busy,
        closures: context.closures,
        now: new Date(),
        minNoticeMinutes: request.minNoticeMinutes ?? 0,
        policy: capacityPolicy(settings),
      },
    );
    if (!check.ok) {
      return fail(request.actor.source === 'STAFF' ? check.reason : UNAVAILABLE);
    }

    const status = request.status ?? 'SCHEDULED';
    const created = await tx.appointment.create({
      data: {
        patientId: request.patientId,
        practitionerId: request.practitionerId,
        appointmentTypeId: request.appointmentTypeId,
        roomId: check.roomId,
        startsAt: request.startsAt,
        endsAt,
        status,
        source: request.actor.source,
        createdById: request.actor.id,
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    await writeAppointmentEvent(tx, {
      appointmentId: created.id,
      type: 'CREATED',
      actor: request.actor,
      toStatus: status,
      toStartsAt: created.startsAt,
      toRoomId: check.roomId,
      toPractitionerId: request.practitionerId,
    });

    return {
      ok: true as const,
      appointmentId: created.id,
      startsAt: created.startsAt,
      endsAt: created.endsAt,
      roomId: check.roomId,
      minutes: parties.minutes,
    };
  });

  /// Outside the transaction on purpose: which door a booking came through is worth measuring,
  /// but never at the price of failing the booking.
  if (result.ok) {
    await recordEvent({
      type: 'APPOINTMENT_BOOKED',
      patientId: request.patientId,
      userId: request.actor.id,
      appointmentId: result.appointmentId,
      appointmentTypeId: request.appointmentTypeId,
      roomId: result.roomId,
      source: request.actor.source,
      minutes: result.minutes,
    });
  }

  return result;
}

export type RescheduleRequest = {
  appointmentId: string;
  startsAt: Date;
  /// Omitted keeps the current practitioner; supplying a different one is a practitioner change
  /// and is recorded as one.
  practitionerId?: string;
  actor: Actor;
  minNoticeMinutes?: number;
};

/// Moves an appointment in place, in one transaction. The row is only touched once the new
/// time has been secured, so a failed move leaves the patient with the appointment they had
/// rather than with none — which is what would happen if this cancelled first and rebooked.
///
/// The identity of the appointment is preserved rather than replaced, so its history, its
/// clinical note and its check-in all still point at the same visit.
export async function rescheduleAppointment(request: RescheduleRequest): Promise<BookingResult> {
  const settings = await schedulingSettings();
  const isoDate = clinicIsoDate(request.startsAt);

  return prisma.$transaction(async (tx) => {
    /// Read before locking only to learn which day the visit is leaving; every capacity
    /// question below is asked again once both days are held.
    const where = await tx.appointment.findUnique({
      where: { id: request.appointmentId },
      select: { startsAt: true },
    });
    await lockDays(tx, where ? [clinicIsoDate(where.startsAt), isoDate] : [isoDate]);

    const existing = await tx.appointment.findUnique({
      where: { id: request.appointmentId },
      select: {
        id: true,
        patientId: true,
        practitionerId: true,
        appointmentTypeId: true,
        roomId: true,
        startsAt: true,
        status: true,
      },
    });
    if (!existing) return fail('That appointment no longer exists.');
    if (!OCCUPYING_STATUSES.includes(existing.status)) {
      return fail('That appointment is closed and cannot be moved.');
    }
    if (existing.status === 'COMPLETED') return fail('That visit has already happened.');

    const practitionerId = request.practitionerId ?? existing.practitionerId;
    const parties = await validateParties(tx, {
      patientId: existing.patientId,
      practitionerId,
      appointmentTypeId: existing.appointmentTypeId,
    });
    if (!parties.ok) return parties;

    const endsAt = addMinutes(request.startsAt, parties.minutes);
    const context = await slotContext(tx, practitionerId, isoDate, {
      startsAt: request.startsAt,
      endsAt,
    });
    if (context.windows.length === 0) return fail('That practitioner does not work then.');

    const check = slotIsOpen(
      { startsAt: request.startsAt, endsAt },
      {
        windows: context.windows,
        practitionerId,
        rooms: context.rooms,
        busy: context.busy,
        closures: context.closures,
        now: new Date(),
        minNoticeMinutes: request.minNoticeMinutes ?? 0,
        policy: capacityPolicy(settings),
        ignoreAppointmentId: existing.id,
      },
    );
    if (!check.ok) {
      return fail(request.actor.source === 'STAFF' ? check.reason : UNAVAILABLE);
    }

    const moved = await tx.appointment.update({
      where: { id: existing.id },
      data: {
        startsAt: request.startsAt,
        endsAt,
        roomId: check.roomId,
        practitionerId,
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    await writeAppointmentEvent(tx, {
      appointmentId: existing.id,
      type: 'RESCHEDULED',
      actor: request.actor,
      fromStartsAt: existing.startsAt,
      toStartsAt: moved.startsAt,
      fromRoomId: existing.roomId,
      toRoomId: check.roomId,
      fromPractitionerId: existing.practitionerId,
      toPractitionerId: practitionerId,
    });

    if (practitionerId !== existing.practitionerId) {
      await writeAppointmentEvent(tx, {
        appointmentId: existing.id,
        type: 'PRACTITIONER_CHANGED',
        actor: request.actor,
        fromPractitionerId: existing.practitionerId,
        toPractitionerId: practitionerId,
      });
    }

    return {
      ok: true as const,
      appointmentId: moved.id,
      startsAt: moved.startsAt,
      endsAt: moved.endsAt,
      roomId: check.roomId,
    };
  });
}

/// Moves a booked visit to a different room at the same time — the treatment table is
/// occupied, the heat lamp is broken. Refused rather than silently reassigned if the target
/// room is taken, because two patients in one room is the failure this whole module exists to
/// prevent.
export async function changeRoom(
  appointmentId: string,
  roomId: string,
  actor: Actor,
): Promise<BookingResult> {
  const settings = await schedulingSettings();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        roomId: true,
        practitionerId: true,
        status: true,
      },
    });
    if (!existing) return fail('That appointment no longer exists.');
    if (!OCCUPYING_STATUSES.includes(existing.status)) {
      return fail('That appointment is closed and cannot be moved.');
    }
    if (existing.roomId === roomId) {
      return {
        ok: true as const,
        appointmentId: existing.id,
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
        roomId,
      };
    }

    await lockDay(tx, clinicIsoDate(existing.startsAt));

    const context = await slotContext(tx, existing.practitionerId, clinicIsoDate(existing.startsAt), {
      startsAt: existing.startsAt,
      endsAt: existing.endsAt,
    });

    const target = await tx.treatmentRoom.findFirst({
      where: { id: roomId, active: true },
      select: { id: true },
    });
    if (!target) return fail('That room is not in use.');

    const check = slotIsOpen(
      { startsAt: existing.startsAt, endsAt: existing.endsAt },
      {
        /// The time is not changing, so the roster and the closure calendar are not asked
        /// again: this is the same visit, already agreed, moving one table over. The only
        /// question is whether the target room is free, and the practitioner is deliberately
        /// exempted from their own concurrency limit for the same reason.
        windows: [{ startMinute: 0, endMinute: 24 * 60 }],
        practitionerId: existing.practitionerId,
        rooms: [target],
        busy: context.busy,
        closures: [],
        policy: { ...capacityPolicy(settings), maxConcurrentPerPractitioner: Number.MAX_SAFE_INTEGER },
        ignoreAppointmentId: existing.id,
        roomId,
      },
    );
    if (!check.ok) return fail(check.reason);

    await tx.appointment.update({ where: { id: existing.id }, data: { roomId } });
    await writeAppointmentEvent(tx, {
      appointmentId: existing.id,
      type: 'ROOM_CHANGED',
      actor,
      fromRoomId: existing.roomId,
      toRoomId: roomId,
    });

    return {
      ok: true as const,
      appointmentId: existing.id,
      startsAt: existing.startsAt,
      endsAt: existing.endsAt,
      roomId,
    };
  });
}

export type LifecycleAction = 'confirm' | 'check-in' | 'complete' | 'cancel' | 'no-show';

const LIFECYCLE: Record<
  LifecycleAction,
  { status: AppointmentStatus; event: AppointmentEventType; from: AppointmentStatus[] }
> = {
  confirm: { status: 'SCHEDULED', event: 'CONFIRMED', from: ['REQUESTED'] },
  'check-in': { status: 'CHECKED_IN', event: 'CHECKED_IN', from: ['REQUESTED', 'SCHEDULED'] },
  complete: { status: 'COMPLETED', event: 'COMPLETED', from: ['SCHEDULED', 'CHECKED_IN'] },
  cancel: {
    status: 'CANCELLED',
    event: 'CANCELLED',
    from: ['REQUESTED', 'SCHEDULED', 'CHECKED_IN'],
  },
  'no-show': { status: 'NO_SHOW', event: 'NO_SHOW', from: ['REQUESTED', 'SCHEDULED'] },
};

export type LifecycleResult =
  | { ok: true; status: AppointmentStatus; patientId: string; minutes: number | null }
  | BookingFailure;

/// The transitions the front desk performs all day. Legal predecessors are declared rather
/// than assumed, so a visit cannot be marked a no-show after the patient has been treated, and
/// a cancellation cannot quietly un-complete a visit that was billed.
export async function applyLifecycle(
  appointmentId: string,
  action: LifecycleAction,
  actor: Actor,
): Promise<LifecycleResult> {
  const transition = LIFECYCLE[action];
  const at = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        status: true,
        patientId: true,
        roomId: true,
        startsAt: true,
        appointmentTypeId: true,
        appointmentType: { select: { minutes: true } },
      },
    });
    if (!existing) return fail('That appointment no longer exists.');
    if (existing.status === transition.status) {
      return {
        ok: true as const,
        status: existing.status,
        patientId: existing.patientId,
        minutes: existing.appointmentType.minutes,
        roomId: existing.roomId,
        appointmentTypeId: existing.appointmentTypeId,
        changed: false,
      };
    }
    if (!transition.from.includes(existing.status)) {
      return fail('That appointment is no longer in a state where that makes sense.');
    }

    await tx.appointment.update({
      where: { id: existing.id },
      data: {
        status: transition.status,
        ...(transition.status === 'CHECKED_IN' ? { checkedInAt: at } : {}),
        ...(transition.status === 'COMPLETED' ? { completedAt: at } : {}),
        ...(transition.status === 'CANCELLED' ? { cancelledAt: at } : {}),
        ...(transition.status === 'NO_SHOW' ? { noShowAt: at } : {}),
      },
    });

    await writeAppointmentEvent(tx, {
      appointmentId: existing.id,
      type: transition.event,
      actor,
      fromStatus: existing.status,
      toStatus: transition.status,
    });

    return {
      ok: true as const,
      status: transition.status,
      patientId: existing.patientId,
      minutes: existing.appointmentType.minutes,
      roomId: existing.roomId,
      appointmentTypeId: existing.appointmentTypeId,
      changed: true,
    };
  });

  if (result.ok && result.changed) {
    const telemetry = TELEMETRY_EVENTS[result.status];
    if (telemetry) {
      await recordEvent({
        type: telemetry,
        patientId: result.patientId,
        userId: actor.id,
        appointmentId,
        appointmentTypeId: result.appointmentTypeId,
        roomId: result.roomId,
        source: actor.source,
        minutes: result.minutes,
      });
    }
  }

  return result;
}

const TELEMETRY_EVENTS: Partial<
  Record<AppointmentStatus, 'APPOINTMENT_CHECKED_IN' | 'APPOINTMENT_COMPLETED' | 'APPOINTMENT_CANCELLED' | 'APPOINTMENT_NO_SHOW'>
> = {
  CHECKED_IN: 'APPOINTMENT_CHECKED_IN',
  COMPLETED: 'APPOINTMENT_COMPLETED',
  CANCELLED: 'APPOINTMENT_CANCELLED',
  NO_SHOW: 'APPOINTMENT_NO_SHOW',
};

/// The appointment's history, newest last, for the admin history view. Names are resolved for
/// the actor and nothing clinical is read.
export async function appointmentHistory(appointmentId: string) {
  return prisma.appointmentEvent.findMany({
    where: { appointmentId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      type: true,
      createdAt: true,
      actorRole: true,
      source: true,
      fromStatus: true,
      toStatus: true,
      fromStartsAt: true,
      toStartsAt: true,
      fromRoomId: true,
      toRoomId: true,
      fromPractitionerId: true,
      toPractitionerId: true,
      actor: { select: { id: true, name: true } },
    },
  });
}

export function durationMinutes(appointment: { startsAt: Date; endsAt: Date }): number {
  return minutesBetween(appointment.startsAt, appointment.endsAt);
}
