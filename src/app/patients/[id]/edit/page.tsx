import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PatientForm } from '@/components/PatientForm';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { updatePatient } from '@/lib/actions/patients';
import { patientName } from '@/lib/format';

export default async function EditPatientPage({ params }: { params: { id: string } }) {
  await requireUser();
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) notFound();

  const action = updatePatient.bind(null, patient.id);

  return (
    <AppShell>
      <div className="mb-6">
        <Link href={`/patients/${patient.id}`} className="text-sm text-clay-600 hover:underline">
          ← {patientName(patient)}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit patient details</h1>
      </div>
      <PatientForm action={action} patient={patient} submitLabel="Save changes" />
    </AppShell>
  );
}
