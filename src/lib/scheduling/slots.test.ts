import { describe, expect, it } from 'vitest';
import {
  CONSERVATIVE_POLICY,
  addMinutes,
  bookableSlots,
  candidateStarts,
  freeRoom,
  occupancy,
  practitionerFree,
  practitionerWindow,
  roomFree,
  slotIsOpen,
  type Busy,
  type CapacityPolicy,
} from './slots';
import { clinicParts, clinicTimeToUtc } from './time';

/// A Monday in central daylight time, so 9am clinic time is 14:00Z. Expected start times are
/// asserted exactly: a test that only checks "some slots exist" would not have caught the
/// UTC-vs-clinic bugs this engine was rewritten to fix.
const DAY = '2026-03-16';
const WINTER = '2026-01-19';
const SPRING_FORWARD = '2026-03-08';
const FALL_BACK = '2026-11-01';

const MORNING = [{ startMinute: 9 * 60, endMinute: 12 * 60 }];
const FULL_DAY = [{ startMinute: 9 * 60, endMinute: 17 * 60 }];
const SPLIT_DAY = [
  { startMinute: 9 * 60, endMinute: 12 * 60 },
  { startMinute: 13 * 60, endMinute: 17 * 60 },
];
const ROOMS = [
  { id: 'r1' },
  { id: 'r2' },
  { id: 'r3' },
  { id: 'r4' },
  { id: 'r5' },
];

