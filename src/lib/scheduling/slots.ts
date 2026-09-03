/// The booking engine, kept as pure functions over plain intervals so it can be unit tested
/// without a database and reused by the staff calendar, the portal and the public form.
///
/// The clinic's rules: five treatment rooms, appointments starting on a 15-minute grid so
/// arrivals are staggered, 60 minutes for a treatment and 75 for a first consultation plus
/// treatment. Concurrency is therefore limited by rooms and by an explicit practitioner
/// capacity policy, not by the hour.
///
/// Everything here takes wall-clock rules — a weekday, minutes from midnight — and instants,
/// and converts between them through `time.ts` alone. That is what makes the daylight-saving
/// weekends unremarkable: a nine-o'clock window is nine o'clock in March and in July.

import {
  addMinutes,
  clinicMinutesIntoDay,
  clinicTimeToUtc,
  minutesBetween,
} from './time';

export { addMinutes };

export const DEFAULT_SLOT_STEP_MINUTES = 15;

export type Interval = { startsAt: Date; endsAt: Date };

/// The stretches of a visit the practitioner has to be in the room for, measured from its
/// start and back from its end. The clinic's answer is 15 and 15 for a treatment and 30 and 15
/// for a first consultation: the middle of a visit is retention, when the practitioner can be
/// starting somebody else. Nulls mean the whole visit, which is the conservative reading.
export type ActivePhases = { leadMinutes: number | null; closeMinutes: number | null };

export const WHOLE_VISIT: ActivePhases = { leadMinutes: null, closeMinutes: null };

/// An interval that may know which of its minutes need the practitioner. Both a candidate slot
/// and an already-booked visit are one of these, and they are compared phase against phase.
export type Occupied = Interval & { phases?: ActivePhases };

export type Busy = Occupied & {
  roomId?: string | null;
  practitionerId?: string | null;
  /// Excluded from conflict checks so an appointment being rescheduled or moved does not
  /// collide with itself.
  appointmentId?: string;
};

export type WorkingWindow = { startMinute: number; endMinute: number };

/// The clinic's capacity rules. Rooms and practitioners are counted separately because they
/// are different constraints: a full clinic and a busy practitioner are different problems.
export type CapacityPolicy = {
  /// How many appointments' *active phases* one practitioner may have running at the same
  /// moment. 1 is the clinic's real rule — nobody is in two rooms at once — and staggering
  /// comes from the phases, not from raising this.
  maxConcurrentPerPractitioner: number;
  slotStepMinutes: number;
};

export const CONSERVATIVE_POLICY: CapacityPolicy = {
  maxConcurrentPerPractitioner: 1,
  slotStepMinutes: DEFAULT_SLOT_STEP_MINUTES,
};

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/// Whether a busy entry is the appointment currently being moved, and so should not be
/// counted against its own new time. Written out because a bare `!==` treats two unidentified
/// entries as the same appointment and silently drops them from every conflict check.
function isSelf(entry: Busy, ignoreAppointmentId?: string): boolean {
  return ignoreAppointmentId !== undefined && entry.appointmentId === ignoreAppointmentId;
}

/// The stretches of a visit during which the practitioner is considered occupied: the opening
/// phase and the closing phase, with the retention between them free. With no phases declared
/// — or phases that between them cover the visit — it is the whole appointment.
export function practitionerWindows(slot: Occupied): Interval[] {
  const whole = { startsAt: slot.startsAt, endsAt: slot.endsAt };
  const total = minutesBetween(slot.startsAt, slot.endsAt);
  const lead = Math.max(0, slot.phases?.leadMinutes ?? 0);
  const close = Math.max(0, slot.phases?.closeMinutes ?? 0);
  if (lead + close === 0 || lead + close >= total) return [whole];

  const windows: Interval[] = [];
  if (lead > 0) windows.push({ startsAt: slot.startsAt, endsAt: addMinutes(slot.startsAt, lead) });
  if (close > 0) windows.push({ startsAt: addMinutes(slot.endsAt, -close), endsAt: slot.endsAt });
  return windows;
}

