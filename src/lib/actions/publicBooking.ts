'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { distinctStarts, getAvailableSlots } from '@/lib/scheduling/availability';
import { bookAppointment } from '@/lib/scheduling/booking';
import { schedulingSettings } from '@/lib/scheduling/policy';
import { clinicIsoDate } from '@/lib/scheduling/time';

/// The only unauthenticated writes in the product: a first-time patient asking for a
/// consultation on the public website.
///
/// Two rules make that safe. First, it reads no charts. It never looks a patient up by name,
/// email or date of birth, so there is no question it can be asked whose answer reveals
/// whether someone is a patient here — a repeat visitor simply produces a second chart that
/// the front desk merges. Second, it collects identity and contact details only: there is no
/// symptom, reason or comment field anywhere in this flow, so nothing a stranger types on the
/// open internet is health information.
///
/// The request lands as an `Appointment` with status `REQUESTED`. It holds the room so the
/// slot cannot be sold twice, and the front desk confirms it.

const PUBLIC_REQUESTS_PER_HOUR = 5;
const PUBLIC_REQUESTS_PER_DAY = 20;

const requestSchema = z.object({
  firstName: z.string().trim().min(1, 'Tell us your first name.').max(80),
  lastName: z.string().trim().min(1, 'Tell us your last name.').max(80),
  dateOfBirth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth.'),
  phone: z.string().trim().min(7, 'Enter a phone number we can reach you on.').max(40),
  email: z.string().trim().email('Enter an email address for your confirmation.').max(120),
  practitionerId: z.string(),
  appointmentTypeId: z.string().min(1),
  startsAt: z.string().datetime(),
  /// Bots fill every field they find; people never see this one.
  decoy: z.string().max(0).optional().or(z.literal('')),
});

export type PublicBookingState = { error?: string; reference?: string; when?: string };

function sourceIp(): string | null {
  return headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

/// Counting submissions per source address, not per identity: throttling by email would need
/// this action to look accounts up, which is exactly what it must not do.
async function throttled(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const now = Date.now();
  const [lastHour, lastDay] = await Promise.all([
    prisma.bookingAttempt.count({ where: { ip, createdAt: { gt: new Date(now - 60 * 60 * 1000) } } }),
    prisma.bookingAttempt.count({ where: { ip, createdAt: { gt: new Date(now - 24 * 60 * 60 * 1000) } } }),
  ]);
  return lastHour >= PUBLIC_REQUESTS_PER_HOUR || lastDay >= PUBLIC_REQUESTS_PER_DAY;
}

export async function publicOpenSlots(
  practitionerId: string,
  appointmentTypeId: string,
  date: string,
): Promise<string[]> {
  /// Deliberately unauthenticated, and it discloses nothing but free times: no patient, no
  /// room, and no hint about who occupies the times that are missing.
  const appointmentType = await prisma.appointmentType.findFirst({
    where: { id: appointmentTypeId, active: true, publiclyBookable: true, firstVisit: true },
    select: { id: true },
  });
  if (!appointmentType) return [];

  const settings = await schedulingSettings();
  const slots = await getAvailableSlots({
    practitionerId: practitionerId || null,
    appointmentTypeId: appointmentType.id,
    date,
    minNoticeMinutes: settings.selfBookingNoticeMinutes,
  });
  return distinctStarts(slots).map((slot) => slot.startsAt.toISOString());
}

export async function requestPublicBooking(formData: FormData): Promise<PublicBookingState> {
  const parsed = requestSchema.safeParse({
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') ?? '',
    dateOfBirth: formData.get('dateOfBirth') ?? '',
    phone: formData.get('phone') ?? '',
    email: formData.get('email') ?? '',
    practitionerId: formData.get('practitionerId') ?? '',
    appointmentTypeId: formData.get('appointmentTypeId') ?? '',
    startsAt: formData.get('startsAt') ?? '',
    decoy: formData.get('decoy') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message ?? 'Check the details and try again.' };
  }

  const ip = sourceIp();
  if (await throttled(ip)) {
    return { error: 'Too many requests from this connection. Please call the clinic.' };
  }
  await prisma.bookingAttempt.create({ data: { ip } });

  /// Only a first-visit type may be booked by someone with no chart; anything else is a
  /// returning patient, who books in the portal or by phone.
  const appointmentType = await prisma.appointmentType.findFirst({
    where: {
      id: parsed.data.appointmentTypeId,
      active: true,
      publiclyBookable: true,
      firstVisit: true,
    },
    select: { id: true },
  });
  if (!appointmentType) return { error: 'Please call the clinic to book that visit.' };

  const settings = await schedulingSettings();
  const startsAt = new Date(parsed.data.startsAt);

  /// Whoever is free takes the visit when the caller did not choose. Resolved server-side, so
  /// the public form never has to be told which practitioners exist to be able to book.
  const offered = await getAvailableSlots({
    practitionerId: parsed.data.practitionerId || null,
    appointmentTypeId: appointmentType.id,
    date: clinicIsoDate(startsAt),
    minNoticeMinutes: settings.selfBookingNoticeMinutes,
  });
  const practitionerId = offered.find(
    (slot) => slot.startsAt.getTime() === startsAt.getTime(),
  )?.practitionerId;
  if (!practitionerId) return { error: 'That time has just gone. Please pick another.' };

  const patient = await prisma.patient.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      dateOfBirth: new Date(`${parsed.data.dateOfBirth}T00:00:00.000Z`),
      phone: parsed.data.phone,
      email: parsed.data.email,
      selfRegisteredAt: new Date(),
    },
    select: { id: true },
  });

  const result = await bookAppointment({
    patientId: patient.id,
    practitionerId,
    appointmentTypeId: appointmentType.id,
    startsAt,
    actor: { id: null, role: null, source: 'PUBLIC' },
    status: 'REQUESTED',
    minNoticeMinutes: settings.selfBookingNoticeMinutes,
  });

  if (!result.ok) {
    /// The slot went while the form was open. The chart stays — the front desk would rather
    /// have the enquiry than lose it — but the person is told to pick again.
    await recordAudit({
      action: 'public_booking_failed',
      entity: 'Patient',
      entityId: patient.id,
      patientId: patient.id,
      detail: { reason: result.reason },
    });
    return { error: result.reason };
  }

  await recordAudit({
    action: 'public_booking_requested',
    entity: 'Appointment',
    entityId: result.appointmentId,
    patientId: patient.id,
    detail: { source: 'PUBLIC', startsAt: result.startsAt.toISOString() },
  });

  revalidatePath('/schedule');
  /// A short reference, not the row id: the confirmation screen is public.
  return {
    reference: result.appointmentId.slice(-6).toUpperCase(),
    when: result.startsAt.toISOString(),
  };
}
