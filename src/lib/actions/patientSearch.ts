'use server';

import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export type PatientSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  phone: string | null;
  intakes: number;
  notes: number;
};

/// Searching by name used to be a GET with the name in the query string, which put patient
/// names into every access log between the browser and us. The term is posted instead and
/// never reaches a URL.
export async function searchPatients(query: string): Promise<PatientSearchResult[]> {
  const user = await requireUser();
  const term = query.trim();
  if (!term) return [];

  const patients = await prisma.patient.findMany({
    where: {
      archivedAt: null,
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
        { email: { contains: term, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 25,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      phone: true,
      _count: { select: { intakes: true, notes: true } },
    },
  });

  await recordAudit({
    userId: user.id,
    action: 'search_patients',
    entity: 'Patient',
    detail: { matches: patients.length },
  });

  return patients.map(({ _count, ...patient }) => ({
    ...patient,
    intakes: _count.intakes,
    notes: _count.notes,
  }));
}
