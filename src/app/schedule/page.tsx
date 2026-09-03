import Link from 'next/link';
import type { AppointmentStatus } from '@prisma/client';
import { AppShell } from '@/components/AppShell';
import { AppointmentActions } from '@/components/schedule/AppointmentActions';
import { prisma } from '@/lib/db';
import { canViewClinicalNotes, requireUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { patientName } from '@/lib/format';
import {
  activeRooms,
  appointmentsOn,
  openMinutesOn,
  type DayAppointment,
} from '@/lib/scheduling/availability';
import { occupancy } from '@/lib/scheduling/slots';
import { addDays, clinicIsoDate, clinicTime, isIsoDate } from '@/lib/scheduling/time';

export const dynamic = 'force-dynamic';

const LONG_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  REQUESTED: 'border-amber-300 bg-amber-50',
  SCHEDULED: 'border-clay-300 bg-white',
  CHECKED_IN: 'border-moss-400 bg-moss-50',
  COMPLETED: 'border-clay-200 bg-clay-100',
  CANCELLED: 'border-clay-200 bg-clay-50 opacity-60',
  NO_SHOW: 'border-red-200 bg-red-50',
};

type View = 'clinic' | 'practitioner';

/// The day the front desk works from. A date in the query string is not patient data, so
/// unlike patient search this can be a link the front desk bookmarks — and the two views are
/// the same authorized query grouped differently, not two different sets of rules.
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { date?: string; view?: string };
}) {
  const user = await requireUser();
  const isoDate = isIsoDate(searchParams.date ?? '') ? searchParams.date! : clinicIsoDate(new Date());
  const view: View = searchParams.view === 'practitioner' ? 'practitioner' : 'clinic';

  const [rooms, appointments, openMinutes, requests] = await Promise.all([
    activeRooms(),
    appointmentsOn(isoDate),
    openMinutesOn(isoDate),
    prisma.appointment.count({ where: { status: 'REQUESTED', startsAt: { gte: new Date() } } }),
  ]);

  await recordAudit({
    userId: user.id,
    action: 'view_schedule',
    entity: 'Appointment',
    detail: { date: isoDate, appointments: appointments.length },
  });

  const live = appointments.filter(
    (appointment) => appointment.status !== 'CANCELLED' && appointment.status !== 'NO_SHOW',
  );
  const bookedMinutes = live.reduce(
    (total, appointment) => total + appointment.appointmentType.minutes,
    0,
  );

  const byPractitioner = groupBy(appointments, (appointment) => appointment.practitioner.name);
  const byRoom = groupBy(appointments, (appointment) => appointment.room?.name ?? 'Room to assign');

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {LONG_DATE.format(new Date(`${isoDate}T12:00:00.000Z`))}
          </h1>
          <p className="mt-1 text-sm text-clay-600">
            {live.length} appointment{live.length === 1 ? '' : 's'} ·{' '}
            {occupancy(bookedMinutes, openMinutes, rooms.length)}% of room time · {rooms.length}{' '}
            rooms
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/schedule?date=${addDays(isoDate, -1)}&view=${view}`} className="btn-secondary">
            ← Previous
          </Link>
          <Link href={`/schedule?view=${view}`} className="btn-ghost">
            Today
          </Link>
          <Link href={`/schedule?date=${addDays(isoDate, 1)}&view=${view}`} className="btn-secondary">
            Next →
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={`/schedule?date=${isoDate}&view=clinic`}
          className={view === 'clinic' ? 'btn-secondary' : 'btn-ghost'}
        >
          Whole clinic
        </Link>
        <Link
          href={`/schedule?date=${isoDate}&view=practitioner`}
          className={view === 'practitioner' ? 'btn-secondary' : 'btn-ghost'}
        >
          By practitioner
        </Link>
      </div>

      {requests > 0 ? (
        <p className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {requests} website request{requests === 1 ? '' : 's'} waiting to be confirmed.
        </p>
      ) : null}

      {appointments.length === 0 ? (
        <p className="card text-sm text-clay-600">Nothing booked. Book from a patient’s chart.</p>
      ) : view === 'practitioner' ? (
        <div className="space-y-8">
          {byPractitioner.map(([name, rows]) => (
            <section key={name}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-clay-500">
                {name} · {rows.length}
              </h2>
              <Rows rows={rows} rooms={rooms} clinical={canViewClinicalNotes(user)} isoDate={isoDate} />
            </section>
          ))}
        </div>
      ) : (
        <Rows rows={appointments} rooms={rooms} clinical={canViewClinicalNotes(user)} isoDate={isoDate} />
      )}

      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-clay-600">Rooms in use through the day</summary>
        <div className="card mt-3 overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-clay-200 text-left text-xs uppercase tracking-wide text-clay-500">
              <tr>
                <th className="px-4 py-2">Room</th>
                <th className="px-4 py-2">Booked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-clay-100">
              {rooms.map((room) => {
                const inRoom = byRoom.find(([name]) => name === room.name)?.[1] ?? [];
                const held = inRoom.filter(
                  (appointment) =>
                    appointment.status !== 'CANCELLED' && appointment.status !== 'NO_SHOW',
                );
                return (
                  <tr key={room.id}>
                    <td className="px-4 py-2 font-medium">{room.name}</td>
                    <td className="px-4 py-2 text-clay-600">
                      {held.length === 0
                        ? '—'
                        : held
                            .map(
                              (appointment) =>
                                `${clinicTime(appointment.startsAt)} (${appointment.appointmentType.minutes}m)`,
                            )
                            .join(' · ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </AppShell>
  );
}

function Rows({
  rows,
  rooms,
  clinical,
  isoDate,
}: {
  rows: DayAppointment[];
  rooms: { id: string; name: string }[];
  clinical: boolean;
  isoDate: string;
}) {
  const today = clinicIsoDate(new Date());

  return (
    <div className="space-y-3">
      {rows.map((appointment) => (
        <div
          key={appointment.id}
          className={`card flex flex-wrap items-center justify-between gap-4 border ${
            STATUS_STYLES[appointment.status]
          }`}
        >
          <div className="min-w-44">
            <p className="text-lg font-medium">
              {clinicTime(appointment.startsAt)} – {clinicTime(appointment.endsAt)}
            </p>
            <p className="text-xs uppercase tracking-wide text-clay-500">
              {appointment.room?.name ?? 'Room to assign'} · {appointment.appointmentType.name}
            </p>
          </div>
          <div className="min-w-48">
            <Link
              href={`/patients/${appointment.patient.id}`}
              className="font-medium hover:underline"
            >
              {patientName(appointment.patient)}
            </Link>
            <p className="text-xs text-clay-500">
              {appointment.practitioner.name}
              {appointment.source === 'PUBLIC' ? ' · booked on the website' : ''}
              {appointment.source === 'PORTAL' ? ' · booked in the portal' : ''}
            </p>
            {appointment.patient.selfRegisteredAt ? (
              <p className="text-xs text-amber-800">New — identity not yet verified</p>
            ) : null}
          </div>
          <div className="ml-auto flex flex-col items-end gap-2">
            <span className="badge bg-clay-100 text-clay-700">
              {appointment.status.replace('_', ' ').toLowerCase()}
            </span>
            <div className="flex flex-wrap justify-end gap-2">
              <Link href={`/patients/${appointment.patient.id}`} className="btn-ghost">
                Chart
              </Link>
              {clinical && isoDate === today ? (
                <Link
                  href={`/patients/${appointment.patient.id}/notes/new?appointmentId=${appointment.id}`}
                  className="btn-secondary"
                >
                  Start visit note
                </Link>
              ) : null}
              <Link href={`/schedule/${appointment.id}`} className="btn-ghost">
                History
              </Link>
            </div>
            <AppointmentActions
              appointmentId={appointment.id}
              status={appointment.status}
              appointmentTypeId={appointment.appointmentType.id}
              practitionerId={appointment.practitioner.id}
              roomId={appointment.roomId}
              startsAt={appointment.startsAt.toISOString()}
              rooms={rooms}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function groupBy(
  rows: DayAppointment[],
  key: (row: DayAppointment) => string,
): [string, DayAppointment[]][] {
  const groups = new Map<string, DayAppointment[]>();
  for (const row of rows) {
    const name = key(row);
    const existing = groups.get(name);
    if (existing) existing.push(row);
    else groups.set(name, [row]);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}
