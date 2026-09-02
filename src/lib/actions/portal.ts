'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePatient } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable();

/// Patients may correct how the clinic reaches them and nothing else: name, date of birth
/// and clinical fields stay with staff so the chart's identity cannot be rewritten from
/// the portal.
const contactSchema = z.object({
  phone: optionalString,
  email: optionalString,
  streetAddress: optionalString,
  city: optionalString,
  state: optionalString,
  zip: optionalString,
  emergencyName: optionalString,
  emergencyPhone: optionalString,
});

export type ContactFormState = { error?: string; saved?: boolean };

export async function updateMyContactDetails(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const { user, patientId } = await requirePatient();

  const parsed = contactSchema.safeParse({
    phone: formData.get('phone') ?? '',
    email: formData.get('email') ?? '',
    streetAddress: formData.get('streetAddress') ?? '',
    city: formData.get('city') ?? '',
    state: formData.get('state') ?? '',
    zip: formData.get('zip') ?? '',
    emergencyName: formData.get('emergencyName') ?? '',
    emergencyPhone: formData.get('emergencyPhone') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  /// The id is the session's, so this can only ever touch the caller's own row.
  await prisma.patient.update({ where: { id: patientId }, data: parsed.data });

  await recordAudit({
    userId: user.id,
    action: 'portal_update_contact',
    entity: 'Patient',
    entityId: patientId,
    patientId,
    detail: { fields: Object.keys(parsed.data) },
  });

  revalidatePath('/portal/profile');
  return { saved: true };
}
