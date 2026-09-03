import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { StaffBooking } from '@/components/schedule/StaffBooking';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { patientName } from '@/lib/format';
import { bookableAppointmentTypes, bookablePractitioners } from '@/lib/scheduling/availability';
import { schedulingSettings } from '@/lib/scheduling/policy';

export const dynamic = 'force-dynamic';

export default async function BookForPatientPage({ params }: { params: { id: string } }) {
  await requireUser();

  const [patient, appointmentTypes, practitioners, settings] = await Promise.all([
    prisma.patient.findUnique({
      where: { id: params.id },
      select: { id: true, firstName: true, lastName: true },
    }),
    bookableAppointmentTypes('staff'),
    bookablePractitioners(),
    schedulingSettings(),
  ]);
  if (!patient) notFound();

  return (
    <AppShell>
      <Link href={`/patients/${patient.id}`} className="text-sm text-clay-600 hover:underline">
        ← {patientName(patient)}
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold tracking-tight">Book an appointment</h1>

      {practitioners.length === 0 ? (
        <p className="card text-sm text-clay-600">
          No practitioner has working hours yet, so there is nothing to book. Add availability
          first.
        </p>
      ) : (
        <div className="card">
          <StaffBooking
            patientId={patient.id}
            appointmentTypes={appointmentTypes}
            practitioners={practitioners}
            horizonDays={settings.bookingHorizonDays}
          />
        </div>
      )}
    </AppShell>
  );
}
