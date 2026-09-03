import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  bookableSlots,
  candidateStarts,
  dayStart,
  freeRoom,
  occupancy,
  slotIsOpen,
  type Busy,
} from './slots';

const DAY = '2026-03-16';
const MORNING = [{ startMinute: 9 * 60, endMinute: 12 * 60 }];
const FULL_DAY = [{ startMinute: 9 * 60, endMinute: 17 * 60 }];
const ROOMS = [
  { id: 'r1', name: 'Room 1' },
  { id: 'r2', name: 'Room 2' },
  { id: 'r3', name: 'Room 3' },
  { id: 'r4', name: 'Room 4' },
  { id: 'r5', name: 'Room 5' },
];

function at(time: string): Date {
  return new Date(`${DAY}T${time}:00.000Z`);
}

function appointment(start: string, minutes: number, extra: Partial<Busy> = {}): Busy {
  return { startsAt: at(start), endsAt: addMinutes(at(start), minutes), ...extra };
}

describe('candidateStarts', () => {
  it('offers quarter-hour starts', () => {
    const starts = candidateStarts(DAY, MORNING, 60);
    expect(starts[0].toISOString()).toBe('2026-03-16T09:00:00.000Z');
    expect(starts[1].toISOString()).toBe('2026-03-16T09:15:00.000Z');
  });

  it('will not start a visit that runs past closing', () => {
    const sixty = candidateStarts(DAY, MORNING, 60);
    const seventyFive = candidateStarts(DAY, MORNING, 75);
    expect(sixty.at(-1)?.toISOString()).toBe('2026-03-16T11:00:00.000Z');
    expect(seventyFive.at(-1)?.toISOString()).toBe('2026-03-16T10:45:00.000Z');
  });

  it('handles a split day without producing a lunchtime start', () => {
    const starts = candidateStarts(
      DAY,
      [
        { startMinute: 9 * 60, endMinute: 12 * 60 },
        { startMinute: 14 * 60, endMinute: 17 * 60 },
      ],
      60,
    );
    const times = starts.map((start) => start.toISOString().slice(11, 16));
    expect(times).toContain('11:00');
    expect(times).not.toContain('12:00');
    expect(times).not.toContain('13:00');
    expect(times).toContain('14:00');
  });
});

describe('freeRoom', () => {
  const slot = { startsAt: at('10:00'), endsAt: at('11:00') };

  it('fills rooms in order', () => {
    expect(freeRoom(ROOMS, slot, [])).toBe('r1');
    expect(freeRoom(ROOMS, slot, [appointment('10:00', 60, { roomId: 'r1' })])).toBe('r2');
  });

  it('reuses a room whose appointment has ended', () => {
    expect(freeRoom(ROOMS, slot, [appointment('09:00', 60, { roomId: 'r1' })])).toBe('r1');
  });

  it('reports the clinic full when all five rooms overlap', () => {
    const busy = ROOMS.map((room) => appointment('09:45', 60, { roomId: room.id }));
    expect(freeRoom(ROOMS, slot, busy)).toBeNull();
  });
});

