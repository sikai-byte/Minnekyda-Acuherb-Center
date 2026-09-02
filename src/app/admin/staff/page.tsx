import { AppShell } from '@/components/AppShell';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { NewStaffForm } from './NewStaffForm';
import { StaffTable } from './StaffTable';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const admin = await requireRole(['ADMIN']);

  /// Patient portal logins are issued from the patient's own chart and are bound to that
  /// record, so they are deliberately absent here.
  const staff = await prisma.user.findMany({
    where: { role: { not: 'PATIENT' } },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      credentials: true,
      active: true,
      lastLoginAt: true,
      mfaEnabledAt: true,
      mustChangePassword: true,
    },
  });

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Staff access</h1>
      <p className="mt-1 text-sm text-clay-600">
        Everyone who can sign in to the clinic side. Turning access off keeps the person&apos;s
        notes and audit history intact — accounts are never deleted.
      </p>

      <div className="mt-6">
        <NewStaffForm />
      </div>

      <div className="mt-6">
        <StaffTable staff={staff} currentUserId={admin.id} />
      </div>
    </AppShell>
  );
}
