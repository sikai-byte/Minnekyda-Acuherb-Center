import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/session';
import { bookAppointment } from '@/lib/scheduling/booking';
import { addDays, clinicIsoDate, clinicTimeToUtc, clinicWeekday } from '@/lib/scheduling/time';
import { bookForPatient, setAppointmentStatus } from '@/lib/actions/appointments';
import { notifyAppointment, notifyRescheduled } from './notifications';
import { sendDueReminders } from './reminders';

/// Email against a real database and a stubbed provider. Three things are proved here that a
/// pure unit test cannot: what the notification layer actually reads out of a chart (only the
/// handful of logistics columns, so a schema change that pulls in a note is caught), that a
/// provider outage cannot undo a booking the clinic has already promised, and that reminders
/// are safe to run twice — a retried cron must not email the same patient again.

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

let session: SessionUser | null = null;

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

vi.mock('next/headers', () => ({
  headers: () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}));

vi.mock('@/lib/session', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/session')>();
  return {
    ...original,
    getSession: async () => ({ user: session ?? undefined }),
    getKioskSession: async () => ({}),
  };
});

const TAG = 'itest-email';
const NINE = 9 * 60;

/// What the provider was handed, so a test can read the outgoing email rather than trusting it.
type Posted = { subject: string; text: string; to: string[]; from: string };
let posted: Posted[] = [];
let providerFails = false;

function stubProvider(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      posted.push(JSON.parse(String(init.body)) as Posted);
      if (providerFails) return new Response('{"message":"nope"}', { status: 500 });
      return new Response(JSON.stringify({ id: `prov-${posted.length}` }), { status: 200 });
    }),
  );
}

function nextMonday(): string {
  let iso = clinicIsoDate(new Date());
  for (let i = 0; i < 14; i += 1) {
    iso = addDays(iso, 1);
    if (clinicWeekday(iso) === 1) return iso;
  }
  throw new Error('no Monday found');
}

const DAY = nextMonday();

function at(minutes: number, isoDate = DAY): Date {
  const instant = clinicTimeToUtc(isoDate, minutes);
  if (!instant) throw new Error('that clinic time does not exist');
  return instant;
}

type Fixtures = {
  patientId: string;
  practitionerId: string;
  typeId: string;
  admin: SessionUser;
};

let fx: Fixtures;