/// Every start on the clinic's grid that fits a visit of `minutes` inside one of the day's
/// working windows. A 75-minute visit cannot start 30 minutes before closing.
///
/// A start whose wall-clock reading does not exist — 2:30am on the spring-forward Sunday — is
/// dropped rather than shifted, because a shifted start would silently run into the next
/// patient's time.
export function candidateStarts(
  isoDate: string,
  windows: WorkingWindow[],
  minutes: number,
  policy: CapacityPolicy = CONSERVATIVE_POLICY,
): Date[] {
  const step = policy.slotStepMinutes > 0 ? policy.slotStepMinutes : DEFAULT_SLOT_STEP_MINUTES;
  const starts: Date[] = [];
  for (const window of windows) {
    const first = Math.ceil(window.startMinute / step) * step;
    for (let minute = first; minute + minutes <= window.endMinute; minute += step) {
      const startsAt = clinicTimeToUtc(isoDate, minute);
      if (startsAt) starts.push(startsAt);
    }
  }
  return dedupe(starts).sort((a, b) => a.getTime() - b.getTime());
}

function dedupe(starts: Date[]): Date[] {
  const seen = new Set<number>();
  return starts.filter((at) => {
    if (seen.has(at.getTime())) return false;
    seen.add(at.getTime());
    return true;
  });
}

/// The room a booking should take: the first free one in the clinic's own room order, so rooms
/// fill predictably and the day's turnover is easy to read on the calendar. `null` means the
/// clinic is full at that time even though the practitioner is free.
export function freeRoom(
  rooms: { id: string }[],
  slot: Interval,
  busy: Busy[],
  ignoreAppointmentId?: string,
): string | null {
  const taken = new Set(
    busy
      .filter(
        (entry) => entry.roomId && !isSelf(entry, ignoreAppointmentId) && overlaps(entry, slot),
      )
      .map((entry) => entry.roomId as string),
  );
  return rooms.find((room) => !taken.has(room.id))?.id ?? null;
}

export function roomFree(
  roomId: string,
  slot: Interval,
  busy: Busy[],
  ignoreAppointmentId?: string,
): boolean {
  return !busy.some(
    (entry) =>
      entry.roomId === roomId && !isSelf(entry, ignoreAppointmentId) && overlaps(entry, slot),
  );
}

/// Whether the practitioner has capacity left at that time under the configured policy.
export function practitionerFree(
  practitionerId: string,
  slot: Occupied,
  busy: Busy[],
  policy: CapacityPolicy = CONSERVATIVE_POLICY,
  ignoreAppointmentId?: string,
): boolean {
  const wanted = practitionerWindows(slot);
  const concurrent = busy.filter(
    (entry) =>
      entry.practitionerId === practitionerId &&
      !isSelf(entry, ignoreAppointmentId) &&
      practitionerWindows(entry).some((busyWindow) =>
        wanted.some((wantedWindow) => overlaps(busyWindow, wantedWindow)),
      ),
  ).length;
  return concurrent < Math.max(1, policy.maxConcurrentPerPractitioner);
}

export type SlotOptions = {
  isoDate: string;
  minutes: number;
  /// The visit type's practitioner-active phases, which is what allows quarter-hour starts.
  phases?: ActivePhases;
  windows: WorkingWindow[];
  practitionerId: string;
  rooms: { id: string }[];
  busy: Busy[];
  closures?: Interval[];
  /// Slots this close to now are not offered, so nobody books a time that has passed while
  /// the page sat open.
  now?: Date;
  minNoticeMinutes?: number;
  policy?: CapacityPolicy;
  ignoreAppointmentId?: string;
};

export type Slot = { startsAt: Date; endsAt: Date; roomId: string };

/// The bookable times for one practitioner on one day. A slot is offered only when the
/// practitioner is working, is not away, has capacity left, and a room is free for the whole
/// visit. Patients are told when, never where: the room is decided here and shown to staff.
export function bookableSlots(options: SlotOptions): Slot[] {
  const {
    isoDate,
    minutes,
    phases = WHOLE_VISIT,
    windows,
    practitionerId,
    rooms,
    busy,
    closures = [],
    now,
    minNoticeMinutes = 0,
    policy = CONSERVATIVE_POLICY,
    ignoreAppointmentId,
  } = options;

  const earliest = now ? addMinutes(now, minNoticeMinutes) : null;

  return candidateStarts(isoDate, windows, minutes, policy).flatMap((startsAt) => {
    const slot = { startsAt, endsAt: addMinutes(startsAt, minutes), phases };
    if (earliest && slot.startsAt < earliest) return [];
    if (closures.some((closure) => overlaps(closure, slot))) return [];
    if (!practitionerFree(practitionerId, slot, busy, policy, ignoreAppointmentId)) return [];
    const roomId = freeRoom(rooms, slot, busy, ignoreAppointmentId);
    return roomId ? [{ ...slot, roomId }] : [];
  });
}

