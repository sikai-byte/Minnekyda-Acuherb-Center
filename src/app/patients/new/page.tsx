import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { PatientForm } from '@/components/PatientForm';
import { createPatient } from '@/lib/actions/patients';
import { requireUser } from '@/lib/auth';

export default async function NewPatientPage() {
  await requireUser();

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/patients" className="text-sm text-clay-600 hover:underline">
          ← Patients
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New patient</h1>
        <p className="mt-1 text-sm text-clay-600">
          Only a name is required — the rest can come from the patient&apos;s intake form.
        </p>
      </div>
      <PatientForm action={createPatient} submitLabel="Create patient" />
    </AppShell>
  );
}
