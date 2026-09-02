import { AppShell } from '@/components/AppShell';
import { PatientSearch } from '@/components/PatientSearch';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function KioskPage() {
  await requireUser();

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Hand the iPad to a patient</h1>
      <p className="mt-1 text-sm text-clay-600">
        Find the patient, then start their intake. Starting it signs you out <em>on this device</em> and
        locks it to that one form, so nothing else in the chart is reachable while the patient holds it.
        Sign back in when they hand it back.
      </p>

      <div className="mt-6">
        <PatientSearch mode="kiosk" placeholder="Search patient name or phone" autoFocus />
      </div>
    </AppShell>
  );
}
