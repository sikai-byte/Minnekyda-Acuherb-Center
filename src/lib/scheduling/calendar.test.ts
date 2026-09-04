import { describe, expect, it } from 'vitest';
import {
  clinicHour,
  groupSlotsByPeriod,
  monthEnd,
  monthGrid,
  monthOf,
  monthRange,
  monthStart,
  shiftMonth,
} from './calendar';

/// The booking calendar's own arithmetic. It decides nothing about availability — that is the
/// server's — but it does decide which squares exist, which month may be asked about, and
/// which part of the day a time belongs to, and those are easy to get wrong at a boundary.

describe('months', () => {
  it('reads a month off a day', () => {
    expect(monthOf('2026-03-09')).toBe('2026-03');
  });

  it('steps across a year boundary in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('knows the length of awkward months', () => {
    expect(monthStart('2026-02')).toBe('2026-02-01');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2028-02')).toBe('2028-02-29');
    expect(monthEnd('2026-04')).toBe('2026-04-30');
    expect(monthEnd('2026-12')).toBe('2026-12-31');
  });
});

describe('the month grid', () => {
  it('pads to the weekday the month starts on', () => {
    /// 1 March 2026 is a Sunday, so there is nothing to pad.
    expect(monthGrid('2026-03')[0]).toBe('2026-03-01');
    /// 1 April 2026 is a Wednesday: three blanks first.
    const april = monthGrid('2026-04');
    expect(april.slice(0, 3)).toEqual([null, null, null]);
    expect(april[3]).toBe('2026-04-01');
  });

  it('holds every day of the month exactly once', () => {
    const days = monthGrid('2026-02').filter((day): day is string => day !== null);
    expect(days).toHaveLength(28);
    expect(new Set(days).size).toBe(28);
    expect(days.at(-1)).toBe('2026-02-28');
  });
});

describe('the range a calendar may ask about', () => {
  it('clips the near end to today and the far end to the horizon', () => {
    expect(monthRange('2026-03', '2026-03-11', '2026-05-10')).toEqual({
      from: '2026-03-11',
      to: '2026-03-31',
    });
    expect(monthRange('2026-05', '2026-03-11', '2026-05-10')).toEqual({
      from: '2026-05-01',
      to: '2026-05-10',
    });
  });

  it('asks nothing for a month wholly outside the bookable window', () => {
    expect(monthRange('2026-01', '2026-03-11', '2026-05-10')).toBeNull();
    expect(monthRange('2026-06', '2026-03-11', '2026-05-10')).toBeNull();
  });

  it('keeps a single bookable day', () => {
    expect(monthRange('2026-03', '2026-03-31', '2026-04-30')).toEqual({
      from: '2026-03-31',
      to: '2026-03-31',
    });
  });
});

describe('times grouped by part of the day', () => {
  /// Clinic-local hours: these instants are 9am, 11:45am, 1pm and 6pm in America/Chicago.
  const slots = [
    '2026-03-10T14:00:00.000Z',
    '2026-03-10T16:45:00.000Z',
    '2026-03-10T18:00:00.000Z',
    '2026-03-10T23:00:00.000Z',
  ];

  it('reads the hour in the clinic timezone rather than the machine one', () => {
    expect(clinicHour(new Date('2026-03-10T14:00:00.000Z'))).toBe(9);
    expect(clinicHour(new Date('2026-03-10T05:30:00.000Z'))).toBe(0);
  });

  it('splits at noon and five', () => {
    expect(groupSlotsByPeriod(slots)).toEqual([
      { label: 'Morning', slots: [slots[0], slots[1]] },
      { label: 'Afternoon', slots: [slots[2]] },
      { label: 'Evening', slots: [slots[3]] },
    ]);
  });

  it('drops parts of the day with nothing open', () => {
    expect(groupSlotsByPeriod([slots[2]]).map((period) => period.label)).toEqual(['Afternoon']);
    expect(groupSlotsByPeriod([])).toEqual([]);
  });
});
