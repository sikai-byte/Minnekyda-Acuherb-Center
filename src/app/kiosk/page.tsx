import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { StartIntakeButton } from '@/components/StartIntakeButton';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { age, formatDate, patientName } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function KioskPage({ searchParams }: { searchParams: { q?: string } }) {
  await requireUser();
  const query = searchParams.q?.trim() ?? '';

  const patients = query
    ? await prisma.patient.findMany({
        where: {
          archivedAt: null,
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
          ],
        },
        orderBy: [{ lastName: 'asc' }],
        take: 20,
      })
    : [];

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Hand the iPad to a patient</h1>
      <p className="mt-1 text-sm text-clay-600">
        Find the patient, start their intake, then hand over the iPad. The form locks itself on submit
        and returns here — no chart data is reachable from the intake screen.
      </p>

      <form className="mt-6 flex gap-2" action="/kiosk">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search patient name or phone"
          className="input max-w-sm"
          autoFocus
        />
        <button type="submit" className="btn-secondary">
          Search
        </button>
        <Link href="/patients/new" className="btn-ghost">
          New patient
        </Link>
      </form>

      <div className="mt-6 space-y-3">
        {query && patients.length === 0 ? (
          <p className="text-sm text-clay-600">
            No patients match “{query}”. <Link href="/patients/new" className="underline">Add them first</Link>.
          </p>
        ) : null}
        {patients.map((patient) => (
          <div key={patient.id} className="card flex items-center justify-between">
            <div>
              <p className="text-lg font-medium">{patientName(patient)}</p>
              <p className="text-sm text-clay-600">
                {formatDate(patient.dateOfBirth)} · age {age(patient.dateOfBirth)}
              </p>
            </div>
            <StartIntakeButton patientId={patient.id} />
          </div>
        ))}
      </div>
    </AppShell>
  );
}
