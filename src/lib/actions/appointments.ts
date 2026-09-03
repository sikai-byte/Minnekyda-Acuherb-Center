'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { AppointmentStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { bookAppointment, openSlots } from '@/lib/scheduling/availability';

/// The front desk's side of the calendar. Every one of these names a patient, so every one
/// needs a staff session and an audit row; none of them accepts or stores a reason for the
/// visit, because the calendar carries no health information.

const bookingSchema = z.object({
  patientId: z.string().min(1),
  practitionerId: z.string().min(1),
  serviceId: z.string().min(1),
  /// The exact slot the browser was shown, as an ISO instant.
  startsAt: z.string().datetime(),
});

export type AppointmentActionState = { error?: string; booked?: string };

export async function staffOpenSlots(
  practitionerId: string,
  serviceId: string,
  isoDate: string,
): Promise<string[]> {
  await requireUser();
  const slots = await openSlots({ practitionerId, serviceId, isoDate });
  return slots.map((slot) => slot.startsAt.toISOString());
}

export async function bookForPatient(formData: FormData): Promise<AppointmentActionState> {
  const user = await requireUser();
  const parsed = bookingSchema.safeParse({
    patientId: formData.get('patientId') ?? '',
    practitionerId: formData.get('practitionerId') ?? '',
    serviceId: formData.get('serviceId') ?? '',
    startsAt: formData.get('startsAt') ?? '',
  });
  if (!parsed.success) return { error: 'Choose a practitioner, a visit type and a time.' };

  const result = await bookAppointment({
    patientId: parsed.data.patientId,
    practitionerId: parsed.data.practitionerId,
    serviceId: parsed.data.serviceId,
    startsAt: new Date(parsed.data.startsAt),
    source: 'STAFF',
    createdById: user.id,
  });
  if (!result.ok) return { error: result.reason };

  await recordAudit({
    userId: user.id,
    action: 'book_appointment',
    entity: 'Appointment',
    entityId: result.appointmentId,
    patientId: parsed.data.patientId,
    detail: { source: 'STAFF', startsAt: result.startsAt.toISOString() },
  });

  revalidatePath('/schedule');
  revalidatePath(`/patients/${parsed.data.patientId}`);
  return { booked: result.appointmentId };
}

export async function rescheduleAppointment(
  appointmentId: string,
  startsAtIso: string,
): Promise<AppointmentActionState> {
  const user = await requireUser();
  const existing = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true, practitionerId: true, serviceId: true, status: true },
  });
  if (!existing) return { error: 'That appointment no longer exists.' };
  if (existing.status === 'COMPLETED') return { error: 'A completed visit cannot be moved.' };

  const result = await bookAppointment({
    patientId: existing.patientId,
    practitionerId: existing.practitionerId,
    serviceId: existing.serviceId,
    startsAt: new Date(startsAtIso),
    source: 'STAFF',
    createdById: user.id,
    replacingId: appointmentId,
  });
  if (!result.ok) return { error: result.reason };

  await recordAudit({
    userId: user.id,
    action: 'reschedule_appointment',
    entity: 'Appointment',
    entityId: result.appointmentId,
    patientId: existing.patientId,
    detail: { from: appointmentId, startsAt: result.startsAt.toISOString() },
  });

  revalidatePath('/schedule');
  revalidatePath(`/patients/${existing.patientId}`);
  return { booked: result.appointmentId };
}

const STAFF_TRANSITIONS: Record<string, AppointmentStatus> = {
  confirm: 'BOOKED',
  'check-in': 'CHECKED_IN',
  complete: 'COMPLETED',
  cancel: 'CANCELLED',
  'no-show': 'NO_SHOW',
};

/// One entry point for the day's status taps, so each one audits identically. Cancelling
/// and marking a no-show release the room; the appointment row itself is kept either way,
/// because attendance history is part of what the reporting has to explain.
export async function setAppointmentStatus(
  appointmentId: string,
  transition: keyof typeof STAFF_TRANSITIONS,
): Promise<AppointmentActionState> {
  const user = await requireUser();
  const status = STAFF_TRANSITIONS[transition];
  if (!status) return { error: 'Unknown change.' };

  const existing = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true, status: true },
  });
  if (!existing) return { error: 'That appointment no longer exists.' };

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status,
      checkedInAt: status === 'CHECKED_IN' ? new Date() : undefined,
      cancelledAt: status === 'CANCELLED' ? new Date() : undefined,
    },
  });

  await recordAudit({
    userId: user.id,
    action: 'appointment_status',
    entity: 'Appointment',
    entityId: appointmentId,
    patientId: existing.patientId,
    detail: { from: existing.status, to: status },
  });

  revalidatePath('/schedule');
  revalidatePath(`/patients/${existing.patientId}`);
  return {};
}
