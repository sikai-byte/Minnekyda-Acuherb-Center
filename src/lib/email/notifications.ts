import { prisma } from '@/lib/db';
import { baseUrl, CLINIC_NAME, mailConfig } from './config';
import { sendEmail, type SendOutcome } from './send';
import {
  appointmentBooked,
  appointmentCancelled,
  appointmentConfirmed,
  appointmentReminder,
  appointmentRequested,
  appointmentRescheduled,
  formatWhen,
  portalInvite,
  staffInvite,
  type Logistics,
} from './templates';

/// Turns an appointment id into an email. Callers pass an id and a kind and get nothing back
/// they have to handle: notifications are a courtesy on top of a change that has already been
/// committed, and none of them can fail a booking.

export type AppointmentNotification =
  | 'APPOINTMENT_BOOKED'
  | 'APPOINTMENT_REQUESTED'
  | 'APPOINTMENT_CONFIRMED'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENT_REMINDER';

/// Only what an email needs. Notably not the appointment type, the room, or anything on the
/// chart beyond a first name and an address.
async function logisticsFor(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      startsAt: true,
      patientId: true,
      patient: { select: { firstName: true, email: true } },
      practitioner: { select: { name: true } },
    },
  });
  if (!appointment) return null;
  const email = appointment.patient.email?.trim();
  if (!email) return null;

  const config = mailConfig();
  const logistics: Logistics = {
    firstName: appointment.patient.firstName,
    when: formatWhen(appointment.startsAt),
    practitionerName: appointment.practitioner.name,
    clinicName: CLINIC_NAME,
    clinicPhone: config?.clinicPhone ?? null,
    portalUrl: `${baseUrl()}/portal/appointments`,
  };
  return { email, patientId: appointment.patientId, logistics };
}

const TEMPLATES: Record<AppointmentNotification, (logistics: Logistics) => { subject: string; body: string }> = {
  APPOINTMENT_BOOKED: appointmentBooked,
  APPOINTMENT_REQUESTED: appointmentRequested,
  APPOINTMENT_CONFIRMED: appointmentConfirmed,
  APPOINTMENT_CANCELLED: appointmentCancelled,
  APPOINTMENT_REMINDER: appointmentReminder,
};

export async function notifyAppointment(
  appointmentId: string,
  kind: AppointmentNotification,
): Promise<SendOutcome> {
  try {
    const target = await logisticsFor(appointmentId);
    /// A chart with no email address is normal — plenty of patients are booked over the phone
    /// by somebody who never gave one.
    if (!target) return { status: 'SKIPPED' };

    const rendered = TEMPLATES[kind](target.logistics);
    return await sendEmail({
      to: target.email,
      subject: rendered.subject,
      body: rendered.body,
      kind,
      patientId: target.patientId,
      appointmentId,
    });
  } catch (error) {
    console.error('appointment notification failed', {
      kind,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { status: 'FAILED' };
  }
}

/// A move needs the time it moved from, which the appointment row no longer holds by the time
/// this runs, so the caller supplies it.
export async function notifyRescheduled(
  appointmentId: string,
  previousStartsAt: Date,
): Promise<SendOutcome> {
  try {
    const target = await logisticsFor(appointmentId);
    if (!target) return { status: 'SKIPPED' };

    const rendered = appointmentRescheduled({
      ...target.logistics,
      previously: formatWhen(previousStartsAt),
    });
    return await sendEmail({
      to: target.email,
      subject: rendered.subject,
      body: rendered.body,
      kind: 'APPOINTMENT_RESCHEDULED',
      patientId: target.patientId,
      appointmentId,
    });
  } catch (error) {
    console.error('appointment notification failed', {
      kind: 'APPOINTMENT_RESCHEDULED',
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { status: 'FAILED' };
  }
}

export async function notifyPortalInvite(input: {
  patientId: string;
  firstName: string;
  email: string;
  temporaryPassword: string;
}): Promise<SendOutcome> {
  const config = mailConfig();
  const rendered = portalInvite({
    firstName: input.firstName,
    email: input.email,
    temporaryPassword: input.temporaryPassword,
    clinicName: CLINIC_NAME,
    clinicPhone: config?.clinicPhone ?? null,
    loginUrl: `${baseUrl()}/login`,
  });
  return sendEmail({
    to: input.email,
    subject: rendered.subject,
    body: rendered.body,
    kind: 'PORTAL_INVITE',
    patientId: input.patientId,
  });
}

export async function notifyStaffInvite(input: {
  name: string;
  email: string;
  temporaryPassword: string;
}): Promise<SendOutcome> {
  const rendered = staffInvite({
    name: input.name,
    email: input.email,
    temporaryPassword: input.temporaryPassword,
    clinicName: CLINIC_NAME,
    loginUrl: `${baseUrl()}/login`,
  });
  return sendEmail({
    to: input.email,
    subject: rendered.subject,
    body: rendered.body,
    kind: 'STAFF_INVITE',
  });
}
