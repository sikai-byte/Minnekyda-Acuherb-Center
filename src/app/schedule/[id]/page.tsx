import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { AppointmentEventType } from '@prisma/client';
import { AppShell } from '@/components/AppShell';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { formatDateTime, patientName } from '@/lib/format';
import { appointmentHistory } from '@/lib/scheduling/booking';
import { clinicDate, clinicIsoDate, clinicTime } from '@/lib/scheduling/time';

export const dynamic = 'force-dynamic';

const EVENT_LABELS: Record<AppointmentEventType, string> = {
  CREATED: 'Booked',
  CONFIRMED: 'Confirmed',
  RESCHEDULED: 'Moved',
  ROOM_CHANGED: 'Room changed',
  PRACTITIONER_CHANGED: 'Practitioner changed',
  CHECKED_IN: 'Checked in',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};

/// Who changed this appointment, when, and what changed. The rows are append-only: moving or
/// cancelling a visit adds to this list and never rewrites it. Rooms are resolved to names
/// here rather than stored in the event, so a renamed room does not rewrite history's meaning.
///
/// Scheduling staff only. It names a patient and lists their whole visit, so a patient account
/// is refused here even for its own appointment: the portal shows a patient their own booking
/// without also showing them who moved it and which room they were put in.
export default async function AppointmentHistoryPage({ params }: { params: { id: string } }) {
  const user = await requireRole(['ADMIN', 'PRACTITIONER', 'FRONT_DESK']);

  const [appointment, events, rooms] = await Promise.all([
    prisma.appointment.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        source: true,
        createdAt: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        practitioner: { select: { name: true } },
        appointmentType: { select: { name: true, minutes: true } },
        room: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    appointmentHistory(params.id),
    prisma.treatmentRoom.findMany({ select: { id: true, name: true } }),
  ]);
  if (!appointment) notFound();

  await recordAudit({
    userId: user.id,
    action: 'view_appointment_history',
    entity: 'Appointment',
    entityId: appointment.id,
    patientId: appointment.patient.id,
  });

  const roomName = (id: string | null) =>
    id ? rooms.find((room) => room.id === id)?.name ?? 'a removed room' : 'no room';

  return (
    <AppShell>
      <Link
        href={`/schedule?date=${clinicIsoDate(appointment.startsAt)}`}
        className="text-sm text-clay-600 hover:underline"
      >
        ← Schedule
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold tracking-tight">
        {clinicDate(appointment.startsAt)} · {clinicTime(appointment.startsAt)} –{' '}
        {clinicTime(appointment.endsAt)}
      </h1>
      <p className="mb-6 text-sm text-clay-600">
        <Link href={`/patients/${appointment.patient.id}`} className="hover:underline">
          {patientName(appointment.patient)}
        </Link>{' '}
        · {appointment.appointmentType.name} · {appointment.practitioner.name} ·{' '}
        {appointment.room?.name ?? 'room to assign'} ·{' '}
        {appointment.status.replace('_', ' ').toLowerCase()}
      </p>

      <div className="card p-0">
        <ul className="divide-y divide-clay-100">
          {events.map((event) => (
            <li key={event.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{EVENT_LABELS[event.type]}</span>
                <span className="text-xs text-clay-500">{formatDateTime(event.createdAt)}</span>
              </div>
              <p className="mt-1 text-xs text-clay-600">
                {event.actor?.name ?? 'Patient or website'}
                {event.actorRole ? ` · ${event.actorRole.replace('_', ' ').toLowerCase()}` : ''}
                {event.source ? ` · ${event.source.toLowerCase()}` : ''}
              </p>
              {event.fromStartsAt && event.toStartsAt ? (
                <p className="mt-1 text-xs text-clay-600">
                  {clinicDate(event.fromStartsAt)} {clinicTime(event.fromStartsAt)} →{' '}
                  {clinicDate(event.toStartsAt)} {clinicTime(event.toStartsAt)}
                </p>
              ) : null}
              {event.type === 'ROOM_CHANGED' ? (
                <p className="mt-1 text-xs text-clay-600">
                  {roomName(event.fromRoomId)} → {roomName(event.toRoomId)}
                </p>
              ) : null}
              {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus ? (
                <p className="mt-1 text-xs text-clay-600">
                  {event.fromStatus.replace('_', ' ').toLowerCase()} →{' '}
                  {event.toStatus.replace('_', ' ').toLowerCase()}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
