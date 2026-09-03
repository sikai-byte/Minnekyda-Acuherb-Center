import { describe, expect, it } from 'vitest';
import {
  CLINIC_TIME_ZONE,
  addDays,
  clinicDayEnd,
  clinicDayStart,
  clinicIsoDate,
  clinicMinutesIntoDay,
  clinicParts,
  clinicTimeToUtc,
  clinicWeekday,
  minutesBetween,
} from './time';

/// America/Chicago is UTC-6 in winter and UTC-5 in summer, so 9am reads as 15:00Z in January
/// and 14:00Z in July. Every assertion below is an exact instant: a "some availability exists"
/// test would pass with the timezone wired up wrongly.

describe('the clinic clock', () => {
  it('is the clinic timezone, not the server one', () => {
    expect(CLINIC_TIME_ZONE).toBe('America/Chicago');
  });

  it('converts nine in the morning correctly on both sides of daylight saving', () => {
    expect(clinicTimeToUtc('2026-01-15', 9 * 60)?.toISOString()).toBe('2026-01-15T15:00:00.000Z');
    expect(clinicTimeToUtc('2026-07-15', 9 * 60)?.toISOString()).toBe('2026-07-15T14:00:00.000Z');
  });

  it('reads an instant back as the wall clock the clinic saw', () => {
    const at = new Date('2026-07-15T14:30:00.000Z');
    expect(clinicIsoDate(at)).toBe('2026-07-15');
    expect(clinicMinutesIntoDay(at)).toBe(9 * 60 + 30);
    expect(clinicParts(at).weekday).toBe(3);
  });

  it('dates a late evening by the clinic day, not the UTC one', () => {
    /// 11pm on the last of the month in Chicago is already the first in UTC.
    const at = new Date('2026-04-01T04:30:00.000Z');
    expect(clinicIsoDate(at)).toBe('2026-03-31');
    expect(clinicMinutesIntoDay(at)).toBe(23 * 60 + 30);
  });

  it('rejects a wall-clock reading that never happened', () => {
    /// Spring forward 2026: 2am jumps to 3am on 8 March, so half past two does not exist.
    expect(clinicTimeToUtc('2026-03-08', 2 * 60 + 30)).toBeNull();
    expect(clinicTimeToUtc('2026-03-08', 60 + 45)?.toISOString()).toBe('2026-03-08T07:45:00.000Z');
    expect(clinicTimeToUtc('2026-03-08', 3 * 60)?.toISOString()).toBe('2026-03-08T08:00:00.000Z');
  });

  it('takes the first of two identical readings when the clocks go back', () => {
    /// Fall back 2026: 1 November has two 1:30ams. The earlier is CDT, 06:30Z.
    expect(clinicTimeToUtc('2026-11-01', 60 + 30)?.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });

  it('measures the daylight-saving days as 23 and 25 hours', () => {
    expect(minutesBetween(clinicDayStart('2026-03-08'), clinicDayEnd('2026-03-08'))).toBe(23 * 60);
    expect(minutesBetween(clinicDayStart('2026-11-01'), clinicDayEnd('2026-11-01'))).toBe(25 * 60);
    expect(minutesBetween(clinicDayStart('2026-06-10'), clinicDayEnd('2026-06-10'))).toBe(24 * 60);
  });

  it('starts and ends an ordinary day at the clinic midnight', () => {
    expect(clinicDayStart('2026-07-15').toISOString()).toBe('2026-07-15T05:00:00.000Z');
    expect(clinicDayEnd('2026-07-15').toISOString()).toBe('2026-07-16T05:00:00.000Z');
  });

  it('walks dates without tripping over month ends or leap years', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('reads weekdays from the date string, so Sunday hours match Sunday', () => {
    expect(clinicWeekday('2026-03-08')).toBe(0);
    expect(clinicWeekday('2026-03-09')).toBe(1);
    expect(clinicWeekday('2026-03-14')).toBe(6);
  });

  it('refuses nonsense', () => {
    expect(clinicTimeToUtc('not-a-date', 0)).toBeNull();
    expect(clinicTimeToUtc('2026-07-15', -15)).toBeNull();
    expect(clinicTimeToUtc('2026-07-15', 24 * 60)).toBeNull();
  });
});
