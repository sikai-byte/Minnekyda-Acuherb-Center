import Link from 'next/link';
import { PublicBooking } from '@/components/schedule/PublicBooking';
import { bookableAppointmentTypes, bookablePractitioners } from '@/lib/scheduling/availability';
import { schedulingSettings } from '@/lib/scheduling/policy';

export const dynamic = 'force-dynamic';

/// The public booking site. Deliberately reachable with no session: it is the front door for
/// someone who has never been to the clinic. It shows open times and takes contact details,
/// and it reads no charts, so it can neither confirm nor deny that anyone is a patient here.
export default async function PublicBookingPage() {
  const [appointmentTypes, practitioners, settings] = await Promise.all([
    bookableAppointmentTypes('public'),
    bookablePractitioners(),
    schedulingSettings(),
  ]);

  const open = appointmentTypes.length > 0 && practitioners.length > 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-clay-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-lg font-semibold tracking-tight text-clay-900">
            Minnekyda <span className="text-moss-600">Acuherb</span>
          </span>
          <Link href="/login" className="btn-ghost text-sm">
            Already a patient? Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Book your first visit</h1>
        <p className="mt-2 max-w-prose text-sm text-clay-600">
          {settings.publicRequestsAutoConfirm
            ? 'Choose a time that suits you and it is yours — we will email you the details.'
            : 'Choose a time that suits you and we will hold it while we call to confirm.'}{' '}
          Please do not send medical details through this form — you will fill in your health
          history privately on an iPad when you arrive.
        </p>

        {open ? (
          <div className="card mt-8">
            <PublicBooking
              appointmentTypes={appointmentTypes}
              practitioners={practitioners}
              horizonDays={settings.bookingHorizonDays}
              autoConfirm={settings.publicRequestsAutoConfirm}
            />
          </div>
        ) : (
          <p className="card mt-8 text-sm text-clay-600">
            Online booking is closed at the moment. Please call the clinic and we will find you a
            time.
          </p>
        )}
      </main>
    </div>
  );
}
