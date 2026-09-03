import { PortalShell } from '@/components/portal/PortalShell';
import {
  PastAppointments,
  PortalBooking,
  UpcomingAppointments,
} from '@/components/portal/PortalBooking';
import { prisma } from '@/lib/db';
import { requirePatient } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { bookableAppointmentTypes, bookablePractitioners } from '@/lib/scheduling/availability';
import { schedulingSettings } from '@/lib/scheduling/policy';

export const dynamic = 'force-dynamic';

/// A patient's own appointments. Scheduling logistics only — the visit type is the room time
/// they booked, not a diagnosis — and every query here is pinned to the session's patient id.
export default async function PortalAppointmentsPage() {
  const { user, patientId } = await requirePatient();

  const [patient, upcoming, past, appointmentTypes, practitioners, settings] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true } }),
    prisma.appointment.findMany({
      where: {
        patientId,
        status: { in: ['REQUESTED', 'SCHEDULED', 'CHECKED_IN'] },
        startsAt: { gt: new Date() },
      },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        startsAt: true,
        status: true,
        appointmentType: { select: { id: true, name: true, minutes: true } },
        practitioner: { select: { id: true, name: true, credentials: true } },
      },
    }),
    prisma.appointment.findMany({
      where: { patientId, startsAt: { lte: new Date() } },
      orderBy: { startsAt: 'desc' },
      take: 10,
      select: {
        id: true,
        startsAt: true,
        status: true,
        appointmentType: { select: { id: true, name: true, minutes: true } },
        practitioner: { select: { id: true, name: true } },
      },
    }),
    bookableAppointmentTypes('portal'),
    bookablePractitioners(),
    schedulingSettings(),
  ]);
  if (!patient) return null;

  await recordAudit({
    userId: user.id,
    action: 'portal_view_appointments',
    entity: 'Appointment',
    patientId,
  });

  const canBook =
    upcoming.length === 0 && appointmentTypes.length > 0 && practitioners.length > 0;

  return (
    <PortalShell name={patient.firstName}>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">My appointments</h1>
        <p className="mt-1 text-sm text-clay-600">
          Book, move or cancel a visit. Changes inside {settings.selfRescheduleNoticeHours} hours
          and cancellations inside {settings.selfCancelNoticeHours} hours need a phone call.
        </p>
      </header>

      <div className="space-y-6">
        <section className="card">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay-500">Coming up</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-clay-600">Nothing booked.</p>
          ) : (
            <UpcomingAppointments
              appointments={upcoming}
              rescheduleNoticeHours={settings.selfRescheduleNoticeHours}
              horizonDays={settings.bookingHorizonDays}
            />
          )}
        </section>

        <section className="card">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay-500">
            Book a visit
          </h2>
          {canBook ? (
            <PortalBooking
              appointmentTypes={appointmentTypes}
              practitioners={practitioners}
              horizonDays={settings.bookingHorizonDays}
            />
          ) : (
            <p className="text-sm text-clay-600">
              {upcoming.length > 0
                ? 'You already have a visit booked. Call the clinic if you need another.'
                : 'Online booking is not open at the moment. Please call the clinic.'}
            </p>
          )}
        </section>

        {past.length > 0 ? (
          <section className="card">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay-500">Earlier</h2>
            <PastAppointments appointments={past} />
          </section>
        ) : null}
      </div>
    </PortalShell>
  );
}
