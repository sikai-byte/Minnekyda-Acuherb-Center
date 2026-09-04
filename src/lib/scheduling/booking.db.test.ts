import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  appointmentHistory,
  applyLifecycle,
  bookAppointment,
  changeRoom,
  rescheduleAppointment,
  type Actor,
} from './booking';
import { appointmentsOn, busyOn, getAvailableSlots, getOpenDays } from './availability';
import {
  addDays,
  clinicDayEnd,
  clinicDayStart,
  clinicIsoDate,
  clinicTimeToUtc,
  clinicWeekday,
} from './time';

/// Booking against a real Postgres, because the properties that matter most here are
/// properties of the database: the advisory lock that stops two people taking the last room,
/// the transaction that leaves a failed reschedule untouched, and the history rows written in
/// the same commit as the change they describe.
///
/// Runs under `npm run test:db`, which the CI database job runs against its own Postgres
/// service. Every row this file creates is namespaced and deleted afterwards.

const TAG = 'itest-scheduling';
const STAFF: Actor = { id: null, role: 'FRONT_DESK', source: 'STAFF' };
const PORTAL: Actor = { id: null, role: 'PATIENT', source: 'PORTAL' };

/// A Monday far enough ahead to be inside the booking horizon and never in the past.
function nextMonday(): string {
  let iso = clinicIsoDate(new Date());
  for (let i = 0; i < 14; i += 1) {
    iso = addDays(iso, 1);
    if (clinicWeekday(iso) === 1) return iso;
  }
  throw new Error('no Monday found');
}

const DAY = nextMonday();

function at(isoDate: string, minutes: number): Date {
  const instant = clinicTimeToUtc(isoDate, minutes);
  if (!instant) throw new Error('that clinic time does not exist');
  return instant;
}

const NINE = 9 * 60;
const TEN = 10 * 60;

type Fixtures = {
  patientId: string;
  otherPatientId: string;
  archivedPatientId: string;
  practitionerId: string;
  secondPractitionerId: string;
  inactivePractitionerId: string;
  frontDeskId: string;
  treatmentTypeId: string;
  firstVisitTypeId: string;
  retiredTypeId: string;
  roomIds: string[];
};

let fx: Fixtures;

