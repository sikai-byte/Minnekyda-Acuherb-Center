import { describe, expect, it } from 'vitest';
import {
  mergeWindows,
  openCapacity,
  practitionerUse,
  roomUse,
  summarise,
  weekOf,
  type CapacityAppointment,
} from './capacity';
import { clinicTimeToUtc } from './time';

/// The week the clinic is reporting on. A Monday, with a Wednesday that crosses no DST
/// boundary, so every expectation here is an exact number of minutes.
const MONDAY = '2026-03-02';
const NINE = 9 * 60;
const FIVE = 17 * 60;

function at(isoDate: string, minute: number): Date {
  const instant = clinicTimeToUtc(isoDate, minute);
  if (!instant) throw new Error(`${isoDate} ${minute} does not exist in clinic time`);
  return instant;
}

function visit(overrides: Partial<CapacityAppointment> = {}): CapacityAppointment {
  return {
    startsAt: at(MONDAY, NINE),
    endsAt: at(MONDAY, NINE + 60),
    status: 'SCHEDULED',
    practitionerId: 'prac-1',
    roomId: 'room-1',
    firstVisit: false,
    ...overrides,
  };
}

function starting(minute: number, overrides: Partial<CapacityAppointment> = {}): CapacityAppointment {
  return visit({ startsAt: at(MONDAY, minute), endsAt: at(MONDAY, minute + 60), ...overrides });
}

describe('weekOf', () => {
  it.each([
    ['2026-03-02', '2026-03-02'],
    ['2026-03-05', '2026-03-02'],
    /// Sunday belongs to the week that has just finished, not the one starting tomorrow.
    ['2026-03-08', '2026-03-02'],
  ])('puts %s in the week beginning %s', (isoDate, fromIso) => {
    expect(weekOf(isoDate)).toEqual({ fromIso, toIso: '2026-03-08' });
  });
});

describe('summarise', () => {
  const week: CapacityAppointment[] = [
    visit({ status: 'COMPLETED', firstVisit: true, endsAt: at(MONDAY, NINE + 75) }),
    starting(NINE + 75, { status: 'COMPLETED' }),
    starting(11 * 60, { status: 'CHECKED_IN' }),
    starting(13 * 60, { status: 'CANCELLED' }),
    starting(14 * 60, { status: 'NO_SHOW' }),
    starting(15 * 60, { status: 'REQUESTED' }),
  ];

  const summary = summarise(week, FIVE - NINE, 5);

  it('counts everything on the calendar, closed out or not', () => {
    expect(summary).toMatchObject({
      booked: 6,
      completed: 2,
      cancelled: 1,
      noShows: 1,
    });
  });

  it('splits first from returning visits so the two add up to what was booked', () => {
    expect(summary.firstVisits).toBe(1);
    expect(summary.returning).toBe(5);
    expect(summary.firstVisits + summary.returning).toBe(summary.booked);
  });

  it('counts only occupying minutes towards the fill rate', () => {
    /// 75 + 60 + 60 + 60 booked; 8 hours × 5 rooms open.
    expect(summary.bookedMinutes).toBe(255);
    expect(summary.roomMinutes).toBe(480 * 5);
    expect(summary.fillRate).toBeCloseTo(255 / 2400, 5);
  });

  it('rates attendance against the visits that were closed out', () => {
    expect(summary.completionRate).toBeCloseTo(2 / 4, 5);
    expect(summary.cancellationRate).toBeCloseTo(1 / 4, 5);
    expect(summary.noShowRate).toBeCloseTo(1 / 4, 5);
  });

  it('reports zero rather than dividing by an empty week', () => {
    const empty = summarise([], 0, 5);
    expect(empty).toMatchObject({
      booked: 0,
      fillRate: 0,
      completionRate: 0,
      cancellationRate: 0,
      noShowRate: 0,
    });
  });

  it('does not let a cancelled visit consume capacity', () => {
    const cancelled = summarise([visit({ status: 'CANCELLED' })], 480, 1);
    expect(cancelled.bookedMinutes).toBe(0);
    expect(cancelled.fillRate).toBe(0);
  });

  it('counts a completed visit as occupied, because it happened', () => {
    const completed = summarise([visit({ status: 'COMPLETED' })], 480, 1);
    expect(completed.bookedMinutes).toBe(60);
    expect(completed.fillRate).toBeCloseTo(60 / 480, 5);
  });
});

describe('practitionerUse', () => {
  const roster = [
    { id: 'prac-1', name: 'Chen', minutes: 480 },
    { id: 'prac-2', name: 'Diaz', minutes: 240 },
    { id: 'prac-3', name: 'Ede', minutes: 480 },
  ];

  const week = [
    visit(),
    starting(10 * 60),
    starting(11 * 60, { practitionerId: 'prac-2' }),
    starting(12 * 60, { practitionerId: 'prac-2', status: 'NO_SHOW' }),
  ];

  it('rates each practitioner against their own roster', () => {
    expect(practitionerUse(week, roster)).toEqual([
      { id: 'prac-1', name: 'Chen', minutes: 120, rate: 0.25 },
      { id: 'prac-2', name: 'Diaz', minutes: 60, rate: 0.25 },
      { id: 'prac-3', name: 'Ede', minutes: 0, rate: 0 },
    ]);
  });

  it('lists the busiest first, and still lists a practitioner who saw nobody', () => {
    const used = practitionerUse(week, roster);
    expect(used.map((entry) => entry.id)).toEqual(['prac-1', 'prac-2', 'prac-3']);
    expect(used.at(-1)?.minutes).toBe(0);
  });
});

