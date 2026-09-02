import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { age, formatDate, patientName } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const user = await requireUser();
  const query = searchParams.q?.trim() ?? '';

  const patients = await prisma.patient.findMany({
    where: {
      archivedAt: null,
      ...(query
        ? {
            OR: [
              { firstName: { contains: query, mode: 'insensitive' as const } },
              { lastName: { contains: query, mode: 'insensitive' as const } },
              { phone: { contains: query } },
              { email: { contains: query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 100,
    include: { _count: { select: { notes: true, intakes: true } } },
  });

  if (query) {
    await recordAudit({ userId: user.id, action: 'search_patients', entity: 'Patient', detail: { query } });
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
        <Link href="/patients/new" className="btn-primary">
          New patient
        </Link>
      </div>

      <form className="mb-6 flex gap-2" action="/patients">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by name, phone, or email"
          className="input max-w-sm"
        />
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      {patients.length === 0 ? (
        <p className="text-sm text-clay-600">
          {query ? `No patients match “${query}”.` : 'No patients yet — add your first one.'}
        </p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-clay-200 text-left text-xs uppercase tracking-wide text-clay-500">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Date of birth</th>
                <th className="px-5 py-3">Age</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Intakes</th>
                <th className="px-5 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-clay-100">
              {patients.map((patient) => (
                <tr key={patient.id} className="hover:bg-clay-50">
                  <td className="px-5 py-3">
                    <Link href={`/patients/${patient.id}`} className="font-medium hover:underline">
                      {patientName(patient)}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-clay-600">{formatDate(patient.dateOfBirth)}</td>
                  <td className="px-5 py-3 text-clay-600">{age(patient.dateOfBirth)}</td>
                  <td className="px-5 py-3 text-clay-600">{patient.phone ?? '—'}</td>
                  <td className="px-5 py-3 text-clay-600">{patient._count.intakes}</td>
                  <td className="px-5 py-3 text-clay-600">{patient._count.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