async function wipe(): Promise<void> {
  const patients = await prisma.patient.findMany({
    where: { lastName: TAG },
    select: { id: true },
  });
  const ids = patients.map((row) => row.id);
  await prisma.emailMessage.deleteMany({ where: { patientId: { in: ids } } });
  await prisma.appointmentEvent.deleteMany({ where: { appointment: { patientId: { in: ids } } } });
  await prisma.clinicEvent.deleteMany({ where: { patientId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { patientId: { in: ids } } });
  await prisma.appointment.deleteMany({ where: { patientId: { in: ids } } });
  await prisma.practitionerAvailability.deleteMany({
    where: { practitioner: { email: { endsWith: `@${TAG}.test` } } },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${TAG}.test` } } });
  await prisma.patient.deleteMany({ where: { lastName: TAG } });
  await prisma.appointmentType.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.treatmentRoom.deleteMany({ where: { name: { startsWith: TAG } } });
}

beforeAll(async () => {
  await wipe();
  await prisma.schedulingPolicy.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });

  await prisma.treatmentRoom.create({
    data: { name: `${TAG}-room-1`, position: 300 },
  });
  await prisma.treatmentRoom.updateMany({
    where: { name: { not: { startsWith: TAG } } },
    data: { active: false },
  });

  const type = await prisma.appointmentType.create({
    /// Named after a condition on purpose: the templates must not repeat it back to an inbox.
    data: {
      slug: `${TAG}-treatment`,
      name: 'Chronic pain follow-up',
      minutes: 60,
      publiclyBookable: true,
    },
    select: { id: true },
  });

  const patient = await prisma.patient.create({
    data: { firstName: 'Ada', lastName: TAG, email: `ada@${TAG}.test` },
    select: { id: true },
  });

  const practitioner = await prisma.user.create({
    data: {
      email: `prac@${TAG}.test`,
      name: 'Dr Rivera',
      passwordHash: 'not-a-login',
      role: 'PRACTITIONER',
    },
    select: { id: true, email: true, name: true, role: true, patientId: true },
  });
  await prisma.practitionerAvailability.createMany({
    data: [1, 2, 3, 4, 5].map((weekday) => ({
      practitionerId: practitioner.id,
      weekday,
      startMinute: NINE,
      endMinute: 17 * 60,
    })),
  });

  const admin = await prisma.user.create({
    data: {
      email: `boss@${TAG}.test`,
      name: 'Boss',
      passwordHash: 'not-a-login',
      role: 'ADMIN',
    },
    select: { id: true, email: true, name: true, role: true, patientId: true },
  });

  fx = {
    patientId: patient.id,
    practitionerId: practitioner.id,
    typeId: type.id,
    admin: { ...admin, patientId: undefined, mustChangePassword: false },
  };
});

afterAll(async () => {
  await wipe();
  await prisma.treatmentRoom.updateMany({ data: { active: true } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  session = null;
  posted = [];
  providerFails = false;
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = `Clinic <appointments@${TAG}.test>`;
  process.env.APP_BASE_URL = 'https://clinic.example';
  process.env.CLINIC_PHONE = '(555) 010-2020';
  stubProvider();
  await prisma.emailMessage.deleteMany({ where: { patientId: fx.patientId } });
  await prisma.appointmentEvent.deleteMany({ where: { appointment: { patientId: fx.patientId } } });
  await prisma.appointment.deleteMany({ where: { patientId: fx.patientId } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.APP_BASE_URL;
  delete process.env.CLINIC_PHONE;
});

async function seedAppointment(minutes = NINE, isoDate = DAY): Promise<string> {
  const result = await bookAppointment({
    patientId: fx.patientId,
    practitionerId: fx.practitionerId,
    appointmentTypeId: fx.typeId,
    startsAt: at(minutes, isoDate),
    actor: { id: null, role: 'FRONT_DESK', source: 'STAFF' },
  });
  if (!result.ok) throw new Error(`fixture booking failed: ${result.reason}`);
  return result.appointmentId;
}

describe('what a notification reads out of a chart', () => {
  it('sends the logistics and never the appointment type, even when it names a condition', async () => {
    const appointmentId = await seedAppointment();

    const outcome = await notifyAppointment(appointmentId, 'APPOINTMENT_BOOKED');

    expect(outcome.status).toBe('SENT');
    expect(posted).toHaveLength(1);
    const mail = posted[0];
    expect(mail.to).toEqual([`ada@${TAG}.test`]);
    expect(mail.text).toContain('Ada');
    expect(mail.text).toContain('Dr Rivera');
    expect(mail.text).toContain('(555) 010-2020');
    expect(mail.text).toContain('https://clinic.example/portal/appointments');
    /// The type's name, the room and the appointment id are all absent — the last of these
    /// matters because a link carrying an id ends up in browser history and referer headers.
    expect(`${mail.subject}\n${mail.text}`.toLowerCase()).not.toContain('pain');
    expect(mail.text).not.toContain(appointmentId);
    expect(mail.text).not.toContain(fx.patientId);
  });

  it('records the attempt against the appointment without storing what was written', async () => {
    const appointmentId = await seedAppointment();
    await notifyAppointment(appointmentId, 'APPOINTMENT_BOOKED');

    const row = await prisma.emailMessage.findFirst({ where: { appointmentId } });
    expect(row).toMatchObject({
      kind: 'APPOINTMENT_BOOKED',
      status: 'SENT',
      patientId: fx.patientId,
      providerId: 'prov-1',
    });
    expect(Object.keys(row ?? {})).not.toContain('subject');
    expect(Object.keys(row ?? {})).not.toContain('body');
  });

  it('sends nothing when the chart has no email address', async () => {
    const noEmail = await prisma.patient.create({
      data: { firstName: 'Grace', lastName: TAG },
      select: { id: true },
    });
    const booked = await bookAppointment({
      patientId: noEmail.id,
      practitionerId: fx.practitionerId,
      appointmentTypeId: fx.typeId,
      startsAt: at(11 * 60),
      actor: { id: null, role: 'FRONT_DESK', source: 'STAFF' },
    });
    if (!booked.ok) throw new Error(booked.reason);

    const outcome = await notifyAppointment(booked.appointmentId, 'APPOINTMENT_BOOKED');

    expect(outcome.status).toBe('SKIPPED');
    expect(posted).toHaveLength(0);
  });

  it('says nothing at all when the appointment has been deleted underneath it', async () => {
    const outcome = await notifyAppointment('does-not-exist', 'APPOINTMENT_BOOKED');
    expect(outcome.status).toBe('SKIPPED');
    expect(posted).toHaveLength(0);
  });

  it('names the old time on a move, taken before the row was changed', async () => {
    const appointmentId = await seedAppointment();
    const previous = at(NINE);
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { startsAt: at(14 * 60), endsAt: at(15 * 60) },
    });

    await notifyRescheduled(appointmentId, previous);

    expect(posted[0].text).toContain('9:00 AM');
    expect(posted[0].text).toContain('2:00 PM');
  });
});

describe('a mail provider outage', () => {
  it('leaves a staff booking committed and audited', async () => {
    providerFails = true;
    session = fx.admin;

    const form = new FormData();
    form.set('patientId', fx.patientId);
    form.set('practitionerId', fx.practitionerId);
    form.set('appointmentTypeId', fx.typeId);
    form.set('startsAt', at(NINE).toISOString());

    const state = await bookForPatient(form);

    expect(state.error).toBeUndefined();
    const appointment = await prisma.appointment.findFirst({ where: { patientId: fx.patientId } });
    expect(appointment).not.toBeNull();
    expect(appointment?.status).toBe('SCHEDULED');
    const audit = await prisma.auditLog.findFirst({
      where: { patientId: fx.patientId, action: 'book_appointment' },
    });
    expect(audit).not.toBeNull();
    const email = await prisma.emailMessage.findFirst({ where: { appointmentId: appointment?.id } });
    expect(email?.status).toBe('FAILED');
    /// Only the status code, never the provider's reply, which mirrors the email back.
    expect(email?.error).toBe('resend responded 500');
  });

  it('leaves a cancellation applied', async () => {
    providerFails = true;
    session = fx.admin;
    const appointmentId = await seedAppointment();

    const state = await setAppointmentStatus(appointmentId, 'cancel');

    expect(state.error).toBeUndefined();
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appointment?.status).toBe('CANCELLED');
  });
});

describe('a repeated lifecycle action', () => {
  it('does not email the patient twice for the same cancellation', async () => {
    session = fx.admin;
    const appointmentId = await seedAppointment();

    await setAppointmentStatus(appointmentId, 'cancel');
    await setAppointmentStatus(appointmentId, 'cancel');

    const emails = await prisma.emailMessage.findMany({
      where: { appointmentId, kind: 'APPOINTMENT_CANCELLED' },
    });
    expect(emails).toHaveLength(1);
  });
});

describe('reminders', () => {
  it('reminds tomorrow\'s confirmed visits and nothing further out', async () => {
    const soon = await seedAppointment(NINE);
    const later = await seedAppointment(NINE, addDays(DAY, 7));

    const run = await sendDueReminders({ now: new Date(at(NINE).getTime() - 20 * 60 * 60 * 1000) });

    expect(run.sent).toBe(1);
    expect(posted).toHaveLength(1);
    expect(posted[0].subject.toLowerCase()).toContain('reminder');
    const reminded = await prisma.appointment.findMany({
      where: { id: { in: [soon, later] }, reminderSentAt: { not: null } },
      select: { id: true },
    });
    expect(reminded.map((row) => row.id)).toEqual([soon]);
  });

  it('is safe to run twice, as a retried cron does', async () => {
    await seedAppointment(NINE);
    const now = new Date(at(NINE).getTime() - 20 * 60 * 60 * 1000);

    const first = await sendDueReminders({ now });
    const second = await sendDueReminders({ now });

    expect(first.sent).toBe(1);
    expect(second.considered).toBe(0);
    expect(posted).toHaveLength(1);
  });

  it('retries an appointment whose reminder the provider refused', async () => {
    await seedAppointment(NINE);
    const now = new Date(at(NINE).getTime() - 20 * 60 * 60 * 1000);

    providerFails = true;
    const failed = await sendDueReminders({ now });
    providerFails = false;
    const retried = await sendDueReminders({ now });

    expect(failed.failed).toBe(1);
    expect(retried.sent).toBe(1);
  });

  it('leaves an unconfirmed website request alone', async () => {
    const appointmentId = await seedAppointment(NINE);
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'REQUESTED' },
    });

    const run = await sendDueReminders({
      now: new Date(at(NINE).getTime() - 20 * 60 * 60 * 1000),
    });

    expect(run.considered).toBe(0);
    expect(posted).toHaveLength(0);
  });

  it('does not remind a cancelled visit', async () => {
    const appointmentId = await seedAppointment(NINE);
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED' },
    });

    const run = await sendDueReminders({
      now: new Date(at(NINE).getTime() - 20 * 60 * 60 * 1000),
    });

    expect(run.considered).toBe(0);
  });

  it('stamps a chart with no email address so it is not walked again', async () => {
    const noEmail = await prisma.patient.create({
      data: { firstName: 'Grace', lastName: TAG },
      select: { id: true },
    });
    const booked = await bookAppointment({
      patientId: noEmail.id,
      practitionerId: fx.practitionerId,
      appointmentTypeId: fx.typeId,
      startsAt: at(NINE),
      actor: { id: null, role: 'FRONT_DESK', source: 'STAFF' },
    });
    if (!booked.ok) throw new Error(booked.reason);

    const now = new Date(at(NINE).getTime() - 20 * 60 * 60 * 1000);
    const first = await sendDueReminders({ now });
    const second = await sendDueReminders({ now });

    expect(first.skipped).toBe(1);
    expect(second.considered).toBe(0);

    await prisma.appointmentEvent.deleteMany({ where: { appointmentId: booked.appointmentId } });
    await prisma.appointment.delete({ where: { id: booked.appointmentId } });
    await prisma.patient.delete({ where: { id: noEmail.id } });
  });
});