export type SlotRejection =
  | 'INCREMENT'
  | 'OUTSIDE_HOURS'
  | 'PAST'
  | 'CLOSED'
  | 'PRACTITIONER_FULL'
  | 'ROOMS_FULL'
  | 'ROOM_TAKEN'
  | 'NONEXISTENT_TIME';

/// The reasons a slot cannot be taken, worded for whoever is looking at the screen.
///
/// Staff see the operational reason; patients are shown a single flat "not available" by the
/// booking action, because "that practitioner is already booked" tells a stranger that someone
/// else is in the building at three o'clock.
export const REJECTION_MESSAGE: Record<SlotRejection, string> = {
  INCREMENT: 'Appointments start on the quarter hour.',
  OUTSIDE_HOURS: 'That time is outside the practitioner’s hours.',
  PAST: 'That time has passed. Pick another.',
  CLOSED: 'The clinic is closed then.',
  PRACTITIONER_FULL: 'That practitioner is already booked then.',
  ROOMS_FULL: 'Every treatment room is full then.',
  ROOM_TAKEN: 'That room is already in use then.',
  NONEXISTENT_TIME: 'The clocks change that morning and that time does not exist.',
};

export type SlotCheck =
  | { ok: true; roomId: string }
  | { ok: false; rejection: SlotRejection; reason: string };

function refuse(rejection: SlotRejection): SlotCheck {
  return { ok: false, rejection, reason: REJECTION_MESSAGE[rejection] };
}

/// Whether a specific requested time is still bookable. The booking actions re-check this
/// inside the write transaction, because the slot list a browser is looking at is a snapshot
/// and two people can want the same 3pm.
export function slotIsOpen(
  requested: Occupied,
  options: Omit<SlotOptions, 'isoDate' | 'minutes' | 'phases'> & { roomId?: string | null },
): SlotCheck {
  const {
    windows,
    practitionerId,
    rooms,
    busy,
    closures = [],
    now,
    minNoticeMinutes = 0,
    policy = CONSERVATIVE_POLICY,
    ignoreAppointmentId,
    roomId: wantedRoomId,
  } = options;

  const step = policy.slotStepMinutes > 0 ? policy.slotStepMinutes : DEFAULT_SLOT_STEP_MINUTES;
  const startMinute = clinicMinutesIntoDay(requested.startsAt);
  const endMinute = startMinute + minutesBetween(requested.startsAt, requested.endsAt);

  if (startMinute % step !== 0) return refuse('INCREMENT');
  if (!windows.some((window) => startMinute >= window.startMinute && endMinute <= window.endMinute)) {
    return refuse('OUTSIDE_HOURS');
  }
  if (now && requested.startsAt < addMinutes(now, minNoticeMinutes)) return refuse('PAST');
  if (closures.some((closure) => overlaps(closure, requested))) return refuse('CLOSED');
  if (!practitionerFree(practitionerId, requested, busy, policy, ignoreAppointmentId)) {
    return refuse('PRACTITIONER_FULL');
  }

  if (wantedRoomId) {
    if (!rooms.some((room) => room.id === wantedRoomId)) return refuse('ROOM_TAKEN');
    if (!roomFree(wantedRoomId, requested, busy, ignoreAppointmentId)) return refuse('ROOM_TAKEN');
    return { ok: true, roomId: wantedRoomId };
  }

  const roomId = freeRoom(rooms, requested, busy, ignoreAppointmentId);
  if (!roomId) return refuse('ROOMS_FULL');
  return { ok: true, roomId };
}

/// Weekly occupancy: booked room-minutes against the room-minutes the clinic had available.
export function occupancy(
  bookedMinutes: number,
  openMinutesPerRoom: number,
  roomCount: number,
): number {
  const capacity = openMinutesPerRoom * roomCount;
  if (capacity <= 0) return 0;
  return Math.round((bookedMinutes / capacity) * 100);
}
