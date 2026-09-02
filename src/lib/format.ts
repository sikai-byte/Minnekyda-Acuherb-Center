const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
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
