import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/session';
import { bookAppointment } from '@/lib/scheduling/booking';
import { addDays, clinicIsoDate, clinicTimeToUtc, clinicWeekday } from '@/lib/scheduling/time';
import {
  bookForPatient,
  moveAppointmentRoom,
  rescheduleAppointment,
  setAppointmentStatus,
  staffOpenSlots,
} from './appointments';
import {
  portalBook,
  portalCancel,
  portalOpenSlots,
  portalReschedule,
  portalRescheduleSlots,
} from './portalBooking';
import { requestPublicBooking } from './publicBooking';

/// Authorization tested through the real server actions against a real database: who may
/// call each one, and what happens when a signed-in patient names somebody else's
/// appointment id. The static matrix in `authz.test.ts` proves each action has a guard; this
/// proves the guards refuse the right people and that the queries are scoped to the session.
///
/// `redirect` is what a refused caller gets in Next, and it throws in production. Here it
/// throws a recognisable error so a test can assert the refusal instead of hanging.

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

/// The audit trail records the caller's address, which only exists inside a request.
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

const TAG = 'itest-rbac';
const NINE = 9 * 60;

function nextMonday(): string {
  let iso = clinicIsoDate(new Date());
  for (let i = 0; i < 14; i += 1) {
    iso = addDays(iso, 1);
    if (clinicWeekday(iso) === 1) return iso;
  }
  throw new Error('no Monday found');
}

const DAY = nextMonday();
/// A week further on, so an appointment there is always outside the 48-hour self-reschedule
/// cutoff no matter which weekday the suite runs on.
const FAR = addDays(DAY, 7);

function at(minutes: number, isoDate = DAY): Date {
  const instant = clinicTimeToUtc(isoDate, minutes);
  if (!instant) throw new Error('that clinic time does not exist');
  return instant;
}

type Fixtures = {
  patientId: string;
  otherPatientId: string;
  practitionerId: string;
  typeId: string;
  roomIds: string[];
  admin: SessionUser;
  frontDesk: SessionUser;
  practitioner: SessionUser;
  patient: SessionUser;
  otherPatient: SessionUser;
};

let fx: Fixtures;

async function wipe(): Promise<void> {
  const patients = await prisma.patient.findMany({
    where: { lastName: TAG },
    select: { id: true },
  });
  const ids = patients.map((row) => row.id);
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

async function account(
  name: string,
  role: Role,
  patientId: string | null = null,
): Promise<SessionUser> {
  const row = await prisma.user.create({
    data: {
      email: `${name}@${TAG}.test`,
      name,
      passwordHash: 'not-a-login',
      role,
      patientId,
    },
    select: { id: true, email: true, name: true, role: true, patientId: true },
  });
  if (role === 'PRACTITIONER') {
    await prisma.practitionerAvailability.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        practitionerId: row.id,
        weekday,
        startMinute: NINE,
        endMinute: 17 * 60,
      })),
    });
  }
  return { ...row, patientId: row.patientId ?? undefined, mustChangePassword: false };
}

beforeAll(async () => {
  await wipe();
  await prisma.schedulingPolicy.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });

  const rooms = await Promise.all(
    [1, 2].map((position) =>
      prisma.treatmentRoom.create({
        data: { name: `${TAG}-room-${position}`, position: 200 + position },
        select: { id: true },
      }),
    ),
  );
  await prisma.treatmentRoom.updateMany({
    where: { name: { not: { startsWith: TAG } } },
    data: { active: false },
  });

  const type = await prisma.appointmentType.create({
    data: { slug: `${TAG}-treatment`, name: 'Treatment', minutes: 60, publiclyBookable: true },
    select: { id: true },
  });

  const [ada, grace] = await Promise.all([
    prisma.patient.create({ data: { firstName: 'Ada', lastName: TAG }, select: { id: true } }),
    prisma.patient.create({ data: { firstName: 'Grace', lastName: TAG }, select: { id: true } }),
  ]);

  fx = {
    patientId: ada.id,
    otherPatientId: grace.id,
    practitionerId: '',
    typeId: type.id,
    roomIds: rooms.map((room) => room.id),
    admin: await account('boss', 'ADMIN'),
    frontDesk: await account('desk', 'FRONT_DESK'),
    practitioner: await account('prac', 'PRACTITIONER'),
    patient: await account('ada', 'PATIENT', ada.id),
    otherPatient: await account('grace', 'PATIENT', grace.id),
  };
  fx.practitionerId = fx.practitioner.id;
});

