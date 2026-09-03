import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { AppointmentActions } from '@/components/schedule/AppointmentActions';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { formatDate, patientName } from '@/lib/format';
import { activeRooms } from '@/lib/scheduling/availability';
import { addMinutes, dayStart, minutesIntoDay, occupancy, toIsoDate } from '@/lib/scheduling/slots';

export const dynamic = 'force-dynamic';

const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'border-amber-300 bg-amber-50 text-amber-900',
  BOOKED: 'border-clay-300 bg-white text-clay-900',
  CHECKED_IN: 'border-moss-400 bg-moss-50 text-moss-900',
  COMPLETED: 'border-clay-200 bg-clay-100 text-clay-600',
  CANCELLED: 'border-clay-200 bg-clay-50 text-clay-400 line-through',
  NO_SHOW: 'border-red-200 bg-red-50 text-red-700',
};

/// The day, room by room. A date in the query string is not patient data, so unlike search
/// this can be a link the front desk bookmarks.
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const user = await requireUser();
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '')
    ? searchParams.date!
    : toIsoDate(new Date());

  const from = dayStart(isoDate);
  const to = addMinutes(from, 24 * 60);

  const [rooms, appointments, requests] = await Promise.all([
    activeRooms(),
    prisma.appointment.findMany({
      where: { startsAt: { gte: from, lt: to } },
      orderBy: { startsAt: 'asc' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, selfRegisteredAt: true } },
        practitioner: { select: { name: true } },
        service: { select: { name: true, minutes: true } },
        room: { select: { name: true } },
      },
    }),
    prisma.appointment.count({ where: { status: 'REQUESTED', startsAt: { gte: new Date() } } }),
  ]);

  await recordAudit({
    userId: user.id,
    action: 'view_schedule',
    entity: 'Appointment',
    detail: { date: isoDate, appointments: appointments.length },
  });

  const live = appointments.filter((appointment) => appointment.status !== 'CANCELLED');
  const bookedMinutes = live.reduce((total, appointment) => total + appointment.service.minutes, 0);
  const openMinutes = 8 * 60;

  const previous = toIsoDate(addMinutes(from, -24 * 60));
  const next = toIsoDate(to);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{formatDate(from)}</h1>
          <p className="mt-1 text-sm text-clay-600">
            {live.length} appointment{live.length === 1 ? '' : 's'} ·{' '}
            {occupancy(bookedMinutes, openMinutes, rooms.length)}% of room time ·{' '}
            {rooms.length} rooms
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/schedule?date=${previous}`} className="btn-secondary">
            ← Previous
          </Link>
          <Link href="/schedule" className="btn-ghost">
            Today
          </Link>
          <Link href={`/schedule?date=${next}`} className="btn-secondary">
            Next →
          </Link>
        </div>
      </div>

      {requests > 0 ? (
        <p className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {requests} website request{requests === 1 ? '' : 's'} waiting to be confirmed.
        </p>
      ) : null}

      {appointments.length === 0 ? (
        <p className="card text-sm text-clay-600">Nothing booked. Book from a patient’s chart.</p>
      ) : (
        <div className="space-y-3">
          {appointments.map((appointment) => (
            <div
              key={appointment.id}
              className={`card flex flex-wrap items-center justify-between gap-4 border ${
                STATUS_STYLES[appointment.status] ?? ''
              }`}
            >
              <div className="min-w-48">
                <p className="text-lg font-medium">
                  {TIME.format(appointment.startsAt)} – {TIME.format(appointment.endsAt)}
                </p>
                <p className="text-xs uppercase tracking-wide text-clay-500">
                  {appointment.room?.name ?? 'Room to assign'} · {appointment.service.name}
                </p>
              </div>
              <div className="min-w-48">
                <Link href={`/patients/${appointment.patient.id}`} className="font-medium hover:underline">
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
                <AppointmentActions appointmentId={appointment.id} status={appointment.status} />
              </div>
            </div>
          ))}
        </div>
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
                const inRoom = live.filter((appointment) => appointment.roomId === room.id);
                return (
                  <tr key={room.id}>
                    <td className="px-4 py-2 font-medium">{room.name}</td>
                    <td className="px-4 py-2 text-clay-600">
                      {inRoom.length === 0
                        ? '—'
                        : inRoom
                            .map(
                              (appointment) =>
                                `${TIME.format(appointment.startsAt)} (${minutesIntoDay(appointment.endsAt) - minutesIntoDay(appointment.startsAt)}m)`,
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
