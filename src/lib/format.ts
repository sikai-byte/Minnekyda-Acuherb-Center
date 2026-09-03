import { CLINIC_TIME_ZONE } from '@/lib/scheduling/time';

/// A date of birth or a visit date is a plain calendar date stored at midnight UTC, so it is
/// read back in UTC or it shifts a day.
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/// An instant, on the other hand, is shown on the clinic's clock. Without the zone this
/// followed whatever the server happened to be set to, which showed a 3:30pm appointment as
/// 8:30pm — the kind of thing the front desk reads out loud to a patient.
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: CLINIC_TIME_ZONE,
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return DATE_FORMAT.format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return DATE_TIME_FORMAT.format(new Date(value));
}

export function formatDateInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export function patientName(patient: { firstName: string; lastName: string }): string {
  return `${patient.firstName} ${patient.lastName}`;
}

export function age(dateOfBirth: Date | string | null | undefined): string {
  if (!dateOfBirth) return '—';
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) years -= 1;
  return `${years}`;
}