afterAll(async () => {
  await wipe();
  await prisma.treatmentRoom.updateMany({ data: { active: true } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  session = null;
  const ids = [fx.patientId, fx.otherPatientId];
  await prisma.appointmentEvent.deleteMany({ where: { appointment: { patientId: { in: ids } } } });
  await prisma.appointment.deleteMany({ where: { patientId: { in: ids } } });
});

function bookingForm(patientId: string, minutes = NINE): FormData {
  const form = new FormData();
  form.set('patientId', patientId);
  form.set('practitionerId', fx.practitionerId);
  form.set('appointmentTypeId', fx.typeId);
  form.set('startsAt', at(minutes).toISOString());
  return form;
}

async function seedAppointment(patientId: string, minutes = NINE): Promise<string> {
  const result = await bookAppointment({
    patientId,
    practitionerId: fx.practitionerId,
    appointmentTypeId: fx.typeId,
    startsAt: at(minutes),
    actor: { id: null, role: 'FRONT_DESK', source: 'STAFF' },
  });
  if (!result.ok) throw new Error(`fixture booking failed: ${result.reason}`);
  return result.appointmentId;
}

/// Every scheduling action, and who Next hands back a redirect to.
const STAFF_ACTIONS: [string, () => Promise<unknown>][] = [
  ['staffOpenSlots', () => staffOpenSlots(fx.practitionerId, fx.typeId, DAY)],
  ['bookForPatient', () => bookForPatient(bookingForm(fx.patientId))],
  ['rescheduleAppointment', () => rescheduleAppointment('any', at(14 * 60).toISOString())],
  ['moveAppointmentRoom', () => moveAppointmentRoom('any', fx.roomIds[0])],
  ['setAppointmentStatus', () => setAppointmentStatus('any', 'check-in')],
];

const PORTAL_ACTIONS: [string, () => Promise<unknown>][] = [
  ['portalOpenSlots', () => portalOpenSlots('', fx.typeId, DAY)],
  ['portalBook', () => portalBook(new FormData())],
  ['portalCancel', () => portalCancel('any')],
  ['portalRescheduleSlots', () => portalRescheduleSlots('any', DAY)],
  ['portalReschedule', () => portalReschedule(new FormData())],
];

describe('scheduling actions refuse the wrong caller', () => {
  it.each(STAFF_ACTIONS)('%s refuses a signed-out caller', async (_name, call) => {
    session = null;
    await expect(call()).rejects.toThrow('redirect:/login');
  });

  it.each(STAFF_ACTIONS)('%s refuses a patient account', async (_name, call) => {
    session = fx.patient;
    /// Bounced to the portal, so it never reaches a query that could name another chart.
    await expect(call()).rejects.toThrow('redirect:/portal');
  });

  it.each(PORTAL_ACTIONS)('%s refuses a signed-out caller', async (_name, call) => {
    session = null;
    await expect(call()).rejects.toThrow('redirect:/login');
  });

  it.each(PORTAL_ACTIONS)('%s refuses a staff account', async (_name, call) => {
    session = fx.frontDesk;
    await expect(call()).rejects.toThrow('redirect:/');
  });

  it.each(['admin', 'frontDesk', 'practitioner'] as const)(
    'lets %s work the schedule',
    async (role) => {
      session = fx[role];
      expect(await staffOpenSlots(fx.practitionerId, fx.typeId, DAY)).toContain(
        at(NINE).toISOString(),
      );
      const booked = await bookForPatient(bookingForm(fx.patientId));
      expect(booked.error).toBeUndefined();
      expect(booked.booked).toBeTruthy();
    },
  );

  it('refuses a caller whose password is still the one we issued', async () => {
    session = { ...fx.frontDesk, mustChangePassword: true };
    await expect(staffOpenSlots(fx.practitionerId, fx.typeId, DAY)).rejects.toThrow(
      'redirect:/account/password',
    );
  });
});

describe('cross-patient isolation', () => {
  it('will not cancel another patient\u2019s appointment', async () => {
    const appointmentId = await seedAppointment(fx.otherPatientId);
    session = fx.patient;

    expect(await portalCancel(appointmentId)).toEqual({
      error: 'That appointment is not on your record.',
    });
    expect(
      await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: { status: true },
      }),
    ).toEqual({ status: 'SCHEDULED' });
  });

  it('books against the session\u2019s chart, whatever the form says', async () => {
    session = fx.patient;
    const form = new FormData();
    form.set('practitionerId', fx.practitionerId);
    form.set('appointmentTypeId', fx.typeId);
    form.set('startsAt', at(NINE).toISOString());
    /// A patient id in the payload is simply not read by the portal action.
    form.set('patientId', fx.otherPatientId);

    const result = await portalBook(form);
    expect(result.error).toBeUndefined();
    expect(
      await prisma.appointment.findMany({
        where: { patientId: fx.otherPatientId },
        select: { id: true },
      }),
    ).toEqual([]);
    expect(
      await prisma.appointment.count({ where: { patientId: fx.patientId } }),
    ).toBe(1);
  });

  it('tells a patient the time is gone, not who has it', async () => {
    await seedAppointment(fx.otherPatientId);
    /// Both rooms occupied at nine, so the patient's own attempt must fail.
    await prisma.appointment.create({
      data: {
        patientId: fx.otherPatientId,
        practitionerId: fx.practitionerId,
        appointmentTypeId: fx.typeId,
        roomId: fx.roomIds[1],
        startsAt: at(NINE),
        endsAt: at(10 * 60),
        status: 'SCHEDULED',
      },
    });

    session = fx.patient;
    const times = await portalOpenSlots('', fx.typeId, DAY);
    expect(times).not.toContain(at(NINE).toISOString());

    const form = new FormData();
    form.set('practitionerId', '');
    form.set('appointmentTypeId', fx.typeId);
    form.set('startsAt', at(NINE).toISOString());
    const result = await portalBook(form);
    expect(result.error).toBe('That time is no longer available. Pick another.');
  });

  it('offers a patient times only, with no room or practitioner attached', async () => {
    session = fx.patient;
    const times = await portalOpenSlots('', fx.typeId, DAY);
    expect(times.length).toBeGreaterThan(0);
    for (const time of times) {
      expect(typeof time).toBe('string');
      expect(time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(JSON.stringify(times)).not.toContain(fx.roomIds[0]);
    expect(JSON.stringify(times)).not.toContain(fx.practitionerId);
  });

  it('holds a patient to one upcoming appointment from the portal', async () => {
    session = fx.patient;
    const form = new FormData();
    form.set('practitionerId', fx.practitionerId);
    form.set('appointmentTypeId', fx.typeId);
    form.set('startsAt', at(NINE).toISOString());
    expect((await portalBook(form)).error).toBeUndefined();

    const again = new FormData();
    again.set('practitionerId', fx.practitionerId);
    again.set('appointmentTypeId', fx.typeId);
    again.set('startsAt', at(11 * 60).toISOString());
    expect((await portalBook(again)).error).toContain('already have an appointment');
  });
});

describe('portal self-reschedule', () => {
  function moveForm(appointmentId: string, startsAt: Date): FormData {
    const form = new FormData();
    form.set('appointmentId', appointmentId);
    form.set('startsAt', startsAt.toISOString());
    return form;
  }

  async function seedFar(patientId: string, minutes = NINE): Promise<string> {
    const result = await bookAppointment({
      patientId,
      practitionerId: fx.practitionerId,
      appointmentTypeId: fx.typeId,
      startsAt: at(minutes, FAR),
      actor: { id: null, role: 'FRONT_DESK', source: 'STAFF' },
    });
    if (!result.ok) throw new Error(`fixture booking failed: ${result.reason}`);
    return result.appointmentId;
  }

  it('moves a patient\u2019s own visit and keeps the history', async () => {
    const appointmentId = await seedFar(fx.patientId);
    session = fx.patient;

    const moved = await portalReschedule(moveForm(appointmentId, at(14 * 60, FAR)));
    expect(moved.error).toBeUndefined();
    expect(moved.confirmed).toBe(appointmentId);

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { startsAt: true, status: true },
    });
    expect(row.startsAt.toISOString()).toBe(at(14 * 60, FAR).toISOString());
    expect(row.status).toBe('SCHEDULED');

    const events = await prisma.appointmentEvent.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, actorRole: true, source: true },
    });
    expect(events.map((event) => event.type)).toEqual(['CREATED', 'RESCHEDULED']);
    expect(events[1]).toMatchObject({ actorRole: 'PATIENT', source: 'PORTAL' });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'reschedule_appointment', entityId: appointmentId },
      select: { userId: true, patientId: true, detail: true },
    });
    expect(audit).toMatchObject({ userId: fx.patient.id, patientId: fx.patientId });
    expect(JSON.stringify(audit?.detail)).not.toMatch(/reason|symptom|diagnos/i);
  });

  it('sends a patient to the phone inside the 48-hour cutoff', async () => {
    /// Tomorrow morning is in the future but always inside the cutoff. Written straight to the
    /// table because the booking rules would refuse such short notice in the first place.
    const tomorrow = addDays(clinicIsoDate(new Date()), 1);
    const appointment = await prisma.appointment.create({
      data: {
        patientId: fx.patientId,
        practitionerId: fx.practitionerId,
        appointmentTypeId: fx.typeId,
        roomId: fx.roomIds[0],
        startsAt: at(NINE, tomorrow),
        endsAt: at(NINE + 60, tomorrow),
        status: 'SCHEDULED',
      },
      select: { id: true },
    });
    session = fx.patient;

    const result = await portalReschedule(moveForm(appointment.id, at(14 * 60, FAR)));
    expect(result.error).toContain('call the clinic');
    expect(result.error).toContain('48');

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
      select: { startsAt: true },
    });
    expect(row.startsAt.toISOString()).toBe(at(NINE, tomorrow).toISOString());
    expect(
      await prisma.appointmentEvent.count({
        where: { appointmentId: appointment.id, type: 'RESCHEDULED' },
      }),
    ).toBe(0);
  });

  it('will not move, or even offer times for, another patient\u2019s visit', async () => {
    const appointmentId = await seedFar(fx.otherPatientId);
    session = fx.patient;

    expect(await portalRescheduleSlots(appointmentId, FAR)).toEqual([]);
    expect(await portalReschedule(moveForm(appointmentId, at(14 * 60, FAR)))).toEqual({
      error: 'That appointment is not on your record.',
    });
    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { startsAt: true },
    });
    expect(row.startsAt.toISOString()).toBe(at(NINE, FAR).toISOString());
  });

  it('offers the time the visit itself holds, and refuses a taken one', async () => {
    const appointmentId = await seedFar(fx.patientId);
    session = fx.patient;

    /// The appointment being moved must not block its own slot.
    const slots = await portalRescheduleSlots(appointmentId, FAR);
    expect(slots).toContain(at(NINE, FAR).toISOString());

    await prisma.appointment.createMany({
      data: fx.roomIds.map((roomId) => ({
        patientId: fx.otherPatientId,
        practitionerId: fx.practitionerId,
        appointmentTypeId: fx.typeId,
        roomId,
        startsAt: at(14 * 60, FAR),
        endsAt: at(15 * 60, FAR),
        status: 'SCHEDULED' as const,
      })),
    });

    const result = await portalReschedule(moveForm(appointmentId, at(14 * 60, FAR)));
    expect(result.error).toBe('That time is no longer available. Pick another.');
  });
});

