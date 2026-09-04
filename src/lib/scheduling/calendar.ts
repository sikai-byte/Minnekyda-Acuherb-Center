import { CLINIC_TIME_ZONE } from './time';

/// Presentation arithmetic for the booking calendar, kept out of the components so it can be
/// tested and so both halves of the picker agree.
///
/// A month here is a `YYYY-MM` string and a day a `YYYY-MM-DD` string, both in the clinic's
/// timezone. Nothing in this file decides what is bookable: which days have times, and which
/// times, is the server's answer.

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number);
  const at = new Date(Date.UTC(year, index - 1 + delta, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const [year, index] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

/// The squares of a month grid, Sunday first, with leading blanks for the days before the
/// first. Computed on UTC dates because only the calendar's shape is wanted, not an instant.
export function monthGrid(month: string): (string | null)[] {
  const [year, index] = month.split('-').map(Number);
  const lead = new Date(Date.UTC(year, index - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const squares: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= length; day += 1) {
    squares.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  return squares;
}

/// The part of a month a booking calendar may ask the server about: the month, clipped to
/// today at the near end and to the booking horizon at the far end. Null when the whole month
/// is out of range, so no request is made at all.
export function monthRange(
  month: string,
  earliest: string,
  latest: string,
): { from: string; to: string } | null {
  const from = monthStart(month) < earliest ? earliest : monthStart(month);
  const to = monthEnd(month) > latest ? latest : monthEnd(month);
  return to < from ? null : { from, to };
}

const HOUR_FORMAT = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  hourCycle: 'h23',
  timeZone: CLINIC_TIME_ZONE,
});

/// The clinic's hour of the day for an instant — 0 to 23, and clinic-local so a patient
/// booking from another timezone sees the clinic's morning as morning.
export function clinicHour(at: Date): number {
  return Number(HOUR_FORMAT.format(at));
}

export const PERIODS = [
  { label: 'Morning', from: 0, until: 12 },
  { label: 'Afternoon', from: 12, until: 17 },
  { label: 'Evening', from: 17, until: 24 },
] as const;

export type SlotPeriod = { label: string; slots: string[] };

/// Open times split the way people talk about a day, so a long list gets scanned instead of
/// read. Empty parts of the day are dropped rather than shown as empty headings.
export function groupSlotsByPeriod(slots: string[]): SlotPeriod[] {
  return PERIODS.map(({ label, from, until }) => ({
    label,
    slots: slots.filter((slot) => {
      const hour = clinicHour(new Date(slot));
      return hour >= from && hour < until;
    }),
  })).filter((period) => period.slots.length > 0);
}
