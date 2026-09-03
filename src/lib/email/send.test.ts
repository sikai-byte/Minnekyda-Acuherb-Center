import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from './send';

/// The provider adapter, with Resend and the database both replaced. What matters here is not
/// the HTTP call but the promises the rest of the app relies on: sending never throws, every
/// attempt is recorded, and nothing beyond the message kind reaches a log line — logs ship to
/// places the clinic does not control, so a patient's name or appointment time must not be in
/// one.

const created: Array<Record<string, unknown>> = [];

vi.mock('@/lib/db', () => ({
  prisma: {
    emailMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      },
    },
  },
}));

const MESSAGE = {
  to: 'ada@example.test',
  subject: 'Your visit is booked — Tuesday, March 3 at 3:30 PM',
  body: 'Hello Ada,\n\nYour visit with Dr Rivera is booked.',
  kind: 'APPOINTMENT_BOOKED' as const,
  patientId: 'patient-1',
  appointmentId: 'appointment-1',
};

function configure(): void {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'Clinic <appointments@example.test>';
}

let logs: string[] = [];

beforeEach(() => {
  created.length = 0;
  logs = [];
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_REPLY_TO;
  for (const level of ['info', 'error', 'warn', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map((arg) => JSON.stringify(arg)).join(' '));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function assertLogsAreClean(): void {
  const text = logs.join('\n');
  expect(text).not.toContain('ada@example.test');
  expect(text).not.toContain('Ada');
  expect(text).not.toContain('Dr Rivera');
  expect(text).not.toContain('March 3');
  expect(text).not.toContain('patient-1');
}

describe('with no mail provider configured', () => {
  it('does nothing, says so, and records the attempt as skipped', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const outcome = await sendEmail(MESSAGE);

    expect(outcome.status).toBe('SKIPPED');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: 'SKIPPED', kind: 'APPOINTMENT_BOOKED' });
    assertLogsAreClean();
  });
});

describe('with a provider configured', () => {
  it('posts the message and records the provider id', async () => {
    configure();
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: 'prov-9' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const outcome = await sendEmail(MESSAGE);

    expect(outcome.status).toBe('SENT');
    expect(created[0]).toMatchObject({ status: 'SENT', providerId: 'prov-9' });

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({
      from: 'Clinic <appointments@example.test>',
      to: ['ada@example.test'],
      subject: MESSAGE.subject,
      text: MESSAGE.body,
    });
    /// No metadata: Resend keeps whatever it is given, and a patient id or appointment id in a
    /// third party's dashboard is data the clinic no longer controls.
    expect(Object.keys(sent).sort()).toEqual(['from', 'subject', 'text', 'to']);
  });

  it('adds a reply-to only when one is configured', async () => {
    configure();
    process.env.EMAIL_REPLY_TO = 'desk@example.test';
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: 'prov-9' })));
    vi.stubGlobal('fetch', fetchSpy);

    await sendEmail(MESSAGE);

    const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(call[1].body));
    expect(sent.reply_to).toBe('desk@example.test');
  });

  it('swallows a provider rejection, records it, and logs only a status code', async () => {
    configure();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"domain not verified"}', { status: 403 })),
    );

    const outcome = await sendEmail(MESSAGE);

    expect(outcome.status).toBe('FAILED');
    expect(created[0]).toMatchObject({ status: 'FAILED', error: 'resend responded 403' });
    /// The provider's own words are not stored or logged either: its response body is a
    /// reflection of the request, which is the email.
    expect(created[0]?.error).not.toContain('domain not verified');
    expect(logs.join('\n')).not.toContain('domain not verified');
    assertLogsAreClean();
  });

  it('swallows a network failure rather than failing the caller', async () => {
    configure();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
    );

    await expect(sendEmail(MESSAGE)).resolves.toEqual({ status: 'FAILED' });
    expect(created[0]).toMatchObject({ status: 'FAILED' });
    assertLogsAreClean();
  });

  it('still reports a send when the provider returns no id', async () => {
    configure();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));

    const outcome = await sendEmail(MESSAGE);

    expect(outcome.status).toBe('SENT');
    expect(created[0]).toMatchObject({ status: 'SENT', providerId: null });
  });

  it('records no subject and no body, so the log table is not a copy of the mailbox', async () => {
    configure();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'prov-9' }))));

    await sendEmail(MESSAGE);

    expect(Object.keys(created[0] ?? {}).sort()).toEqual([
      'appointmentId',
      'error',
      'kind',
      'patientId',
      'providerId',
      'status',
      'to',
    ]);
  });
});