describe('website booking', () => {
  let firstVisitTypeId: string;

  beforeAll(async () => {
    const type = await prisma.appointmentType.create({
      data: {
        slug: `${TAG}-first`,
        name: 'First consultation',
        minutes: 75,
        publiclyBookable: true,
        firstVisit: true,
        practitionerLeadMinutes: 30,
        practitionerCloseMinutes: 15,
      },
      select: { id: true },
    });
    firstVisitTypeId = type.id;
  });

  afterAll(async () => {
    await prisma.bookingAttempt.deleteMany({ where: { ip: '203.0.113.7' } });
  });

  function publicForm(startsAt: Date): FormData {
    const form = new FormData();
    form.set('firstName', 'Wanda');
    form.set('lastName', TAG);
    form.set('dateOfBirth', '1980-04-01');
    form.set('phone', '555-0100');
    form.set('email', `wanda@${TAG}.test`);
    form.set('practitionerId', '');
    form.set('appointmentTypeId', firstVisitTypeId);
    form.set('startsAt', startsAt.toISOString());
    return form;
  }

  async function bookedFrom(when: Date): Promise<{ status: string; source: string }> {
    const result = await requestPublicBooking(publicForm(when));
    if (!result.reference) throw new Error(result.error ?? 'no reference');
    return prisma.appointment.findFirstOrThrow({
      where: { startsAt: when, patient: { lastName: TAG } },
      select: { status: true, source: true },
    });
  }

  it('confirms a website visitor\u2019s first consultation as it is booked', async () => {
    expect(await bookedFrom(at(NINE, FAR))).toEqual({ status: 'SCHEDULED', source: 'PUBLIC' });
  });

  it('falls back to a request the front desk confirms when the clinic turns that off', async () => {
    await prisma.schedulingPolicy.update({
      where: { id: 'default' },
      data: { publicRequestsAutoConfirm: false },
    });
    try {
      expect(await bookedFrom(at(11 * 60, FAR))).toEqual({
        status: 'REQUESTED',
        source: 'PUBLIC',
      });
    } finally {
      await prisma.schedulingPolicy.update({
        where: { id: 'default' },
        data: { publicRequestsAutoConfirm: true },
      });
    }
  });
});

