import { BrandLockup } from '@/components/Brand';
import { exitKiosk } from '@/lib/actions/intake';

/// Shown on the patient-held iPad once the intake is in. "Done" ends kiosk mode, so the
/// device is back at the sign-in screen rather than inside the chart system.
export function KioskDone() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card mx-auto flex max-w-lg flex-col items-center text-center">
        <BrandLockup width={200} className="mb-6" />
        <h1 className="text-2xl font-semibold">Thank you</h1>
        <p className="mt-2 text-clay-600">
          Your intake form has been submitted. Please hand the iPad back to the front desk.
        </p>
        <form action={exitKiosk} className="mt-6">
          <button type="submit" className="btn-primary">
            Done
          </button>
        </form>
      </div>
    </div>
  );
}
