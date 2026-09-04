import type { EmailKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { mailConfig } from './config';

/// The one place that talks to the mail provider (Resend, over its REST API — no SDK, so
/// nothing new sits in the dependency tree of an app that handles charts).
///
/// Three rules hold everywhere below:
/// - Sending never throws. A booking that succeeded must not be reported as failed because
///   the mail provider was down, so every failure is logged and swallowed.
/// - The subject and body are the only patient-shaped data that leaves the building, and the
///   templates that build them carry logistics only — see `templates.ts`.
/// - Every attempt is recorded in `EmailMessage`, so the front desk can answer "did they get
///   the confirmation?" without asking the provider, and reminders know what has been sent.

const ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export type Message = {
  to: string;
  subject: string;
  body: string;
  kind: EmailKind;
  patientId?: string | null;
  appointmentId?: string | null;
};

export type SendOutcome = { status: 'SENT' | 'SKIPPED' | 'FAILED' };

async function post(config: NonNullable<ReturnType<typeof mailConfig>>, message: Message) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: [message.to],
      subject: message.subject,
      text: message.body,
      ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    /// The provider's error text, not the request: the request body is the email.
    throw new Error(`resend responded ${response.status}`);
  }
  const payload: unknown = await response.json();
  const id =
    typeof payload === 'object' && payload !== null && 'id' in payload
      ? String((payload as { id: unknown }).id)
      : null;
  return id;
}

async function record(
  message: Message,
  status: 'SENT' | 'SKIPPED' | 'FAILED',
  providerId: string | null,
  error: string | null,
): Promise<void> {
  try {
    await prisma.emailMessage.create({
      data: {
        kind: message.kind,
        to: message.to,
        status,
        providerId,
        error,
        patientId: message.patientId ?? null,
        appointmentId: message.appointmentId ?? null,
      },
    });
  } catch (failure) {
    console.error('email log write failed', {
      kind: message.kind,
      error: failure instanceof Error ? failure.message : 'unknown',
    });
  }
}

export async function sendEmail(message: Message): Promise<SendOutcome> {
  const config = mailConfig();
  if (!config) {
    /// No key configured: local development and synthetic environments. Logged without the
    /// body, which is the part that names a patient and a time.
    console.info('email not sent (mail is not configured)', { kind: message.kind });
    await record(message, 'SKIPPED', null, null);
    return { status: 'SKIPPED' };
  }

  try {
    const providerId = await post(config, message);
    await record(message, 'SENT', providerId, null);
    return { status: 'SENT' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    console.error('email send failed', { kind: message.kind, error: reason });
    await record(message, 'FAILED', null, reason);
    return { status: 'FAILED' };
  }
}