describe('roomUse', () => {
  const rooms = [
    { id: 'room-1', name: 'Room 1' },
    { id: 'room-2', name: 'Room 2' },
  ];

  it('rates each room against the clinic\u2019s open minutes', () => {
    const week = [visit(), starting(10 * 60, { roomId: 'room-2' })];
    expect(roomUse(week, rooms, 480)).toEqual([
      { id: 'room-1', name: 'Room 1', minutes: 60, rate: 0.125 },
      { id: 'room-2', name: 'Room 2', minutes: 60, rate: 0.125 },
    ]);
  });

  it('keeps the clinic\u2019s room order rather than sorting by use', () => {
    const week = [starting(NINE, { roomId: 'room-2' })];
    expect(roomUse(week, rooms, 480).map((entry) => entry.id)).toEqual(['room-1', 'room-2']);
  });

  it('ignores an appointment that never got a room', () => {
    const week = [visit({ roomId: null })];
    expect(roomUse(week, rooms, 480).every((entry) => entry.minutes === 0)).toBe(true);
  });
});

describe('openCapacity', () => {
  const days = [{ isoDate: MONDAY, windows: [{ startMinute: NINE, endMinute: FIVE }] }];

  it('reports a free day as one block', () => {
    expect(openCapacity(days, [], 2, 15)).toEqual([
      { isoDate: MONDAY, startMinute: NINE, endMinute: FIVE },
    ]);
  });

  it('splits the day around the hour every room is taken', () => {
    const full = [
      visit({ roomId: 'room-1' }),
      visit({ roomId: 'room-2', practitionerId: 'prac-2' }),
    ];
    expect(openCapacity(days, full, 2, 15)).toEqual([
      { isoDate: MONDAY, startMinute: 10 * 60, endMinute: FIVE },
    ]);
  });

  it('still calls a time open while one room is free', () => {
    expect(openCapacity(days, [visit()], 2, 15)).toEqual([
      { isoDate: MONDAY, startMinute: NINE, endMinute: FIVE },
    ]);
  });

  it('reports the gap between two full stretches', () => {
    const full = [
      visit({ roomId: 'room-1' }),
      visit({ roomId: 'room-2', practitionerId: 'prac-2' }),
      starting(11 * 60, { roomId: 'room-1' }),
      starting(11 * 60, { roomId: 'room-2', practitionerId: 'prac-2' }),
    ];
    expect(openCapacity(days, full, 2, 15)).toEqual([
      { isoDate: MONDAY, startMinute: 10 * 60, endMinute: 11 * 60 },
      { isoDate: MONDAY, startMinute: 12 * 60, endMinute: FIVE },
    ]);
  });

  it('ignores a cancelled visit, whose room is back on sale', () => {
    const week = [
      visit({ roomId: 'room-1', status: 'CANCELLED' }),
      visit({ roomId: 'room-2', practitionerId: 'prac-2' }),
    ];
    expect(openCapacity(days, week, 2, 15)).toEqual([
      { isoDate: MONDAY, startMinute: NINE, endMinute: FIVE },
    ]);
  });

  it('reports each of a split day\u2019s windows separately', () => {
    const split = [
      {
        isoDate: MONDAY,
        windows: [
          { startMinute: NINE, endMinute: 12 * 60 },
          { startMinute: 13 * 60, endMinute: FIVE },
        ],
      },
    ];
    expect(openCapacity(split, [], 1, 15)).toEqual([
      { isoDate: MONDAY, startMinute: NINE, endMinute: 12 * 60 },
      { isoDate: MONDAY, startMinute: 13 * 60, endMinute: FIVE },
    ]);
  });

  it('reports nothing for a day nobody works', () => {
    expect(openCapacity([{ isoDate: MONDAY, windows: [] }], [], 5, 15)).toEqual([]);
  });

  it('skips the hour that does not exist on the spring-forward Sunday', () => {
    /// 2 a.m. to 3 a.m. local never happens on 2026-03-08, so a window spanning it reports
    /// the hours either side and not the missing one.
    const dst = [{ isoDate: '2026-03-08', windows: [{ startMinute: 60, endMinute: 4 * 60 }] }];
    const blocks = openCapacity(dst, [], 1, 60);
    expect(blocks).toEqual([
      { isoDate: '2026-03-08', startMinute: 60, endMinute: 120 },
      { isoDate: '2026-03-08', startMinute: 180, endMinute: 240 },
    ]);
  });
});

describe('mergeWindows', () => {
  it('treats two practitioners on the same shift as one open period', () => {
    expect(
      mergeWindows([
        { startMinute: NINE, endMinute: FIVE },
        { startMinute: NINE, endMinute: FIVE },
      ]),
    ).toEqual([{ startMinute: NINE, endMinute: FIVE }]);
  });

  it('joins an overlapping shift and keeps a genuine gap', () => {
    expect(
      mergeWindows([
        { startMinute: 13 * 60, endMinute: 19 * 60 },
        { startMinute: NINE, endMinute: 14 * 60 },
        { startMinute: 20 * 60, endMinute: 21 * 60 },
      ]),
    ).toEqual([
      { startMinute: NINE, endMinute: 19 * 60 },
      { startMinute: 20 * 60, endMinute: 21 * 60 },
    ]);
  });

  it('joins shifts that merely touch', () => {
    expect(
      mergeWindows([
        { startMinute: NINE, endMinute: 12 * 60 },
        { startMinute: 12 * 60, endMinute: FIVE },
      ]),
    ).toEqual([{ startMinute: NINE, endMinute: FIVE }]);
  });

  it('leaves an empty roster empty', () => {
    expect(mergeWindows([])).toEqual([]);
  });
});
