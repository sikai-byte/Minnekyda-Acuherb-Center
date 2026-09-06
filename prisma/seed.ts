import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { minnekydaIntakeV1 } from '../src/lib/intake/minnekydaIntakeV1';
import type { StructuredNote } from '../src/lib/notes/structure';

const prisma = new PrismaClient();

/// Seeded credentials are for local development only. In production the seed refuses to run
/// without an explicit SEED_PASSWORD, and every seeded account must rotate its password and
/// enrol in MFA at first sign-in.
const DEV_PASSWORD = process.env.SEED_PASSWORD ?? 'Minnekyda-dev-1';

if (process.env.NODE_ENV === 'production' && !process.env.SEED_PASSWORD) {
  throw new Error('Refusing to seed production accounts with the development password');
}

const STAFF = [
  { email: 'admin@minnekyda.test', name: 'Clinic Admin', role: 'ADMIN' as const, credentials: null },
  {
    email: 'practitioner@minnekyda.test',
    name: 'Dr. Yulian Yang',
    role: 'PRACTITIONER' as const,
    credentials: 'LAc, DAOM',
  },
  { email: 'frontdesk@minnekyda.test', name: 'Front Desk', role: 'FRONT_DESK' as const, credentials: null },
];

/// Templates preselect the taps a visit type usually needs, so a routine note is a few
/// adjustments rather than a blank form.
const TEMPLATES: { name: string; description: string; presets: StructuredNote }[] = [
  {
    name: 'Acupuncture follow-up',
    description: 'Routine return visit for an established treatment plan.',
    presets: {
      sinceLastVisit: ['Better'],
      technique: ['Even'],
      retention: 20,
      tolerance: ['Tolerated well'],
      frequency: ['1x per week'],
      followUp: ['1 week'],
    },
  },
  {
    name: 'New patient evaluation',
    description: 'First visit; pairs with the completed intake form.',
    presets: {
      sinceLastVisit: ['First visit'],
      progress: ['New presentation'],
      technique: ['Even'],
      retention: 25,
      frequency: ['2x per week'],
      followUp: ['1 week'],
    },
  },
  {
    name: 'Herbal consultation',
    description: 'Formula prescription or adjustment.',
    presets: {
      formulaForm: ['Granules'],
      dosing: ['2x daily'],
      supply: ['2 weeks'],
      followUp: ['2 weeks'],
    },
  },
  {
    name: 'Cupping / gua sha session',
    description: 'Bodywork-only visit.',
    presets: {
      technique: ['Cupping', 'Gua sha'],
      retention: 15,
      tolerance: ['Tolerated well'],
      homeCare: ['Hydration', 'Heat to area'],
      followUp: ['1 week'],
    },
  },
];

/// The clinic's five treatment rooms. Room count is the hard ceiling on how many visits can
/// overlap, so it is data rather than a constant: adding a room is a seed edit, not a deploy.
const ROOMS = ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Room 5'];

/// Visit types. The first consultation is longer because the intake and the treatment happen
/// in the same appointment, and it is the only thing a stranger may book on the website.
///
/// The lead and close minutes are the clinic's: the practitioner is in the room for the first
/// 15 and last 15 minutes of a treatment, and the first 30 and last 15 of a first consultation.
/// The retention between them is what lets arrivals be staggered a quarter-hour apart.
const APPOINTMENT_TYPES = [
  {
    slug: 'first-consultation',
    name: 'First consultation & treatment',
    description: 'Your first visit: health history, diagnosis and a full treatment.',
    minutes: 75,
    publiclyBookable: true,
    firstVisit: true,
    practitionerLeadMinutes: 30,
    practitionerCloseMinutes: 15,
  },
  {
    slug: 'acupuncture-treatment',
    name: 'Acupuncture treatment',
    description: 'A standard return visit.',
    minutes: 60,
    publiclyBookable: true,
    firstVisit: false,
    practitionerLeadMinutes: 15,
    practitionerCloseMinutes: 15,
  },
];

/// Clinic hours, as minutes from midnight, Monday to Saturday. Times throughout the app are
/// handled in UTC, so these are clinic-local hours only once the deployment's timezone is
/// set — see the scheduling section of the README.
const CLINIC_HOURS: { weekday: number; startMinute: number; endMinute: number }[] = [
  { weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 2, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 3, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 4, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 5, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 6, startMinute: 9 * 60, endMinute: 13 * 60 },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  for (const member of STAFF) {
    await prisma.user.upsert({
      where: { email: member.email },
      update: { name: member.name, role: member.role, credentials: member.credentials },
      create: { ...member, passwordHash, mustChangePassword: true },
    });
  }

  /// Intake forms are versioned and immutable once submissions reference them: edits to the
  /// paper form should be seeded as a new version, never as an update to version 1.
  await prisma.intakeForm.upsert({
    where: { slug_version: { slug: minnekydaIntakeV1.slug, version: minnekydaIntakeV1.version } },
    update: { title: minnekydaIntakeV1.title, active: true },
    create: {
      slug: minnekydaIntakeV1.slug,
      version: minnekydaIntakeV1.version,
      title: minnekydaIntakeV1.title,
      schemaJson: minnekydaIntakeV1 as unknown as Prisma.InputJsonValue,
      active: true,
    },
  });

  for (const template of TEMPLATES) {
    const existing = await prisma.noteTemplate.findFirst({ where: { name: template.name } });
    const data = {
      name: template.name,
      description: template.description,
      fieldsJson: { presets: template.presets } as Prisma.InputJsonValue,
      active: true,
    };
    if (existing) {
      await prisma.noteTemplate.update({ where: { id: existing.id }, data });
    } else {
      await prisma.noteTemplate.create({ data });
    }
  }

  for (const [index, name] of Array.from(ROOMS.entries())) {
    await prisma.treatmentRoom.upsert({
      where: { name },
      update: { active: true, position: index },
      create: { name, position: index },
    });
  }

  for (const appointmentType of APPOINTMENT_TYPES) {
    await prisma.appointmentType.upsert({
      where: { slug: appointmentType.slug },
      update: { ...appointmentType, active: true },
      create: { ...appointmentType, active: true },
    });
  }

  /// The scheduling policy exists as a row so the clinic can change a notice period or close
  /// online booking without a deploy.
  await prisma.schedulingPolicy.upsert({ where: { id: 'default' }, update: {}, create: {} });

  /// Working hours belong to a practitioner, not the clinic, so a second practitioner can keep
  /// different days without touching anyone else's calendar.
  const practitioner = await prisma.user.findUnique({
    where: { email: 'practitioner@minnekyda.test' },
    select: { id: true },
  });
  if (practitioner) {
    await prisma.practitionerAvailability.deleteMany({
      where: { practitionerId: practitioner.id },
    });
    await prisma.practitionerAvailability.createMany({
      data: CLINIC_HOURS.map((hours) => ({ ...hours, practitionerId: practitioner.id })),
    });
  }

  console.log(
    `Seeded ${STAFF.length} staff users, intake form v${minnekydaIntakeV1.version}, ${TEMPLATES.length} note templates, ${ROOMS.length} rooms, ${APPOINTMENT_TYPES.length} appointment types.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