describe('bookableSlots', () => {
  const base = {
    isoDate: DAY,
    minutes: 60,
    windows: FULL_DAY,
    practitionerId: 'p1',
    rooms: ROOMS,
    busy: [] as Busy[],
  };

  it('staggers five concurrent treatments 15 minutes apart', () => {
    /// Four rooms are occupied from 10:00; the fifth is still offered at 10:00, and the
    /// quarter-hour grid is what staggers the arrivals.
    const busy = ['r1', 'r2', 'r3', 'r4'].map((roomId) =>
      appointment('10:00', 60, { roomId, practitionerId: 'p2' }),
    );
    const slots = bookableSlots({ ...base, busy });
    const ten = slots.find((slot) => slot.startsAt.toISOString().endsWith('10:00:00.000Z'));
    expect(ten?.roomId).toBe('r5');
  });

  it('drops a time when every room is taken', () => {
    const busy = ROOMS.map((roomId) => appointment('10:00', 60, { roomId: roomId.id, practitionerId: 'p2' }));
    const times = bookableSlots({ ...base, busy }).map((slot) => slot.startsAt.toISOString().slice(11, 16));
    expect(times).not.toContain('10:00');
    expect(times).not.toContain('09:30');
    expect(times).toContain('11:00');
  });

  it('drops a time when the practitioner is busy even though rooms are free', () => {
    const busy = [appointment('10:00', 60, { roomId: 'r1', practitionerId: 'p1' })];
    const times = bookableSlots({ ...base, busy }).map((slot) => slot.startsAt.toISOString().slice(11, 16));
    expect(times).not.toContain('10:00');
    expect(times).not.toContain('10:45');
    expect(times).toContain('11:00');
  });

  it('respects a closure', () => {
    const closures = [{ startsAt: at('09:00'), endsAt: at('12:00') }];
    const times = bookableSlots({ ...base, closures }).map((slot) =>
      slot.startsAt.toISOString().slice(11, 16),
    );
    expect(times).not.toContain('09:00');
    expect(times).not.toContain('11:30');
    expect(times).toContain('12:00');
  });

  it('offers nothing in the past and honours the notice period', () => {
    const slots = bookableSlots({
      ...base,
      now: at('10:00'),
      minNoticeMinutes: 120,
    });
    expect(slots[0].startsAt.toISOString()).toBe('2026-03-16T12:00:00.000Z');
  });

  it('offers 75-minute first visits on the same grid', () => {
    const slots = bookableSlots({ ...base, minutes: 75 });
    expect(slots[0].endsAt.toISOString()).toBe('2026-03-16T10:15:00.000Z');
    expect(slots.at(-1)?.startsAt.toISOString()).toBe('2026-03-16T15:45:00.000Z');
  });
});

describe('slotIsOpen', () => {
  const base = {
    windows: FULL_DAY,
    practitionerId: 'p1',
    rooms: ROOMS,
    busy: [] as Busy[],
  };

  it('accepts a free quarter-hour start and assigns a room', () => {
    const result = slotIsOpen({ startsAt: at('10:00'), endsAt: at('11:00') }, base);
    expect(result).toEqual({ ok: true, roomId: 'r1' });
  });

  it('refuses a start off the grid', () => {
    const result = slotIsOpen({ startsAt: at('10:05'), endsAt: at('11:05') }, base);
    expect(result).toEqual({ ok: false, reason: 'Appointments start on the quarter hour.' });
  });

  it('refuses a visit that runs past closing', () => {
    const result = slotIsOpen({ startsAt: at('16:30'), endsAt: at('17:45') }, base);
    expect(result.ok).toBe(false);
  });

  it('refuses a double-booked practitioner', () => {
    const busy = [appointment('10:30', 60, { roomId: 'r1', practitionerId: 'p1' })];
    const result = slotIsOpen({ startsAt: at('10:00'), endsAt: at('11:00') }, { ...base, busy });
    expect(result).toEqual({ ok: false, reason: 'That practitioner is already booked then.' });
  });

  it('refuses when every room is full', () => {
    const busy = ROOMS.map((room) => appointment('10:00', 60, { roomId: room.id, practitionerId: 'p2' }));
    const result = slotIsOpen({ startsAt: at('10:00'), endsAt: at('11:00') }, { ...base, busy });
    expect(result).toEqual({ ok: false, reason: 'Every treatment room is full then.' });
  });

  it('is what makes the second of two simultaneous bookings fail', () => {
    /// Both browsers saw 10:00 free. The first writes; the second re-checks against the row
    /// the first inserted and is turned away rather than overbooking the room.
    const first = slotIsOpen({ startsAt: at('10:00'), endsAt: at('11:00') }, base);
    expect(first).toEqual({ ok: true, roomId: 'r1' });
    const busy = ROOMS.map((room) =>
      appointment('10:00', 60, { roomId: room.id, practitionerId: 'p9' }),
    );
    const second = slotIsOpen({ startsAt: at('10:00'), endsAt: at('11:00') }, { ...base, busy });
    expect(second.ok).toBe(false);
  });
});

describe('occupancy', () => {
  it('measures booked room-minutes against room capacity', () => {
    /// Five rooms, eight open hours: 2,400 room-minutes a day.
    expect(occupancy(1_200, 480, 5)).toBe(50);
    expect(occupancy(2_400, 480, 5)).toBe(100);
    expect(occupancy(0, 480, 5)).toBe(0);
  });

  it('does not divide by a closed clinic', () => {
    expect(occupancy(60, 0, 5)).toBe(0);
  });

  it('ignores the day of week in the arithmetic', () => {
    expect(occupancy(dayStart(DAY).getUTCDay(), 480, 5)).toBe(0);
  });
});
