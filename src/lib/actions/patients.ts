'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable();

const patientSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  dateOfBirth: optionalString,
  sex: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']).default('UNDISCLOSED'),
  phone: optionalString,
  email: optionalString,
  streetAddress: optionalString,
  city: optionalString,
  state: optionalString,
  zip: optionalString,
  occupation: optionalString,
  primaryPhysician: optionalString,
  emergencyName: optionalString,
  emergencyPhone: optionalString,
});

export type PatientFormState = { error?: string };

function readPatientForm(formData: FormData) {
  return patientSchema.safeParse({
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') ?? '',
    dateOfBirth: formData.get('dateOfBirth') ?? '',
    sex: formData.get('sex') ?? 'UNDISCLOSED',
    phone: formData.get('phone') ?? '',
    email: formData.get('email') ?? '',
    streetAddress: formData.get('streetAddress') ?? '',
    city: formData.get('city') ?? '',
    state: formData.get('state') ?? '',
    zip: formData.get('zip') ?? '',
    occupation: formData.get('occupation') ?? '',
    primaryPhysician: formData.get('primaryPhysician') ?? '',
    emergencyName: formData.get('emergencyName') ?? '',
    emergencyPhone: formData.get('emergencyPhone') ?? '',
  });
}

export async function createPatient(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  const user = await requireUser();
  const parsed = readPatientForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { dateOfBirth, ...rest } = parsed.data;
  const patient = await prisma.patient.create({
    data: { ...rest, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null },
  });

  await recordAudit({
    userId: user.id,
    action: 'create',
    entity: 'Patient',
    entityId: patient.id,
    patientId: patient.id,
  });

  redirect(`/patients/${patient.id}`);
}

export async function updatePatient(
  patientId: string,
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  const user = await requireUser();
  const parsed = readPatientForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { dateOfBirth, ...rest } = parsed.data;
  await prisma.patient.update({
    where: { id: patientId },
    data: { ...rest, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null },
  });

  await recordAudit({
    userId: user.id,
    action: 'update',
    entity: 'Patient',
    entityId: patientId,
    patientId,
  });

  revalidatePath(`/patients/${patientId}`);
  redirect(`/patients/${patientId}`);
}
