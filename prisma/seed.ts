import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { minnekydaIntakeV1 } from '../src/lib/intake/minnekydaIntakeV1';

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

const TEMPLATES: { name: string; description: string; fields: Record<string, string> }[] = [
  {
    name: 'Acupuncture follow-up',
    description: 'Routine return visit for an established treatment plan.',
    fields: {
      subjective:
        'Since last visit:\nPain level (0-10):\nSleep:\nDigestion:\nEnergy:\nResponse to last treatment:',
      objective: 'Tongue:\nPulse:\nPalpation:\nAffect / general appearance:',
      plan: 'Treatment frequency:\nHome care:\nNext visit:',
      pointsUsed: 'Points:\nNeedle retention:\nAdjunct (moxa / cupping / e-stim / gua sha):',
    },
  },
  {
    name: 'New patient evaluation',
    description: 'First visit; pairs with the completed intake form.',
    fields: {
      subjective:
        'Chief complaint history (onset, duration, aggravating / relieving):\nTen questions — sleep, appetite, digestion, bowel / bladder, thirst, temperature, sweat, pain, energy, emotions:\nPast medical history reviewed from intake:',
      objective: 'Tongue (body, coat, moisture):\nPulse (left / right, all positions):\nPalpation / range of motion:\nVitals:',
      tcmDiagnosis: 'Pattern differentiation:\nZang-fu:\nChannels involved:',
      assessment: 'Western correlate:\nPrognosis:',
      plan: 'Treatment plan and frequency:\nLifestyle and dietary guidance:\nRe-evaluation point:',
    },
  },
  {
    name: 'Herbal consultation',
    description: 'Formula prescription or adjustment.',
    fields: {
      subjective: 'Response to current formula:\nDigestive tolerance:\nSymptom changes:',
      tcmDiagnosis: 'Pattern:',
      herbFormula:
        'Base formula:\nModifications:\nForm (granule / raw / patent):\nDosage and duration:\nCautions, interactions, pregnancy status:',
      plan: 'Refill plan:\nFollow-up:',
    },
  },
  {
    name: 'Cupping / gua sha session',
    description: 'Bodywork-only visit.',
    fields: {
      subjective: 'Area of complaint:\nPain level (0-10):',
      objective: 'Tissue findings:\nSha coloration / marking:',
      pointsUsed: 'Technique:\nAreas treated:\nDuration:',
      plan: 'Aftercare instructions given:\nNext visit:',
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
      fieldsJson: template.fields as Prisma.InputJsonValue,
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
