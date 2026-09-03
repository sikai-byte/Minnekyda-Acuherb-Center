/// The booking engine, kept as pure functions over plain intervals so it can be unit tested
/// without a database and reused by the staff calendar, the portal and the public form.
///
/// The clinic's rules: five treatment rooms, appointments starting on a 15-minute grid so
/// arrivals are staggered, 60 minutes for a treatment and 75 for a first consultation plus
/// treatment. Concurrency is therefore limited by rooms, not by the hour.

export const SLOT_STEP_MINUTES = 15;

/// How far ahead the public and portal booking screens will offer times.
export const BOOKING_HORIZON_DAYS = 60;

/// A patient cancelling their own appointment inside this window has to phone instead, so a
/// late cancellation is always a conversation with the front desk.
export const SELF_CANCEL_NOTICE_HOURS = 24;

export type Interval = { startsAt: Date; endsAt: Date };

export type Busy = Interval & { roomId?: string | null; practitionerId?: string | null };

export type WorkingWindow = { startMinute: number; endMinute: number };

export function addMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * 60_000);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/// Start of the local day for a `YYYY-MM-DD` string, in UTC. The clinic is single-site, so
/// local time is the only time; storing minutes-from-midnight keeps the grid stable.
export function dayStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function toIsoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function minutesIntoDay(at: Date): number {
  return at.getUTCHours() * 60 + at.getUTCMinutes();
}

/// Every 15-minute start that fits a service of `minutes` inside one of the day's working
/// windows. A 75-minute visit cannot start 30 minutes before closing.
export function candidateStarts(
  isoDate: string,
  windows: WorkingWindow[],
  minutes: number,
): Date[] {
  const base = dayStart(isoDate);
  const starts: Date[] = [];
  for (const window of windows) {
    const first = Math.ceil(window.startMinute / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
    for (let minute = first; minute + minutes <= window.endMinute; minute += SLOT_STEP_MINUTES) {
      starts.push(addMinutes(base, minute));
    }
  }
  return starts.sort((a, b) => a.getTime() - b.getTime());
}

/// The room a booking should take: the lowest-numbered free one, so rooms fill predictably
/// and the day's turnover is easy to read on the calendar. `null` means the clinic is full
/// at that time even though the practitioner is free.
export function freeRoom(
  rooms: { id: string; name: string }[],
  slot: Interval,
  busy: Busy[],
): string | null {
  const taken = new Set(
    busy.filter((entry) => entry.roomId && overlaps(entry, slot)).map((entry) => entry.roomId!),
  );
  return rooms.find((room) => !taken.has(room.id))?.id ?? null;
}

export function practitionerFree(
  practitionerId: string,
  slot: Interval,
  busy: Busy[],
): boolean {
  return !busy.some(
    (entry) => entry.practitionerId === practitionerId && overlaps(entry, slot),
  );
}

export type SlotOptions = {
  isoDate: string;
  minutes: number;
  windows: WorkingWindow[];
  practitionerId: string;
  rooms: { id: string; name: string }[];
  busy: Busy[];
  closures?: Interval[];
  /// Slots this close to now are not offered, so nobody books a time that has passed while
  /// the page sat open.
  now?: Date;
  minNoticeMinutes?: number;
};

export type Slot = { startsAt: Date; endsAt: Date; roomId: string };

/// The bookable times for one practitioner on one day. A slot is offered only when the
/// practitioner is working, is not away, has no other appointment, and a room is free for
/// the whole visit.
export function bookableSlots(options: SlotOptions): Slot[] {
  const {
    isoDate,
    minutes,
    windows,
    practitionerId,
    rooms,
    busy,
    closures = [],
    now,
    minNoticeMinutes = 0,
  } = options;

  const earliest = now ? addMinutes(now, minNoticeMinutes) : null;

  return candidateStarts(isoDate, windows, minutes).flatMap((startsAt) => {
    const slot = { startsAt, endsAt: addMinutes(startsAt, minutes) };
    if (earliest && slot.startsAt < earliest) return [];
    if (closures.some((closure) => overlaps(closure, slot))) return [];
    if (!practitionerFree(practitionerId, slot, busy)) return [];
    const roomId = freeRoom(rooms, slot, busy);
    return roomId ? [{ ...slot, roomId }] : [];
  });
}

/// Whether a specific requested time is still bookable. The booking actions re-check this
/// inside the write transaction, because the slot list a browser is looking at is a
/// snapshot and two people can want the same 3pm.
export function slotIsOpen(
  requested: Interval,
  options: Omit<SlotOptions, 'isoDate' | 'minutes'>,
): { ok: true; roomId: string } | { ok: false; reason: string } {
  const { windows, practitionerId, rooms, busy, closures = [], now, minNoticeMinutes = 0 } = options;

  const startMinute = minutesIntoDay(requested.startsAt);
  const endMinute = startMinute + Math.round(
    (requested.endsAt.getTime() - requested.startsAt.getTime()) / 60_000,
  );

  if (startMinute % SLOT_STEP_MINUTES !== 0) {
    return { ok: false, reason: 'Appointments start on the quarter hour.' };
  }
  if (!windows.some((window) => startMinute >= window.startMinute && endMinute <= window.endMinute)) {
    return { ok: false, reason: 'That time is outside the practitioner’s hours.' };
  }
  if (now && requested.startsAt < addMinutes(now, minNoticeMinutes)) {
    return { ok: false, reason: 'That time has passed. Pick another.' };
  }
  if (closures.some((closure) => overlaps(closure, requested))) {
    return { ok: false, reason: 'The clinic is closed then.' };
  }
  if (!practitionerFree(practitionerId, requested, busy)) {
    return { ok: false, reason: 'That practitioner is already booked then.' };
  }
  const roomId = freeRoom(rooms, requested, busy);
  if (!roomId) return { ok: false, reason: 'Every treatment room is full then.' };
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
