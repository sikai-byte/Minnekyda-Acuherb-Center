/// Mail configuration. Reading it through one module keeps the "is email switched on at all"
/// question in a single place: with no API key the clinic still works and nothing is sent,
/// which is how local development and any synthetic environment should behave.

export type MailConfig = {
  apiKey: string;
  from: string;
  replyTo: string | null;
  baseUrl: string;
  clinicName: string;
  clinicPhone: string | null;
};

function trimmed(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export const CLINIC_NAME = trimmed('CLINIC_NAME') ?? 'Minnekyda Acuherb Center';

/// Absolute links are needed in email, where a relative one is meaningless.
export function baseUrl(): string {
  return (trimmed('APP_BASE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function mailConfig(): MailConfig | null {
  const apiKey = trimmed('RESEND_API_KEY');
  const from = trimmed('EMAIL_FROM');
  if (!apiKey || !from) return null;
  return {
    apiKey,
    from,
    replyTo: trimmed('EMAIL_REPLY_TO'),
    baseUrl: baseUrl(),
    clinicName: CLINIC_NAME,
    clinicPhone: trimmed('CLINIC_PHONE'),
  };
}