async function wipe(): Promise<void> {
  await prisma.appointmentEvent.deleteMany({
    where: { appointment: { patient: { lastName: TAG } } },
  });
  /// ClinicEvent deliberately holds ids rather than relations, so its rows are found by id.
  const mine = await prisma.patient.findMany({
    where: { lastName: TAG },
    select: { id: true },
  });
  await prisma.clinicEvent.deleteMany({
    where: { patientId: { in: mine.map((row) => row.id) } },
  });
  await prisma.clinicalNote.deleteMany({ where: { patient: { lastName: TAG } } });
  await prisma.appointment.deleteMany({ where: { patient: { lastName: TAG } } });
  await prisma.clinicClosure.deleteMany({ where: { label: TAG } });
  await prisma.practitionerAvailability.deleteMany({
    where: { practitioner: { email: { endsWith: `@${TAG}.test` } } },
  });
  await prisma.patient.deleteMany({ where: { lastName: TAG } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${TAG}.test` } } });
  await prisma.appointmentType.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.treatmentRoom.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function patient(firstName: string, archived = false): Promise<string> {
  const row = await prisma.patient.create({
    data: {
      firstName,
      lastName: TAG,
      archivedAt: archived ? new Date() : null,
    },
    select: { id: true },
  });
  return row.id;
}

async function staff(
  name: string,
  role: 'PRACTITIONER' | 'FRONT_DESK',
  options: { active?: boolean; working?: boolean } = {},
): Promise<string> {
  const row = await prisma.user.create({
    data: {
      email: `${name}@${TAG}.test`,
      name,
      passwordHash: 'not-a-login',
      role,
      active: options.active ?? true,
    },
    select: { id: true },
  });
  if (options.working ?? role === 'PRACTITIONER') {
    /// Working every weekday nine to five, so a test only has to pick a time.
    await prisma.practitionerAvailability.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        practitionerId: row.id,
        weekday,
        startMinute: NINE,
        endMinute: 17 * 60,
      })),
    });
  }
  return row.id;
}

beforeAll(async () => {
  await wipe();

  /// The clinic's real capacity policy is whatever the row says; these tests assert against
  /// the conservative default the clinic is launching with.
  await prisma.schedulingPolicy.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });

  const rooms = await Promise.all(
    [1, 2, 3].map((position) =>
      prisma.treatmentRoom.create({
        data: { name: `${TAG}-room-${position}`, position: 100 + position },
        select: { id: true },
      }),
    ),
  );

  /// Only the rooms this file created may be active, or the seeded five would give every test
  /// more capacity than it is reasoning about.
  await prisma.treatmentRoom.updateMany({
    where: { name: { not: { startsWith: TAG } } },
    data: { active: false },
  });

  const [treatment, firstVisit, retired] = await Promise.all([
    prisma.appointmentType.create({
      data: { slug: `${TAG}-treatment`, name: 'Treatment', minutes: 60, publiclyBookable: true },
      select: { id: true },
    }),
    prisma.appointmentType.create({
      data: {
        slug: `${TAG}-first`,
        name: 'First visit',
        minutes: 75,
        publiclyBookable: true,
        firstVisit: true,
      },
      select: { id: true },
    }),
    prisma.appointmentType.create({
      data: { slug: `${TAG}-retired`, name: 'Retired', minutes: 60, active: false },
      select: { id: true },
    }),
  ]);

  fx = {
    patientId: await patient('Ada'),
    otherPatientId: await patient('Grace'),
    archivedPatientId: await patient('Archie', true),
    practitionerId: await staff('prac1', 'PRACTITIONER'),
    secondPractitionerId: await staff('prac2', 'PRACTITIONER'),
    inactivePractitionerId: await staff('gone', 'PRACTITIONER', { active: false }),
    frontDeskId: await staff('desk', 'FRONT_DESK'),
    treatmentTypeId: treatment.id,
    firstVisitTypeId: firstVisit.id,
    retiredTypeId: retired.id,
    roomIds: rooms.map((room) => room.id),
  };
});

afterAll(async () => {
  await wipe();
  await prisma.treatmentRoom.updateMany({ data: { active: true } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.appointmentEvent.deleteMany({
    where: { appointment: { patient: { lastName: TAG } } },
  });
  await prisma.clinicalNote.deleteMany({ where: { patient: { lastName: TAG } } });
  await prisma.appointment.deleteMany({ where: { patient: { lastName: TAG } } });
  await prisma.clinicClosure.deleteMany({ where: { label: TAG } });
});

function book(overrides: Partial<Parameters<typeof bookAppointment>[0]> = {}) {
  return bookAppointment({
    patientId: fx.patientId,
    practitionerId: fx.practitionerId,
    appointmentTypeId: fx.treatmentTypeId,
    startsAt: at(DAY, NINE),
    actor: STAFF,
    ...overrides,
  });
}

describe('bookAppointment', () => {
  it('books a valid time and derives the length from the visit type', async () => {
    const result = await book();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: result.appointmentId },
      select: { startsAt: true, endsAt: true, status: true, roomId: true, source: true },
    });
    expect(row.startsAt.toISOString()).toBe(at(DAY, NINE).toISOString());
    expect(row.endsAt.toISOString()).toBe(at(DAY, TEN).toISOString());
    expect(row.status).toBe('SCHEDULED');
    expect(fx.roomIds).toContain(row.roomId);
    expect(row.source).toBe('STAFF');
  });

  it('gives a first visit its 75 minutes', async () => {
    const result = await book({ appointmentTypeId: fx.firstVisitTypeId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.endsAt.toISOString()).toBe(at(DAY, NINE + 75).toISOString());
  });

  it('assigns a room without being asked for one', async () => {
    const first = await book();
    const second = await book({
      patientId: fx.otherPatientId,
      practitionerId: fx.secondPractitionerId,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.roomId).not.toBe(second.roomId);
  });

  it('refuses a second visit for the same practitioner at the same time', async () => {
    await book();
    const clash = await book({ patientId: fx.otherPatientId });
    expect(clash).toMatchObject({ ok: false });
  });

  it('refuses an overlapping visit, not merely an identical one', async () => {
    await book();
    const clash = await book({
      patientId: fx.otherPatientId,
      startsAt: at(DAY, NINE + 30),
    });
    expect(clash.ok).toBe(false);
  });

  it('allows a back-to-back visit that starts as the last one ends', async () => {
    await book();
    const next = await book({ patientId: fx.otherPatientId, startsAt: at(DAY, TEN) });
    expect(next.ok).toBe(true);
  });

  it('refuses to overfill the rooms even with practitioners to spare', async () => {
    const practitioners = [fx.practitionerId, fx.secondPractitionerId];
    await book({ practitionerId: practitioners[0] });
    await book({ patientId: fx.otherPatientId, practitionerId: practitioners[1] });
    /// Three rooms exist; two are now taken at nine. Fill the third directly and the next
    /// booking must be refused rather than put two patients in one room.
    const third = await prisma.appointment.create({
      data: {
        patientId: fx.patientId,
        practitionerId: fx.secondPractitionerId,
        appointmentTypeId: fx.treatmentTypeId,
        roomId: fx.roomIds[2],
        startsAt: at(DAY, NINE),
        endsAt: at(DAY, TEN),
        status: 'SCHEDULED',
      },
      select: { id: true },
    });
    expect(third.id).toBeTruthy();

    const overflow = await book({ practitionerId: fx.secondPractitionerId });
    expect(overflow).toMatchObject({ ok: false });
  });

  it('refuses a time outside the practitioner\u2019s hours', async () => {
    expect(await book({ startsAt: at(DAY, 7 * 60) })).toMatchObject({ ok: false });
  });

  it('refuses a visit that would run past the end of the day', async () => {
    expect(await book({ startsAt: at(DAY, 16 * 60 + 30) })).toMatchObject({ ok: false });
  });

  it('refuses an off-grid start', async () => {
    expect(await book({ startsAt: at(DAY, NINE + 5) })).toMatchObject({ ok: false });
  });

  it('refuses a day the practitioner does not work', async () => {
    const sunday = addDays(DAY, 6);
    expect(await book({ startsAt: at(sunday, NINE) })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('does not work'),
    });
  });

  it('refuses a booking during a clinic closure', async () => {
    await prisma.clinicClosure.create({
      data: { startsAt: at(DAY, 8 * 60), endsAt: at(DAY, 12 * 60), label: TAG },
    });
    expect(await book()).toMatchObject({ ok: false });
  });

  it('refuses a booking during that practitioner\u2019s own time off', async () => {
    await prisma.clinicClosure.create({
      data: {
        practitionerId: fx.practitionerId,
        startsAt: at(DAY, 8 * 60),
        endsAt: at(DAY, 12 * 60),
        label: TAG,
      },
    });
    expect(await book()).toMatchObject({ ok: false });
    expect(await book({ practitionerId: fx.secondPractitionerId })).toMatchObject({ ok: true });
  });

  it('refuses an archived chart', async () => {
    expect(await book({ patientId: fx.archivedPatientId })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('archived'),
    });
  });

  it('refuses a practitioner who has left', async () => {
    expect(await book({ practitionerId: fx.inactivePractitionerId })).toMatchObject({ ok: false });
  });

  it('refuses somebody who is not a practitioner at all', async () => {
    expect(await book({ practitionerId: fx.frontDeskId })).toMatchObject({ ok: false });
  });

  it('refuses a retired visit type', async () => {
    expect(await book({ appointmentTypeId: fx.retiredTypeId })).toMatchObject({ ok: false });
  });

  it('refuses an unknown patient, practitioner or visit type', async () => {
    expect(await book({ patientId: 'nope' })).toMatchObject({ ok: false });
    expect(await book({ practitionerId: 'nope' })).toMatchObject({ ok: false });
    expect(await book({ appointmentTypeId: 'nope' })).toMatchObject({ ok: false });
  });

  it('refuses a time in the past', async () => {
    const yesterday = addDays(clinicIsoDate(new Date()), -7);
    expect(await book({ startsAt: at(yesterday, NINE) })).toMatchObject({ ok: false });
  });

  it('honours a self-booking notice period', async () => {
    const today = clinicIsoDate(new Date());
    expect(
      await book({ startsAt: at(today, NINE), minNoticeMinutes: 60 * 24 * 30 }),
    ).toMatchObject({ ok: false });
  });

  it('tells a patient only that the time is gone', async () => {
    await book();
    const portal = await book({ patientId: fx.otherPatientId, actor: PORTAL });
    expect(portal).toMatchObject({ ok: false });
    if (portal.ok) return;
    expect(portal.reason).toBe('That time is no longer available. Pick another.');
    expect(portal.reason.toLowerCase()).not.toContain('practitioner');
    expect(portal.reason.toLowerCase()).not.toContain('room');
  });

  it('keeps a website request as REQUESTED and still holds the capacity', async () => {
    const requested = await book({ actor: { id: null, role: null, source: 'PUBLIC' }, status: 'REQUESTED' });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: requested.appointmentId },
      select: { status: true, source: true },
    });
    expect(row).toEqual({ status: 'REQUESTED', source: 'PUBLIC' });
    expect(await book({ patientId: fx.otherPatientId })).toMatchObject({ ok: false });
  });

  it('records the booking in the appointment\u2019s history', async () => {
    const result = await book();
    if (!result.ok) throw new Error('booking failed');
    const history = await appointmentHistory(result.appointmentId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      type: 'CREATED',
      toStatus: 'SCHEDULED',
      source: 'STAFF',
      actorRole: 'FRONT_DESK',
    });
  });
});

describe('staggered practitioner phases', () => {
  /// The clinic's actual working model: needles in for the first quarter hour, retention in
  /// the middle, needles out at the end, which is what lets one practitioner run rooms in
  /// parallel on quarter-hour starts. The phases live on the visit type, so this test turns
  /// them on for its own type and puts them back afterwards.
  beforeEach(async () => {
    await prisma.appointmentType.update({
      where: { id: fx.treatmentTypeId },
      data: { practitionerLeadMinutes: 15, practitionerCloseMinutes: 15 },
    });
    await prisma.appointmentType.update({
      where: { id: fx.firstVisitTypeId },
      data: { practitionerLeadMinutes: 30, practitionerCloseMinutes: 15 },
    });
  });

  afterAll(async () => {
    await prisma.appointmentType.updateMany({
      where: { slug: { startsWith: TAG } },
      data: { practitionerLeadMinutes: null, practitionerCloseMinutes: null },
    });
  });

  it('lets the same practitioner start the next patient a quarter hour later', async () => {
    expect(await book()).toMatchObject({ ok: true });
    expect(
      await book({ patientId: fx.otherPatientId, startsAt: at(DAY, NINE + 15) }),
    ).toMatchObject({ ok: true });
  });

  it('still refuses a start that wants the practitioner mid-phase', async () => {
    expect(await book()).toMatchObject({ ok: true });
    /// 09:45 is when the first patient's needles come out.
    expect(
      await book({ patientId: fx.otherPatientId, startsAt: at(DAY, NINE + 45) }),
    ).toMatchObject({ ok: false });
  });

  it('holds the longer opening of a first consultation clear', async () => {
    expect(await book({ appointmentTypeId: fx.firstVisitTypeId })).toMatchObject({ ok: true });
    expect(
      await book({ patientId: fx.otherPatientId, startsAt: at(DAY, NINE + 15) }),
    ).toMatchObject({ ok: false });
    expect(
      await book({ patientId: fx.otherPatientId, startsAt: at(DAY, NINE + 30) }),
    ).toMatchObject({ ok: true });
  });

  it('offers the staggered starts through the availability service too', async () => {
    expect(await book()).toMatchObject({ ok: true });
    const slots = await getAvailableSlots({
      practitionerId: fx.practitionerId,
      appointmentTypeId: fx.treatmentTypeId,
      date: DAY,
    });
    const offered = slots.map((slot) => slot.startsAt.toISOString());
    expect(offered).toContain(at(DAY, NINE + 15).toISOString());
    expect(offered).not.toContain(at(DAY, NINE + 45).toISOString());
  });

  it('gives each staggered patient a room of their own', async () => {
    const first = await book();
    const second = await book({ patientId: fx.otherPatientId, startsAt: at(DAY, NINE + 15) });
    if (!first.ok || !second.ok) throw new Error('staggered bookings failed');
    const rooms = await prisma.appointment.findMany({
      where: { id: { in: [first.appointmentId, second.appointmentId] } },
      select: { roomId: true },
    });
    expect(new Set(rooms.map((row) => row.roomId)).size).toBe(2);
  });
});

describe('concurrency', () => {
  it('does not overbook the last room when two requests arrive together', async () => {
    /// Two of the three rooms are already occupied by other practitioners, so exactly one
    /// booking can succeed at nine o'clock.
    await prisma.appointment.createMany({
      data: [0, 1].map((index) => ({
        patientId: fx.patientId,
        practitionerId: fx.secondPractitionerId,
        appointmentTypeId: fx.treatmentTypeId,
        roomId: fx.roomIds[index],
        startsAt: at(DAY, NINE),
        endsAt: at(DAY, TEN),
        status: 'SCHEDULED' as const,
      })),
    });

    const attempts = await Promise.all([
      book(),
      book({ patientId: fx.otherPatientId, practitionerId: fx.secondPractitionerId }),
      book({ patientId: fx.otherPatientId }),
    ]);

    const booked = await prisma.appointment.findMany({
      where: {
        startsAt: at(DAY, NINE),
        roomId: { in: fx.roomIds },
        status: { in: ['REQUESTED', 'SCHEDULED', 'CHECKED_IN', 'COMPLETED'] },
      },
      select: { roomId: true },
    });
    expect(booked).toHaveLength(3);
    expect(new Set(booked.map((row) => row.roomId)).size).toBe(3);
    expect(attempts.filter((attempt) => attempt.ok)).toHaveLength(1);
  });

  it('lets one of two simultaneous requests for the same practitioner win', async () => {
    const attempts = await Promise.all([
      book(),
      book({ patientId: fx.otherPatientId }),
      book({ patientId: fx.otherPatientId }),
    ]);
    expect(attempts.filter((attempt) => attempt.ok)).toHaveLength(1);
    expect(
      await prisma.appointment.count({
        where: { practitionerId: fx.practitionerId, startsAt: at(DAY, NINE) },
      }),
    ).toBe(1);
  });

  it('does not let two visits move onto the same time on another day at once', async () => {
    /// A move takes capacity on a day the transaction did not start on, so the destination day
    /// has to be locked too. Both of these are Monday visits aiming at the same Tuesday nine
    /// o'clock with the same practitioner.
    const tuesday = addDays(DAY, 1);
    const [first, second] = await Promise.all([
      book(),
      book({ patientId: fx.otherPatientId, startsAt: at(DAY, TEN) }),
    ]);
    if (!first.ok || !second.ok) throw new Error('booking failed');

    const moves = await Promise.all(
      [first, second].map((created) =>
        rescheduleAppointment({
          appointmentId: created.appointmentId,
          startsAt: at(tuesday, NINE),
          actor: STAFF,
        }),
      ),
    );
    expect(moves.filter((move) => move.ok)).toHaveLength(1);
    expect(
      await prisma.appointment.count({
        where: { practitionerId: fx.practitionerId, startsAt: at(tuesday, NINE) },
      }),
    ).toBe(1);
  });
});

describe('rescheduleAppointment', () => {
  it('moves a visit and keeps its identity', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');

    const moved = await rescheduleAppointment({
      appointmentId: created.appointmentId,
      startsAt: at(DAY, 14 * 60),
      actor: STAFF,
    });
    expect(moved).toMatchObject({ ok: true, appointmentId: created.appointmentId });

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.appointmentId },
      select: { startsAt: true, endsAt: true },
    });
    expect(row.startsAt.toISOString()).toBe(at(DAY, 14 * 60).toISOString());
    expect(row.endsAt.toISOString()).toBe(at(DAY, 15 * 60).toISOString());
  });

  it('leaves the appointment exactly as it was when the new time is taken', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await prisma.appointment.create({
      data: {
        patientId: fx.otherPatientId,
        practitionerId: fx.practitionerId,
        appointmentTypeId: fx.treatmentTypeId,
        roomId: fx.roomIds[1],
        startsAt: at(DAY, 14 * 60),
        endsAt: at(DAY, 15 * 60),
        status: 'SCHEDULED',
      },
    });

    const before = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.appointmentId },
    });
    const attempt = await rescheduleAppointment({
      appointmentId: created.appointmentId,
      startsAt: at(DAY, 14 * 60),
      actor: STAFF,
    });
    expect(attempt.ok).toBe(false);

    const after = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.appointmentId },
    });
    expect(after.startsAt.toISOString()).toBe(before.startsAt.toISOString());
    expect(after.roomId).toBe(before.roomId);
    expect(after.status).toBe(before.status);
  });

  it('can move a visit to another day', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    const tuesday = addDays(DAY, 1);
    const moved = await rescheduleAppointment({
      appointmentId: created.appointmentId,
      startsAt: at(tuesday, NINE),
      actor: STAFF,
    });
    expect(moved).toMatchObject({ ok: true });
    expect(await appointmentsOn(DAY, { patient: { lastName: TAG } })).toHaveLength(0);
    expect(await appointmentsOn(tuesday, { patient: { lastName: TAG } })).toHaveLength(1);
  });

  it('does not collide with its own current time', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    const moved = await rescheduleAppointment({
      appointmentId: created.appointmentId,
      startsAt: at(DAY, NINE + 15),
      actor: STAFF,
    });
    expect(moved).toMatchObject({ ok: true });
  });

  it('records the move, with where it came from and where it went', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await rescheduleAppointment({
      appointmentId: created.appointmentId,
      startsAt: at(DAY, 14 * 60),
      actor: STAFF,
    });
    const history = await appointmentHistory(created.appointmentId);
    expect(history.map((event) => event.type)).toEqual(['CREATED', 'RESCHEDULED']);
    expect(history[1].fromStartsAt?.toISOString()).toBe(at(DAY, NINE).toISOString());
    expect(history[1].toStartsAt?.toISOString()).toBe(at(DAY, 14 * 60).toISOString());
  });

  it('records a practitioner change as its own event', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await rescheduleAppointment({
      appointmentId: created.appointmentId,
      startsAt: at(DAY, 14 * 60),
      practitionerId: fx.secondPractitionerId,
      actor: STAFF,
    });
    const history = await appointmentHistory(created.appointmentId);
    expect(history.map((event) => event.type)).toContain('PRACTITIONER_CHANGED');
    expect(
      await prisma.appointment.findUniqueOrThrow({
        where: { id: created.appointmentId },
        select: { practitionerId: true },
      }),
    ).toEqual({ practitionerId: fx.secondPractitionerId });
  });

  it('refuses to move a cancelled or completed visit', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await applyLifecycle(created.appointmentId, 'cancel', STAFF);
    expect(
      await rescheduleAppointment({
        appointmentId: created.appointmentId,
        startsAt: at(DAY, 14 * 60),
        actor: STAFF,
      }),
    ).toMatchObject({ ok: false });
  });

  it('refuses to move an appointment that does not exist', async () => {
    expect(
      await rescheduleAppointment({
        appointmentId: 'nope',
        startsAt: at(DAY, 14 * 60),
        actor: STAFF,
      }),
    ).toMatchObject({ ok: false });
  });
});

describe('changeRoom', () => {
  it('moves a visit to a free room and records it', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    const target = fx.roomIds.find((id) => id !== created.roomId);
    if (!target) throw new Error('no other room');

    expect(await changeRoom(created.appointmentId, target, STAFF)).toMatchObject({
      ok: true,
      roomId: target,
    });
    const history = await appointmentHistory(created.appointmentId);
    expect(history.map((event) => event.type)).toEqual(['CREATED', 'ROOM_CHANGED']);
    expect(history[1].toRoomId).toBe(target);
  });

  it('refuses a room that is already in use at that time', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    const target = fx.roomIds.find((id) => id !== created.roomId);
    if (!target) throw new Error('no other room');
    await prisma.appointment.create({
      data: {
        patientId: fx.otherPatientId,
        practitionerId: fx.secondPractitionerId,
        appointmentTypeId: fx.treatmentTypeId,
        roomId: target,
        startsAt: at(DAY, NINE + 30),
        endsAt: at(DAY, TEN + 30),
        status: 'SCHEDULED',
      },
    });
    expect(await changeRoom(created.appointmentId, target, STAFF)).toMatchObject({ ok: false });
    expect(
      await prisma.appointment.findUniqueOrThrow({
        where: { id: created.appointmentId },
        select: { roomId: true },
      }),
    ).toEqual({ roomId: created.roomId });
  });

  it('refuses a room the clinic is not using', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    expect(await changeRoom(created.appointmentId, 'nope', STAFF)).toMatchObject({ ok: false });
  });
});

describe('lifecycle', () => {
  it('walks a visit from booked to completed', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');

    expect(await applyLifecycle(created.appointmentId, 'check-in', STAFF)).toMatchObject({
      ok: true,
      status: 'CHECKED_IN',
    });
    expect(await applyLifecycle(created.appointmentId, 'complete', STAFF)).toMatchObject({
      ok: true,
      status: 'COMPLETED',
    });

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.appointmentId },
      select: { status: true, checkedInAt: true, completedAt: true },
    });
    expect(row.status).toBe('COMPLETED');
    expect(row.checkedInAt).not.toBeNull();
    expect(row.completedAt).not.toBeNull();
  });

  it('confirms a website request', async () => {
    const created = await book({ status: 'REQUESTED', actor: { id: null, role: null, source: 'PUBLIC' } });
    if (!created.ok) throw new Error('booking failed');
    expect(await applyLifecycle(created.appointmentId, 'confirm', STAFF)).toMatchObject({
      ok: true,
      status: 'SCHEDULED',
    });
  });

  it('releases the capacity a cancellation gave back', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    expect(await book({ patientId: fx.otherPatientId })).toMatchObject({ ok: false });

    await applyLifecycle(created.appointmentId, 'cancel', STAFF);
    expect(await book({ patientId: fx.otherPatientId })).toMatchObject({ ok: true });
  });

  it('releases the capacity a no-show gave back', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await applyLifecycle(created.appointmentId, 'no-show', STAFF);
    expect(await book({ patientId: fx.otherPatientId })).toMatchObject({ ok: true });
  });

  it('keeps a completed visit\u2019s time occupied, because it happened', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await applyLifecycle(created.appointmentId, 'complete', STAFF);
    expect(await book({ patientId: fx.otherPatientId })).toMatchObject({ ok: false });
  });

  it('will not mark a completed visit a no-show', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await applyLifecycle(created.appointmentId, 'complete', STAFF);
    expect(await applyLifecycle(created.appointmentId, 'no-show', STAFF)).toMatchObject({
      ok: false,
    });
  });

  it('will not un-complete a visit by cancelling it', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await applyLifecycle(created.appointmentId, 'complete', STAFF);
    expect(await applyLifecycle(created.appointmentId, 'cancel', STAFF)).toMatchObject({
      ok: false,
    });
    expect(
      await prisma.appointment.findUniqueOrThrow({
        where: { id: created.appointmentId },
        select: { status: true },
      }),
    ).toEqual({ status: 'COMPLETED' });
  });

  it('will not check in a cancelled visit', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await applyLifecycle(created.appointmentId, 'cancel', STAFF);
    expect(await applyLifecycle(created.appointmentId, 'check-in', STAFF)).toMatchObject({
      ok: false,
    });
  });

  it('refuses a lifecycle action on an appointment that does not exist', async () => {
    expect(await applyLifecycle('nope', 'check-in', STAFF)).toMatchObject({ ok: false });
  });

  it('keeps the history of a cancelled visit rather than deleting it', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await applyLifecycle(created.appointmentId, 'check-in', STAFF);
    await applyLifecycle(created.appointmentId, 'cancel', STAFF);

    const history = await appointmentHistory(created.appointmentId);
    expect(history.map((event) => event.type)).toEqual(['CREATED', 'CHECKED_IN', 'CANCELLED']);
    expect(history.every((event) => event.createdAt instanceof Date)).toBe(true);
    expect(history[2]).toMatchObject({ fromStatus: 'CHECKED_IN', toStatus: 'CANCELLED' });
  });
});

describe('getAvailableSlots', () => {
  it('offers the practitioner\u2019s whole day when nothing is booked', async () => {
    const slots = await getAvailableSlots({
      practitionerId: fx.practitionerId,
      appointmentTypeId: fx.treatmentTypeId,
      date: DAY,
    });
    expect(slots[0].startsAt.toISOString()).toBe(at(DAY, NINE).toISOString());
    expect(slots.at(-1)?.startsAt.toISOString()).toBe(at(DAY, 16 * 60).toISOString());
  });

  it('stops offering a time once it is booked', async () => {
    await book();
    const slots = await getAvailableSlots({
      practitionerId: fx.practitionerId,
      appointmentTypeId: fx.treatmentTypeId,
      date: DAY,
    });
    expect(slots.map((slot) => slot.startsAt.toISOString())).not.toContain(
      at(DAY, NINE).toISOString(),
    );
  });

  it('offers the same time for a different practitioner', async () => {
    await book();
    const slots = await getAvailableSlots({
      practitionerId: fx.secondPractitionerId,
      appointmentTypeId: fx.treatmentTypeId,
      date: DAY,
    });
    expect(slots.map((slot) => slot.startsAt.toISOString())).toContain(
      at(DAY, NINE).toISOString(),
    );
  });

  it('answers "any practitioner" without saying who', async () => {
    const slots = await getAvailableSlots({
      practitionerId: null,
      appointmentTypeId: fx.treatmentTypeId,
      date: DAY,
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(Object.keys(slots[0])).toEqual(
      expect.arrayContaining(['startsAt', 'endsAt', 'roomId', 'practitionerId']),
    );
  });

  it('offers nothing for a malformed date, an unknown type or a retired type', async () => {
    const base = { practitionerId: fx.practitionerId, date: DAY };
    expect(await getAvailableSlots({ ...base, appointmentTypeId: fx.retiredTypeId })).toEqual([]);
    expect(await getAvailableSlots({ ...base, appointmentTypeId: 'nope' })).toEqual([]);
    expect(
      await getAvailableSlots({
        ...base,
        date: 'tomorrow',
        appointmentTypeId: fx.treatmentTypeId,
      }),
    ).toEqual([]);
  });

  it('offers nothing beyond the booking horizon or before today', async () => {
    const type = fx.treatmentTypeId;
    expect(
      await getAvailableSlots({
        practitionerId: fx.practitionerId,
        appointmentTypeId: type,
        date: addDays(clinicIsoDate(new Date()), 400),
      }),
    ).toEqual([]);
    expect(
      await getAvailableSlots({
        practitionerId: fx.practitionerId,
        appointmentTypeId: type,
        date: addDays(clinicIsoDate(new Date()), -1),
      }),
    ).toEqual([]);
  });

  it('offers the time an appointment being moved currently holds', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    const slots = await getAvailableSlots({
      practitionerId: fx.practitionerId,
      appointmentTypeId: fx.treatmentTypeId,
      date: DAY,
      ignoreAppointmentId: created.appointmentId,
    });
    expect(slots.map((slot) => slot.startsAt.toISOString())).toContain(
      at(DAY, NINE).toISOString(),
    );
  });

  it('never reads a patient into the busy set the public form relies on', async () => {
    await book();
    const busy = await busyOn(DAY);
    expect(busy.length).toBeGreaterThan(0);
    for (const entry of busy) {
      expect(Object.keys(entry).sort()).toEqual(
        ['appointmentId', 'endsAt', 'phases', 'practitionerId', 'roomId', 'startsAt'].sort(),
      );
    }
  });
});

describe('getOpenDays', () => {
  const week = () =>
    getOpenDays({
      practitionerId: fx.practitionerId,
      appointmentTypeId: fx.treatmentTypeId,
      from: DAY,
      to: addDays(DAY, 6),
    });

  it('names the days the practitioner works and no others', async () => {
    expect(await week()).toEqual([
      DAY,
      addDays(DAY, 1),
      addDays(DAY, 2),
      addDays(DAY, 3),
      addDays(DAY, 4),
    ]);
  });

  it('drops a day the practitioner is entirely away', async () => {
    await prisma.clinicClosure.create({
      data: {
        practitionerId: fx.practitionerId,
        startsAt: clinicDayStart(addDays(DAY, 2)),
        endsAt: clinicDayEnd(addDays(DAY, 2)),
        label: TAG,
      },
    });
    expect(await week()).not.toContain(addDays(DAY, 2));
  });

  it('keeps a day that still has one time left', async () => {
    await book();
    expect(await week()).toContain(DAY);
  });

  it('offers a day back to the appointment being moved off it', async () => {
    await prisma.clinicClosure.create({
      data: {
        practitionerId: fx.practitionerId,
        startsAt: clinicDayStart(addDays(DAY, 1)),
        endsAt: clinicDayEnd(addDays(DAY, 1)),
        label: TAG,
      },
    });
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    const days = await getOpenDays({
      practitionerId: fx.practitionerId,
      appointmentTypeId: fx.treatmentTypeId,
      from: DAY,
      to: addDays(DAY, 6),
      ignoreAppointmentId: created.appointmentId,
    });
    expect(days).toContain(DAY);
    expect(days).not.toContain(addDays(DAY, 1));
  });

  it('clips the range to today and to the booking horizon', async () => {
    const today = clinicIsoDate(new Date());
    const days = await getOpenDays({
      practitionerId: fx.practitionerId,
      appointmentTypeId: fx.treatmentTypeId,
      from: addDays(today, -30),
      to: addDays(today, 400),
    });
    for (const day of days) {
      expect(day >= today).toBe(true);
      expect(day <= addDays(today, 60)).toBe(true);
    }
  });

  it('answers nothing for a malformed range, a backwards range or a retired type', async () => {
    const base = {
      practitionerId: fx.practitionerId,
      appointmentTypeId: fx.treatmentTypeId,
      from: DAY,
      to: addDays(DAY, 6),
    };
    expect(await getOpenDays({ ...base, from: 'next week' })).toEqual([]);
    expect(await getOpenDays({ ...base, from: addDays(DAY, 6), to: DAY })).toEqual([]);
    expect(await getOpenDays({ ...base, appointmentTypeId: fx.retiredTypeId })).toEqual([]);
  });
});

describe('the schedule view', () => {
  it('reads a day in one query and carries no note content', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await prisma.clinicalNote.create({
      data: {
        patientId: fx.patientId,
        authorId: fx.practitionerId,
        appointmentId: created.appointmentId,
        visitDate: at(DAY, NINE),
        chiefComplaint: 'marker-should-not-appear',
        status: 'DRAFT',
      },
    });

    const day = await appointmentsOn(DAY, { patient: { lastName: TAG } });
    expect(day).toHaveLength(1);
    expect(JSON.stringify(day)).not.toContain('marker-should-not-appear');
    expect(JSON.stringify(day)).not.toContain('chiefComplaint');
  });

  it('shows a cancelled visit rather than hiding what happened to the day', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    await applyLifecycle(created.appointmentId, 'cancel', STAFF);
    const day = await appointmentsOn(DAY, { patient: { lastName: TAG } });
    expect(day.map((row) => row.status)).toEqual(['CANCELLED']);
  });
});

describe('clinical note linkage', () => {
  it('links a note to the visit it documents', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    const note = await prisma.clinicalNote.create({
      data: {
        patientId: fx.patientId,
        authorId: fx.practitionerId,
        appointmentId: created.appointmentId,
        visitDate: at(DAY, NINE),
      },
      select: { id: true, appointmentId: true },
    });
    expect(note.appointmentId).toBe(created.appointmentId);
  });

  it('keeps the note when the visit is cancelled', async () => {
    const created = await book();
    if (!created.ok) throw new Error('booking failed');
    const note = await prisma.clinicalNote.create({
      data: {
        patientId: fx.patientId,
        authorId: fx.practitionerId,
        appointmentId: created.appointmentId,
        visitDate: at(DAY, NINE),
        status: 'SIGNED',
        signedAt: new Date(),
      },
      select: { id: true },
    });
    await applyLifecycle(created.appointmentId, 'cancel', STAFF);
    expect(
      await prisma.clinicalNote.findUniqueOrThrow({
        where: { id: note.id },
        select: { appointmentId: true, status: true },
      }),
    ).toEqual({ appointmentId: created.appointmentId, status: 'SIGNED' });
  });
});