describe('staff scheduling actions', () => {
  it('audits a booking without recording why the patient is coming', async () => {
    session = fx.frontDesk;
    const booked = await bookForPatient(bookingForm(fx.patientId));
    expect(booked.booked).toBeTruthy();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'book_appointment', patientId: fx.patientId },
      orderBy: { createdAt: 'desc' },
      select: { userId: true, entity: true, detail: true },
    });
    expect(audit).toMatchObject({ userId: fx.frontDesk.id, entity: 'Appointment' });
    expect(JSON.stringify(audit?.detail)).not.toMatch(/reason|complaint|symptom|diagnos/i);
  });

  it('rejects a booking with no time, and one with a made-up time', async () => {
    session = fx.frontDesk;
    const empty = new FormData();
    expect((await bookForPatient(empty)).error).toBe(
      'Choose a practitioner, a visit type and a time.',
    );

    const junk = bookingForm(fx.patientId);
    junk.set('startsAt', 'next tuesday');
    expect((await bookForPatient(junk)).error).toBeTruthy();
  });

  it('never takes a duration from the client', async () => {
    session = fx.frontDesk;
    const form = bookingForm(fx.patientId);
    form.set('minutes', '15');
    form.set('endsAt', at(NINE + 15).toISOString());
    const booked = await bookForPatient(form);
    if (!booked.booked) throw new Error(booked.error);

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: booked.booked },
      select: { startsAt: true, endsAt: true },
    });
    expect((row.endsAt.getTime() - row.startsAt.getTime()) / 60000).toBe(60);
  });

  it('moves, re-rooms and closes out an appointment', async () => {
    const appointmentId = await seedAppointment(fx.patientId);
    session = fx.frontDesk;

    expect((await rescheduleAppointment(appointmentId, at(14 * 60).toISOString())).error)
      .toBeUndefined();
    const room = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { roomId: true },
    });
    const target = fx.roomIds.find((id) => id !== room.roomId);
    if (!target) throw new Error('no other room');
    expect((await moveAppointmentRoom(appointmentId, target)).error).toBeUndefined();
    expect((await setAppointmentStatus(appointmentId, 'check-in')).error).toBeUndefined();
    expect((await setAppointmentStatus(appointmentId, 'complete')).error).toBeUndefined();

    const events = await prisma.appointmentEvent.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, actorRole: true },
    });
    expect(events.map((event) => event.type)).toEqual([
      'CREATED',
      'RESCHEDULED',
      'ROOM_CHANGED',
      'CHECKED_IN',
      'COMPLETED',
    ]);
    expect(events.slice(1).every((event) => event.actorRole === 'FRONT_DESK')).toBe(true);
  });

  it('refuses an unknown lifecycle action', async () => {
    const appointmentId = await seedAppointment(fx.patientId);
    session = fx.frontDesk;
    /// The union is enforced at compile time; this is the runtime backstop for a hand-rolled
    /// request to the action endpoint.
    const result = await setAppointmentStatus(
      appointmentId,
      'delete' as Parameters<typeof setAppointmentStatus>[1],
    );
    expect(result).toEqual({ error: 'Unknown change.' });
  });
});
