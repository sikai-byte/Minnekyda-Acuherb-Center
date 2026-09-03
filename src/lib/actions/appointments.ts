'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { getAvailableSlots } from '@/lib/scheduling/availability';
import {
  applyLifecycle,
  bookAppointment,
  changeRoom,
  rescheduleAppointment as moveAppointment,
  type Actor,
  type LifecycleAction,
} from '@/lib/scheduling/booking';
import type { SessionUser } from '@/lib/session';

/// The front desk's side of the calendar. Every one of these names a patient, so every one
/// needs a staff session and an audit row; none of them accepts or stores a reason for the
/// visit, because the calendar carries no health information.
///
/// Scheduling is front-desk work, so all three staff roles may do it. A PATIENT session never
/// reaches here: `requireRole` sends it back to its own portal, which is what stops a patient
/// naming somebody else's chart in a booking form.
const SCHEDULING_ROLES = ['ADMIN', 'PRACTITIONER', 'FRONT_DESK'] as const;

const bookingSchema = z.object({
  patientId: z.string().min(1),
  practitionerId: z.string().min(1),
  appointmentTypeId: z.string().min(1),
  /// The exact slot the browser was shown, as an ISO instant. Duration is never accepted from
  /// the client: it comes from the appointment type, server-side.
  startsAt: z.string().datetime(),
});

export type AppointmentActionState = { error?: string; booked?: string; done?: boolean };

function staffActor(user: SessionUser): Actor {
  return { id: user.id, role: user.role, source: 'STAFF' };
}

export async function staffOpenSlots(
  practitionerId: string,
  appointmentTypeId: string,
  date: string,
): Promise<string[]> {
  await requireRole([...SCHEDULING_ROLES]);
  const slots = await getAvailableSlots({
    practitionerId: practitionerId || null,
    appointmentTypeId,
    date,
  });
  return slots.map((slot) => slot.startsAt.toISOString());
}

export async function bookForPatient(formData: FormData): Promise<AppointmentActionState> {
  const user = await requireRole([...SCHEDULING_ROLES]);
  const parsed = bookingSchema.safeParse({
    patientId: formData.get('patientId') ?? '',
    practitionerId: formData.get('practitionerId') ?? '',
    appointmentTypeId: formData.get('appointmentTypeId') ?? '',
    startsAt: formData.get('startsAt') ?? '',
  });
  if (!parsed.success) return { error: 'Choose a practitioner, a visit type and a time.' };

  const result = await bookAppointment({
    patientId: parsed.data.patientId,
    practitionerId: parsed.data.practitionerId,
    appointmentTypeId: parsed.data.appointmentTypeId,
    startsAt: new Date(parsed.data.startsAt),
    actor: staffActor(user),
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
  const user = await requireRole([...SCHEDULING_ROLES]);
  if (Number.isNaN(Date.parse(startsAtIso))) return { error: 'Pick a time.' };

  const result = await moveAppointment({
    appointmentId,
    startsAt: new Date(startsAtIso),
    actor: staffActor(user),
  });
  if (!result.ok) return { error: result.reason };

  await recordAudit({
    userId: user.id,
    action: 'reschedule_appointment',
    entity: 'Appointment',
    entityId: result.appointmentId,
    detail: { startsAt: result.startsAt.toISOString() },
  });

  revalidatePath('/schedule');
  return { booked: result.appointmentId };
}

export async function moveAppointmentRoom(
  appointmentId: string,
  roomId: string,
): Promise<AppointmentActionState> {
  const user = await requireRole([...SCHEDULING_ROLES]);
  const result = await changeRoom(appointmentId, roomId, staffActor(user));
  if (!result.ok) return { error: result.reason };

  await recordAudit({
    userId: user.id,
    action: 'appointment_room',
    entity: 'Appointment',
    entityId: appointmentId,
    detail: { roomId: result.roomId },
  });

  revalidatePath('/schedule');
  return { done: true };
}

const LIFECYCLE_ACTIONS: LifecycleAction[] = [
  'confirm',
  'check-in',
  'complete',
  'cancel',
  'no-show',
];

/// One entry point for the day's status taps, so each one audits identically. Cancelling and
/// marking a no-show release the room immediately; the appointment row itself is kept either
/// way, because attendance history is part of what the reporting has to explain.
export async function setAppointmentStatus(
  appointmentId: string,
  action: LifecycleAction,
): Promise<AppointmentActionState> {
  const user = await requireRole([...SCHEDULING_ROLES]);
  if (!LIFECYCLE_ACTIONS.includes(action)) return { error: 'Unknown change.' };

  const result = await applyLifecycle(appointmentId, action, staffActor(user));
  if (!result.ok) return { error: result.reason };

  await recordAudit({
    userId: user.id,
    action: 'appointment_status',
    entity: 'Appointment',
    entityId: appointmentId,
    patientId: result.patientId,
    detail: { to: result.status },
  });

  revalidatePath('/schedule');
  revalidatePath(`/patients/${result.patientId}`);
  return { done: true };
}
