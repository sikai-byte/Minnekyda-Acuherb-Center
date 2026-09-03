/// The clinic's clock.
///
/// Strategy, in one paragraph: every instant is stored and compared in UTC, and every rule the
/// clinic states — "we open at nine", "appointments start on the quarter hour", "Thursday the
/// 26th" — is a wall-clock statement in one fixed zone. This module is the only place the two
/// are converted, so a daylight-saving change moves the clinic's hours in UTC without any
/// stored appointment or any availability rule changing.
///
/// The zone is a setting rather than a constant because a second site would need its own, but
/// it is read once at module load: a clinic whose timezone changed mid-process would have two
/// meanings of "nine o'clock" in one page render.

export const CLINIC_TIME_ZONE = process.env.CLINIC_TIME_ZONE?.trim() || 'America/Chicago';

export const MINUTES_PER_DAY = 24 * 60;

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export type ClinicParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /// 0 = Sunday, matching `Date.prototype.getDay` and the weekday stored on availability.
  weekday: number;
};

/// The wall clock the clinic would have read at that instant.
export function clinicParts(at: Date): ClinicParts {
  const parts: Record<string, string> = {};
  for (const part of PARTS.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  /// `hour12: false` renders midnight as 24 in some ICU versions.
  const hour = Number(parts.hour) % 24;
  const day = Number(parts.day);
  const month = Number(parts.month);
  const year = Number(parts.year);
  return {
    year,
    month,
    day,
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/// `YYYY-MM-DD` as the clinic would date that instant. The front desk's "today" at 11pm on the
/// last of the month is not UTC's.
export function clinicIsoDate(at: Date): string {
  const { year, month, day } = clinicParts(at);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function clinicMinutesIntoDay(at: Date): number {
  const { hour, minute } = clinicParts(at);
  return hour * 60 + minute;
}

export function clinicWeekday(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function offsetMinutesAt(at: Date): number {
  const { year, month, day, hour, minute, second } = clinicParts(at);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return (asUtc - at.getTime()) / 60_000;
}

/// The instant at which the clinic's clock read `isoDate` and `minutesIntoDay`.
///
/// Two conversions, because the offset depends on the answer: guess with the zone's offset now,
/// then verify the wall clock round-trips. `null` means that reading never happened — 2:30am on
/// the spring-forward Sunday — and the caller must not offer or accept it. When a reading
/// happens twice, on the autumn fall-back, the earlier of the two is used, so an appointment
/// booked for 1:30am is the first 1:30am.
export function clinicTimeToUtc(isoDate: string, minutesIntoDay: number): Date | null {
  if (!isIsoDate(isoDate)) return null;
  if (minutesIntoDay < 0 || minutesIntoDay >= MINUTES_PER_DAY) return null;

  const [year, month, day] = isoDate.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, day, 0, minutesIntoDay);

  let candidate = new Date(wall - offsetMinutesAt(new Date(wall)) * 60_000);
  const offset = offsetMinutesAt(candidate);
  candidate = new Date(wall - offset * 60_000);

  const parts = clinicParts(candidate);
  if (
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day ||
    parts.hour * 60 + parts.minute !== minutesIntoDay
  ) {
    return null;
  }
  return candidate;
}

/// Midnight at the start of the clinic's day. On a spring-forward day midnight itself always
/// exists, so this is safe where `clinicTimeToUtc` is not.
export function clinicDayStart(isoDate: string): Date {
  const start = clinicTimeToUtc(isoDate, 0);
  if (!start) throw new Error(`no start of day for ${isoDate}`);
  return start;
}

/// Exclusive end of the clinic's day, which is 23 or 25 hours long twice a year — computed from
/// the next day's midnight rather than by adding 24 hours, so a day-range query on a
/// daylight-saving Sunday neither drops an hour nor reaches into the next day.
export function clinicDayEnd(isoDate: string): Date {
  return clinicDayStart(addDays(isoDate, 1));
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function addMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * 60_000);
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

const TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

const DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/// Rendering helpers, so no component reaches for `toLocaleTimeString` and accidentally renders
/// the server's timezone instead of the clinic's.
export function clinicTime(at: Date): string {
  return TIME.format(at);
}

export function clinicDate(at: Date): string {
  return DATE.format(at);
}
