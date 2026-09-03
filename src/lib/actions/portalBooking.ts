'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePatient } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { recordEvent } from '@/lib/telemetry';
import {
  SELF_BOOKING_NOTICE_MINUTES,
  bookAppointment,
  openSlots,
} from '@/lib/scheduling/availability';
import { SELF_CANCEL_NOTICE_HOURS } from '@/lib/scheduling/slots';

/// A patient booking for themselves. The patient id comes from the session — as everywhere
/// in the portal — so there is no id in any of these signatures for a patient to swap.

const requestSchema = z.object({
  practitionerId: z.string().min(1),
  serviceId: z.string().min(1),
  startsAt: z.string().datetime(),
});

export type PortalBookingState = { error?: string; confirmed?: string };

export async function portalOpenSlots(
  practitionerId: string,
  serviceId: string,
  isoDate: string,
): Promise<string[]> {
  await requirePatient();
  const slots = await openSlots({
    practitionerId,
    serviceId,
    isoDate,
    minNoticeMinutes: SELF_BOOKING_NOTICE_MINUTES,
  });
  /// Times only. Who else is booked, and in which room, is none of a patient's business.
  return slots.map((slot) => slot.startsAt.toISOString());
}

export async function portalBook(formData: FormData): Promise<PortalBookingState> {
  const { user, patientId } = await requirePatient();
  const parsed = requestSchema.safeParse({
    practitionerId: formData.get('practitionerId') ?? '',
    serviceId: formData.get('serviceId') ?? '',
    startsAt: formData.get('startsAt') ?? '',
  });
  if (!parsed.success) return { error: 'Choose a visit type and a time.' };

  /// One future appointment at a time from the portal; anything more is a conversation with
  /// the front desk, and it stops the calendar being filled from one login.
  const upcoming = await prisma.appointment.count({
    where: { patientId, status: { in: ['REQUESTED', 'BOOKED'] }, startsAt: { gt: new Date() } },
  });
  if (upcoming > 0) {
    return { error: 'You already have an appointment booked. Call the clinic to add another.' };
  }

  const service = await prisma.service.findFirst({
    where: { id: parsed.data.serviceId, active: true, publiclyBookable: true },
    select: { id: true },
  });
  if (!service) return { error: 'That visit type has to be booked by phone.' };

  const result = await bookAppointment({
    patientId,
    practitionerId: parsed.data.practitionerId,
    serviceId: service.id,
    startsAt: new Date(parsed.data.startsAt),
    source: 'PORTAL',
    createdById: user.id,
    minNoticeMinutes: SELF_BOOKING_NOTICE_MINUTES,
  });
  if (!result.ok) return { error: result.reason };

  await recordAudit({
    userId: user.id,
    action: 'book_appointment',
    entity: 'Appointment',
    entityId: result.appointmentId,
    patientId,
    detail: { source: 'PORTAL', startsAt: result.startsAt.toISOString() },
  });

  revalidatePath('/portal/appointments');
  revalidatePath('/schedule');
  return { confirmed: result.appointmentId };
}

export async function portalCancel(appointmentId: string): Promise<PortalBookingState> {
  const { user, patientId } = await requirePatient();

  /// Scoped by the session's patient id, so another patient's appointment id simply is not
  /// found rather than being cancelled.
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId, status: { in: ['REQUESTED', 'BOOKED'] } },
    select: { id: true, startsAt: true },
  });
  if (!appointment) return { error: 'That appointment is not on your record.' };

  const noticeMs = SELF_CANCEL_NOTICE_HOURS * 60 * 60 * 1000;
  if (appointment.startsAt.getTime() - Date.now() < noticeMs) {
    return {
      error: `Please call the clinic to cancel within ${SELF_CANCEL_NOTICE_HOURS} hours of your appointment.`,
    };
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });

  await recordAudit({
    userId: user.id,
    action: 'cancel_appointment',
    entity: 'Appointment',
    entityId: appointment.id,
    patientId,
    detail: { source: 'PORTAL' },
  });

  await recordEvent({
    type: 'APPOINTMENT_CANCELLED',
    patientId,
    userId: user.id,
    appointmentId: appointment.id,
    source: 'PORTAL',
  });

  revalidatePath('/portal/appointments');
  revalidatePath('/schedule');
  return {};
}
