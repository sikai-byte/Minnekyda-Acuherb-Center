import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { minnekydaIntakeV1 } from '../src/lib/intake/minnekydaIntakeV1';
import type { StructuredNote } from '../src/lib/notes/structure';

const prisma = new PrismaClient();

const DEV_PASSWORD = process.env.SEED_PASSWORD ?? 'minnekyda-dev';

const STAFF = [
  { email: 'admin@minnekyda.test', name: 'Clinic Admin', role: 'ADMIN' as const, credentials: null },
  {
    email: 'practitioner@minnekyda.test',
    name: 'Dr. Wei Chen',
    role: 'PRACTITIONER' as const,
    credentials: 'L.Ac., Dipl. O.M.',
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

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  for (const member of STAFF) {
    await prisma.user.upsert({
      where: { email: member.email },
      update: { name: member.name, role: member.role, credentials: member.credentials },
      create: { ...member, passwordHash },
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

  console.log(`Seeded ${STAFF.length} staff users, intake form v${minnekydaIntakeV1.version}, ${TEMPLATES.length} note templates.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
