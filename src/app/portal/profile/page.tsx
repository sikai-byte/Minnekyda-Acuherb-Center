import Link from 'next/link';
import { PortalShell } from '@/components/portal/PortalShell';
import { prisma } from '@/lib/db';
import { requirePatient } from '@/lib/auth';
import { formatDate, patientName } from '@/lib/format';
import { ContactForm } from './ContactForm';

export const dynamic = 'force-dynamic';

export default async function PortalProfilePage() {
  const { patientId } = await requirePatient();
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return null;

  return (
    <PortalShell name={patient.firstName}>
      <div className="no-print mb-6">
        <Link href="/portal" className="text-sm text-clay-600 hover:underline">
          ← My records
        </Link>
      </div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">My details</h1>
        <p className="mt-1 text-sm text-clay-600">
          {patientName(patient)} · born {formatDate(patient.dateOfBirth)}. Ask the front desk to
          change your name or date of birth.
        </p>
      </header>

      <ContactForm
        contact={{
          phone: patient.phone,
          email: patient.email,
          streetAddress: patient.streetAddress,
          city: patient.city,
          state: patient.state,
          zip: patient.zip,
          emergencyName: patient.emergencyName,
          emergencyPhone: patient.emergencyPhone,
        }}
      />
    </PortalShell>
  );
}
