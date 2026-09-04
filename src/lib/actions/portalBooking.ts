'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePatient } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { notifyAppointment, notifyRescheduled } from '@/lib/email/notifications';
import { distinctStarts, getAvailableSlots, getOpenDays } from '@/lib/scheduling/availability';
import { applyLifecycle, bookAppointment, rescheduleAppointment } from '@/lib/scheduling/booking';
import { schedulingSettings } from '@/lib/scheduling/policy';
import { clinicIsoDate } from '@/lib/scheduling/time';

/// A patient booking for themselves. The patient id comes from the session — as everywhere in
/// the portal — so there is no id in any of these signatures for a patient to swap.

const requestSchema = z.object({
  /// Empty means "any practitioner", which is how most patients think about it.
  practitionerId: z.string(),
  appointmentTypeId: z.string().min(1),
  startsAt: z.string().datetime(),
});

const rescheduleSchema = z.object({
  appointmentId: z.string().min(1),
  startsAt: z.string().datetime(),
});

export type PortalBookingState = { error?: string; confirmed?: string };

export async function portalOpenSlots(
  practitionerId: string,
  appointmentTypeId: string,
  date: string,
): Promise<string[]> {
  await requirePatient();
  const settings = await schedulingSettings();
  const slots = await getAvailableSlots({
    practitionerId: practitionerId || null,
    appointmentTypeId,
    date,
    minNoticeMinutes: settings.selfBookingNoticeMinutes,
  });
  /// Times only, one entry per start. Who else is booked, in which room, and with which
  /// practitioner a time happens to be free is none of a patient's business — and the count of
  /// rooms left at 3pm would be a fact about other patients.
  return distinctStarts(slots).map((slot) => slot.startsAt.toISOString());
}

/// Which days the portal calendar may offer. A day is either bookable or it is not; the
/// patient is never told how much of it is taken.
export async function portalOpenDays(
  practitionerId: string,
  appointmentTypeId: string,
  from: string,
  to: string,
): Promise<string[]> {
  await requirePatient();
  const settings = await schedulingSettings();
  return getOpenDays({
    practitionerId: practitionerId || null,
    appointmentTypeId,
    from,
    to,
    minNoticeMinutes: settings.selfBookingNoticeMinutes,
  });
}

