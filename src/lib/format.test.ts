import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';

/// A visit date is a calendar date and an appointment is an instant, and they are read back in
/// different zones for that reason. This existed as a real defect: an appointment booked for
/// 3:30pm read "8:30 PM" on the chart because the formatter followed the server's zone.

describe('formatDateTime', () => {
  it('shows an instant on the clinic clock, not the server clock', () => {
    /// 2026-09-03T20:30Z is 3:30pm in Chicago (CDT).
    expect(formatDateTime(new Date('2026-09-03T20:30:00Z'))).toBe('Sep 3, 2026, 3:30 PM');
  });

  it('keeps a late-evening instant on the clinic day it belongs to', () => {
    /// 04:30Z on the 4th is still the evening of the 3rd in the clinic.
    expect(formatDateTime(new Date('2026-09-04T04:30:00Z'))).toBe('Sep 3, 2026, 11:30 PM');
  });

  it('follows the clinic through a daylight-saving change', () => {
    /// Same UTC time either side of the change reads an hour apart locally.
    expect(formatDateTime(new Date('2026-01-15T15:00:00Z'))).toBe('Jan 15, 2026, 9:00 AM');
    expect(formatDateTime(new Date('2026-07-15T15:00:00Z'))).toBe('Jul 15, 2026, 10:00 AM');
  });
});

describe('formatDate', () => {
  it('reads a stored calendar date in UTC so it cannot slip a day', () => {
    expect(formatDate(new Date('1978-04-12T00:00:00Z'))).toBe('Apr 12, 1978');
  });
});