/// Minutes from midnight for a clinic-local `HH:MM`.
function minute(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function at(time: string, isoDate = DAY): Date {
  const instant = clinicTimeToUtc(isoDate, minute(time));
  if (!instant) throw new Error(`${isoDate} ${time} does not exist in clinic time`);
  return instant;
}

function appointment(start: string, minutes: number, extra: Partial<Busy> = {}): Busy {
  return { startsAt: at(start), endsAt: addMinutes(at(start), minutes), ...extra };
}

function times(slots: { startsAt: Date }[]): string[] {
  return slots.map((slot) => slot.startsAt.toISOString());
}

describe('candidateStarts', () => {
  it('offers quarter-hour starts in clinic time', () => {
    const starts = candidateStarts(DAY, MORNING, 60);
    expect(starts[0].toISOString()).toBe('2026-03-16T14:00:00.000Z');
    expect(starts[1].toISOString()).toBe('2026-03-16T14:15:00.000Z');
  });

  it('keeps nine o\u2019clock at nine o\u2019clock through the winter offset', () => {
    const starts = candidateStarts(WINTER, MORNING, 60);
    expect(starts[0].toISOString()).toBe('2026-01-19T15:00:00.000Z');
  });

  it('will not start a 60-minute visit that runs past closing', () => {
    const starts = candidateStarts(DAY, MORNING, 60);
    expect(times(starts.map((startsAt) => ({ startsAt }))).at(-1)).toBe(
      '2026-03-16T16:00:00.000Z',
    );
  });

  it('stops a 75-minute visit a quarter hour earlier than a 60', () => {
    const sixty = candidateStarts(DAY, MORNING, 60);
    const seventyFive = candidateStarts(DAY, MORNING, 75);
    expect(sixty.length - seventyFive.length).toBe(1);
    expect(seventyFive.at(-1)?.toISOString()).toBe('2026-03-16T15:45:00.000Z');
  });

  it('offers nothing when the window is shorter than the visit', () => {
    expect(candidateStarts(DAY, [{ startMinute: 9 * 60, endMinute: 9 * 60 + 45 }], 60)).toEqual([]);
  });

  it('covers both halves of a split day and nothing over lunch', () => {
    const starts = times(
      candidateStarts(DAY, SPLIT_DAY, 60).map((startsAt) => ({ startsAt })),
    );
    expect(starts).toContain('2026-03-16T16:00:00.000Z'); // 11:00
    expect(starts).not.toContain('2026-03-16T16:15:00.000Z'); // 11:15 would run past noon
    expect(starts).toContain('2026-03-16T18:00:00.000Z'); // 13:00
  });

  it('rounds a window that does not begin on the grid up to the next start', () => {
    const starts = candidateStarts(DAY, [{ startMinute: minute('09:05'), endMinute: 12 * 60 }], 60);
    expect(starts[0].toISOString()).toBe('2026-03-16T14:15:00.000Z');
  });

  it('honours a policy with a coarser step', () => {
    const policy: CapacityPolicy = { ...CONSERVATIVE_POLICY, slotStepMinutes: 30 };
    const starts = candidateStarts(DAY, MORNING, 60, policy);
    expect(times(starts.map((startsAt) => ({ startsAt })))).toEqual([
      '2026-03-16T14:00:00.000Z',
      '2026-03-16T14:30:00.000Z',
      '2026-03-16T15:00:00.000Z',
      '2026-03-16T15:30:00.000Z',
      '2026-03-16T16:00:00.000Z',
    ]);
  });

  it('drops the hour that does not exist on the spring-forward morning', () => {
    const starts = candidateStarts(
      SPRING_FORWARD,
      [{ startMinute: minute('01:00'), endMinute: minute('05:00') }],
      60,
    );
    const instants = starts.map((start) => start.toISOString());
    expect(instants).toContain('2026-03-08T07:00:00.000Z'); // 01:00 CST
    expect(instants).toContain('2026-03-08T08:00:00.000Z'); // 03:00 CDT
    // 02:00–02:59 local never happens, so nothing may be offered as a two o'clock start.
    expect(starts.map((start) => clinicParts(start).hour)).not.toContain(2);
  });

  it('offers each duplicated fall-back time once', () => {
    const starts = candidateStarts(
      FALL_BACK,
      [{ startMinute: minute('01:00'), endMinute: minute('03:00') }],
      60,
    );
    expect(new Set(starts.map((start) => start.getTime())).size).toBe(starts.length);
  });
});

describe('practitionerWindow', () => {
  it('treats the whole visit as practitioner time under the conservative policy', () => {
    const slot = { startsAt: at('09:00'), endsAt: at('10:00') };
    expect(practitionerWindow(slot, CONSERVATIVE_POLICY).endsAt.toISOString()).toBe(
      slot.endsAt.toISOString(),
    );
  });

  it('shortens to the active minutes when the clinic has defined them', () => {
    const slot = { startsAt: at('09:00'), endsAt: at('10:00') };
    const policy: CapacityPolicy = { ...CONSERVATIVE_POLICY, practitionerActiveMinutes: 20 };
    expect(practitionerWindow(slot, policy).endsAt.toISOString()).toBe(at('09:20').toISOString());
  });

  it('never claims more time than the visit itself', () => {
    const slot = { startsAt: at('09:00'), endsAt: at('09:30') };
    const policy: CapacityPolicy = { ...CONSERVATIVE_POLICY, practitionerActiveMinutes: 90 };
    expect(practitionerWindow(slot, policy).endsAt.toISOString()).toBe(slot.endsAt.toISOString());
  });
});

describe('room capacity', () => {
  const slot = { startsAt: at('09:00'), endsAt: at('10:00') };

  it('takes the first room in the clinic\u2019s own order', () => {
    expect(freeRoom(ROOMS, slot, [])).toBe('r1');
  });

  it('steps past a room that is occupied for part of the visit', () => {
    const busy = [appointment('09:45', 60, { roomId: 'r1' })];
    expect(freeRoom(ROOMS, slot, busy)).toBe('r2');
  });

  it('ignores a booking that merely abuts the slot', () => {
    const busy = [appointment('08:00', 60, { roomId: 'r1' })];
    expect(freeRoom(ROOMS, slot, busy)).toBe('r1');
  });

  it('reports a full clinic rather than double-booking a room', () => {
    const busy = ROOMS.map((room) => appointment('09:30', 60, { roomId: room.id }));
    expect(freeRoom(ROOMS, slot, busy)).toBeNull();
  });

  it('does not count the appointment being moved against itself', () => {
    const busy = ROOMS.map((room, index) =>
      appointment('09:30', 60, { roomId: room.id, appointmentId: `a${index}` }),
    );
    expect(freeRoom(ROOMS, slot, busy, 'a0')).toBe('r1');
  });

  it('checks a named room directly', () => {
    const busy = [appointment('09:30', 60, { roomId: 'r3' })];
    expect(roomFree('r3', slot, busy)).toBe(false);
    expect(roomFree('r4', slot, busy)).toBe(true);
  });
});

describe('practitioner capacity', () => {
  const slot = { startsAt: at('09:00'), endsAt: at('10:00') };

  it('refuses an overlap under the conservative one-at-a-time policy', () => {
    const busy = [appointment('09:30', 60, { practitionerId: 'p1' })];
    expect(practitionerFree('p1', slot, busy)).toBe(false);
  });

  it('leaves other practitioners alone', () => {
    const busy = [appointment('09:30', 60, { practitionerId: 'p2' })];
    expect(practitionerFree('p1', slot, busy)).toBe(true);
  });

  it('allows the configured amount of overlap', () => {
    const policy: CapacityPolicy = { ...CONSERVATIVE_POLICY, maxConcurrentPerPractitioner: 2 };
    const busy = [appointment('09:30', 60, { practitionerId: 'p1' })];
    expect(practitionerFree('p1', slot, busy, policy)).toBe(true);
    expect(
      practitionerFree(
        'p1',
        slot,
        [...busy, appointment('09:45', 60, { practitionerId: 'p1' })],
        policy,
      ),
    ).toBe(false);
  });

  it('permits staggering once the practitioner-active window is defined', () => {
    const policy: CapacityPolicy = { ...CONSERVATIVE_POLICY, practitionerActiveMinutes: 15 };
    const busy = [appointment('09:00', 60, { practitionerId: 'p1' })];
    expect(practitionerFree('p1', { startsAt: at('09:15'), endsAt: at('10:15') }, busy, policy)).toBe(
      true,
    );
    expect(practitionerFree('p1', { startsAt: at('09:05'), endsAt: at('10:05') }, busy, policy)).toBe(
      false,
    );
  });

  it('does not count the appointment being rescheduled against itself', () => {
    const busy = [appointment('09:00', 60, { practitionerId: 'p1', appointmentId: 'a1' })];
    expect(practitionerFree('p1', slot, busy, CONSERVATIVE_POLICY, 'a1')).toBe(true);
  });
});

describe('bookableSlots', () => {
  const base = {
    isoDate: DAY,
    minutes: 60,
    windows: MORNING,
    practitionerId: 'p1',
    rooms: ROOMS,
    busy: [] as Busy[],
  };

  it('offers every quarter hour that fits', () => {
    expect(times(bookableSlots(base))).toEqual([
      '2026-03-16T14:00:00.000Z',
      '2026-03-16T14:15:00.000Z',
      '2026-03-16T14:30:00.000Z',
      '2026-03-16T14:45:00.000Z',
      '2026-03-16T15:00:00.000Z',
      '2026-03-16T15:15:00.000Z',
      '2026-03-16T15:30:00.000Z',
      '2026-03-16T15:45:00.000Z',
      '2026-03-16T16:00:00.000Z',
    ]);
  });

  it('assigns a room to every offered slot and never asks the patient', () => {
    expect(bookableSlots(base).every((slot) => slot.roomId === 'r1')).toBe(true);
  });

  it('removes the practitioner\u2019s own booked time', () => {
    const busy = [appointment('10:00', 60, { practitionerId: 'p1', roomId: 'r1' })];
    const offered = times(bookableSlots({ ...base, busy }));
    expect(offered).toContain('2026-03-16T14:00:00.000Z'); // 09:00
    expect(offered).not.toContain('2026-03-16T15:00:00.000Z'); // 10:00
    expect(offered).not.toContain('2026-03-16T14:45:00.000Z'); // would run into 10:00
  });

  it('offers nothing when every room is taken even though the practitioner is free', () => {
    const busy = ROOMS.map((room, index) =>
      appointment('09:00', 180, { roomId: room.id, practitionerId: `other${index}` }),
    );
    expect(bookableSlots({ ...base, busy })).toEqual([]);
  });

  it('drops slots inside a clinic closure', () => {
    const closures = [{ startsAt: at('09:00'), endsAt: at('10:30') }];
    const offered = times(bookableSlots({ ...base, closures }));
    expect(offered[0]).toBe('2026-03-16T15:30:00.000Z'); // 10:30
  });

  it('drops the whole day for a full-day closure', () => {
    const closures = [{ startsAt: at('00:00'), endsAt: at('23:45') }];
    expect(bookableSlots({ ...base, closures })).toEqual([]);
  });

  it('respects the minimum notice from now', () => {
    const offered = times(
      bookableSlots({ ...base, now: at('09:00'), minNoticeMinutes: 120 }),
    );
    expect(offered[0]).toBe('2026-03-16T16:00:00.000Z'); // 11:00
  });

  it('offers nothing in the past', () => {
    expect(bookableSlots({ ...base, now: at('12:00') })).toEqual([]);
  });

  it('offers the vacated time back when the appointment being moved is ignored', () => {
    const busy = [
      appointment('09:00', 60, { practitionerId: 'p1', roomId: 'r1', appointmentId: 'a1' }),
    ];
    expect(times(bookableSlots({ ...base, busy }))).not.toContain('2026-03-16T14:00:00.000Z');
    expect(times(bookableSlots({ ...base, busy, ignoreAppointmentId: 'a1' }))).toContain(
      '2026-03-16T14:00:00.000Z',
    );
  });

  it('offers the full working day when the practitioner works it', () => {
    expect(bookableSlots({ ...base, windows: FULL_DAY }).length).toBe(29);
  });
});

describe('slotIsOpen', () => {
  const base = {
    windows: MORNING,
    practitionerId: 'p1',
    rooms: ROOMS,
    busy: [] as Busy[],
  };
  const nine = { startsAt: at('09:00'), endsAt: at('10:00') };

  it('accepts a valid request and names the room', () => {
    expect(slotIsOpen(nine, base)).toEqual({ ok: true, roomId: 'r1' });
  });

  it('refuses an off-grid start', () => {
    const requested = { startsAt: at('09:05'), endsAt: at('10:05') };
    expect(slotIsOpen(requested, base)).toMatchObject({ ok: false, rejection: 'INCREMENT' });
  });

  it('refuses a visit that starts before the practitioner does', () => {
    const requested = { startsAt: at('08:00'), endsAt: at('09:00') };
    expect(slotIsOpen(requested, base)).toMatchObject({ ok: false, rejection: 'OUTSIDE_HOURS' });
  });

  it('refuses a visit that would run past the end of the window', () => {
    const requested = { startsAt: at('11:30'), endsAt: at('12:30') };
    expect(slotIsOpen(requested, base)).toMatchObject({ ok: false, rejection: 'OUTSIDE_HOURS' });
  });

  it('accepts a visit that ends exactly at closing', () => {
    const requested = { startsAt: at('11:00'), endsAt: at('12:00') };
    expect(slotIsOpen(requested, base)).toMatchObject({ ok: true });
  });

  it('refuses a time that has passed', () => {
    expect(slotIsOpen(nine, { ...base, now: at('11:00') })).toMatchObject({
      ok: false,
      rejection: 'PAST',
    });
  });

  it('refuses a time inside the notice period', () => {
    expect(
      slotIsOpen(nine, { ...base, now: at('08:30'), minNoticeMinutes: 120 }),
    ).toMatchObject({ ok: false, rejection: 'PAST' });
  });

  it('refuses a closure', () => {
    const closures = [{ startsAt: at('09:30'), endsAt: at('11:00') }];
    expect(slotIsOpen(nine, { ...base, closures })).toMatchObject({
      ok: false,
      rejection: 'CLOSED',
    });
  });

  it('refuses when the practitioner is already busy', () => {
    const busy = [appointment('09:30', 60, { practitionerId: 'p1', roomId: 'r2' })];
    expect(slotIsOpen(nine, { ...base, busy })).toMatchObject({
      ok: false,
      rejection: 'PRACTITIONER_FULL',
    });
  });

  it('refuses when the clinic has no room left', () => {
    const busy = ROOMS.map((room, index) =>
      appointment('09:30', 60, { roomId: room.id, practitionerId: `other${index}` }),
    );
    expect(slotIsOpen(nine, { ...base, busy })).toMatchObject({
      ok: false,
      rejection: 'ROOMS_FULL',
    });
  });

  it('refuses a named room that is in use', () => {
    const busy = [appointment('09:30', 60, { roomId: 'r3', practitionerId: 'p9' })];
    expect(slotIsOpen(nine, { ...base, busy, roomId: 'r3' })).toMatchObject({
      ok: false,
      rejection: 'ROOM_TAKEN',
    });
  });

  it('refuses a room the clinic does not have', () => {
    expect(slotIsOpen(nine, { ...base, roomId: 'nope' })).toMatchObject({
      ok: false,
      rejection: 'ROOM_TAKEN',
    });
  });

  it('honours a named room that is free', () => {
    expect(slotIsOpen(nine, { ...base, roomId: 'r4' })).toEqual({ ok: true, roomId: 'r4' });
  });

  it('lets an appointment keep its own time when it is being re-checked', () => {
    const busy = [
      appointment('09:00', 60, { practitionerId: 'p1', roomId: 'r1', appointmentId: 'a1' }),
    ];
    expect(slotIsOpen(nine, { ...base, busy, ignoreAppointmentId: 'a1' })).toMatchObject({
      ok: true,
    });
  });

  it('reads a winter request in clinic time too', () => {
    const requested = {
      startsAt: at('09:00', WINTER),
      endsAt: at('10:00', WINTER),
    };
    expect(slotIsOpen(requested, base)).toMatchObject({ ok: true });
  });
});

describe('occupancy', () => {
  it('measures booked room-minutes against the rooms the clinic had open', () => {
    expect(occupancy(60 * 5, 8 * 60, 5)).toBe(13);
  });

  it('reports nothing rather than dividing by a closed clinic', () => {
    expect(occupancy(120, 0, 5)).toBe(0);
    expect(occupancy(120, 480, 0)).toBe(0);
  });
});