export async function portalBook(formData: FormData): Promise<PortalBookingState> {
  const { user, patientId } = await requirePatient();
  const parsed = requestSchema.safeParse({
    practitionerId: formData.get('practitionerId') ?? '',
    appointmentTypeId: formData.get('appointmentTypeId') ?? '',
    startsAt: formData.get('startsAt') ?? '',
  });
  if (!parsed.success) return { error: 'Choose a visit type and a time.' };

  /// One future appointment at a time from the portal; anything more is a conversation with
  /// the front desk, and it stops the calendar being filled from one login.
  const upcoming = await prisma.appointment.count({
    where: { patientId, status: { in: ['REQUESTED', 'SCHEDULED'] }, startsAt: { gt: new Date() } },
  });
  if (upcoming > 0) {
    return { error: 'You already have an appointment booked. Call the clinic to add another.' };
  }

  const appointmentType = await prisma.appointmentType.findFirst({
    where: { id: parsed.data.appointmentTypeId, active: true, publiclyBookable: true },
    select: { id: true },
  });
  if (!appointmentType) return { error: 'That visit type has to be booked by phone.' };

  const settings = await schedulingSettings();
  const startsAt = new Date(parsed.data.startsAt);

  /// "Any practitioner" is resolved here rather than in the browser: the patient picked a
  /// time, and the clinic decides who is free for it.
  const practitionerId = parsed.data.practitionerId || (await anyPractitionerFor(
    appointmentType.id,
    startsAt,
    settings.selfBookingNoticeMinutes,
  ));
  if (!practitionerId) return { error: 'That time is no longer available. Pick another.' };

  const result = await bookAppointment({
    patientId,
    practitionerId,
    appointmentTypeId: appointmentType.id,
    startsAt,
    actor: { id: user.id, role: user.role, source: 'PORTAL' },
    minNoticeMinutes: settings.selfBookingNoticeMinutes,
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

  await notifyAppointment(result.appointmentId, 'APPOINTMENT_BOOKED');

  revalidatePath('/portal/appointments');
  revalidatePath('/schedule');
  return { confirmed: result.appointmentId };
}

async function anyPractitionerFor(
  appointmentTypeId: string,
  startsAt: Date,
  minNoticeMinutes: number,
): Promise<string | null> {
  const slots = await getAvailableSlots({
    practitionerId: null,
    appointmentTypeId,
    date: clinicIsoDate(startsAt),
    minNoticeMinutes,
  });
  return slots.find((slot) => slot.startsAt.getTime() === startsAt.getTime())?.practitionerId ?? null;
}

/// The open times a patient may move an existing visit to: same visit type, same practitioner,
/// and the visit's own slot ignored so it does not block itself. Scoped to the session's
/// patient, so an id from somebody else's record returns nothing rather than their calendar.
export async function portalRescheduleSlots(
  appointmentId: string,
  date: string,
): Promise<string[]> {
  const { patientId } = await requirePatient();
  const appointment = await movableAppointment(appointmentId, patientId);
  if (!appointment) return [];

  const settings = await schedulingSettings();
  const slots = await getAvailableSlots({
    practitionerId: appointment.practitionerId,
    appointmentTypeId: appointment.appointmentTypeId,
    date,
    minNoticeMinutes: settings.selfBookingNoticeMinutes,
    ignoreAppointmentId: appointment.id,
  });
  return distinctStarts(slots).map((slot) => slot.startsAt.toISOString());
}

export async function portalRescheduleOpenDays(
  appointmentId: string,
  from: string,
  to: string,
): Promise<string[]> {
  const { patientId } = await requirePatient();
  const appointment = await movableAppointment(appointmentId, patientId);
  if (!appointment) return [];

  const settings = await schedulingSettings();
  return getOpenDays({
    practitionerId: appointment.practitionerId,
    appointmentTypeId: appointment.appointmentTypeId,
    from,
    to,
    minNoticeMinutes: settings.selfBookingNoticeMinutes,
    /// Its own time does not make its own reschedule look full.
    ignoreAppointmentId: appointment.id,
  });
}

/// Moving a visit is the patient's to do up to the clinic's notice period — 48 hours — because
/// inside that window the room is effectively spoken for and the clinic wants to hear about it.
export async function portalReschedule(formData: FormData): Promise<PortalBookingState> {
  const { user, patientId } = await requirePatient();
  const parsed = rescheduleSchema.safeParse({
    appointmentId: formData.get('appointmentId') ?? '',
    startsAt: formData.get('startsAt') ?? '',
  });
  if (!parsed.success) return { error: 'Pick a new time.' };

  const settings = await schedulingSettings();
  const appointment = await movableAppointment(parsed.data.appointmentId, patientId);
  if (!appointment) return { error: 'That appointment is not on your record.' };

  if (withinNotice(appointment.startsAt, settings.selfRescheduleNoticeHours)) {
    return { error: callTheOffice(settings.selfRescheduleNoticeHours) };
  }

  const startsAt = new Date(parsed.data.startsAt);
  const result = await rescheduleAppointment({
    appointmentId: appointment.id,
    startsAt,
    actor: { id: user.id, role: user.role, source: 'PORTAL' },
    minNoticeMinutes: settings.selfBookingNoticeMinutes,
  });
  if (!result.ok) return { error: result.reason };

  await recordAudit({
    userId: user.id,
    action: 'reschedule_appointment',
    entity: 'Appointment',
    entityId: appointment.id,
    patientId,
    detail: { source: 'PORTAL', startsAt: result.startsAt.toISOString() },
  });

  /// The patient moved it themselves, so this is a receipt rather than news — and the one
  /// record they have of the old time and the new one.
  await notifyRescheduled(appointment.id, appointment.startsAt);

  revalidatePath('/portal/appointments');
  revalidatePath('/schedule');
  return { confirmed: appointment.id };
}

function callTheOffice(hours: number): string {
  return `Please call the clinic to change an appointment within ${hours} hours of its start.`;
}

function withinNotice(startsAt: Date, hours: number): boolean {
  return startsAt.getTime() - Date.now() < hours * 60 * 60 * 1000;
}

async function movableAppointment(appointmentId: string, patientId: string) {
  return prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      patientId,
      status: { in: ['REQUESTED', 'SCHEDULED'] },
      startsAt: { gt: new Date() },
    },
    select: { id: true, startsAt: true, practitionerId: true, appointmentTypeId: true },
  });
}

export async function portalCancel(appointmentId: string): Promise<PortalBookingState> {
  const { user, patientId } = await requirePatient();
  const settings = await schedulingSettings();

  /// Scoped by the session's patient id, so another patient's appointment id simply is not
  /// found rather than being cancelled.
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId, status: { in: ['REQUESTED', 'SCHEDULED'] } },
    select: { id: true, startsAt: true },
  });
  if (!appointment) return { error: 'That appointment is not on your record.' };

  const noticeMs = settings.selfCancelNoticeHours * 60 * 60 * 1000;
  if (appointment.startsAt.getTime() - Date.now() < noticeMs) {
    return {
      error: `Please call the clinic to cancel within ${settings.selfCancelNoticeHours} hours of your appointment.`,
    };
  }

  const result = await applyLifecycle(appointment.id, 'cancel', {
    id: user.id,
    role: user.role,
    source: 'PORTAL',
  });
  if (!result.ok) return { error: result.reason };

  await recordAudit({
    userId: user.id,
    action: 'cancel_appointment',
    entity: 'Appointment',
    entityId: appointment.id,
    patientId,
    detail: { source: 'PORTAL' },
  });

  await notifyAppointment(appointment.id, 'APPOINTMENT_CANCELLED');

  revalidatePath('/portal/appointments');
  revalidatePath('/schedule');
  return {};
}
