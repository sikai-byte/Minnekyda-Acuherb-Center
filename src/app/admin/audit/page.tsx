import { AppShell } from '@/components/AppShell';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  await requireRole(['ADMIN']);

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: true },
  });

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-1 text-sm text-clay-600">
        Every access to patient data, most recent first. Showing the latest 200 events.
      </p>

      <div className="card mt-6 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-clay-200 text-left text-xs uppercase tracking-wide text-clay-500">
            <tr>
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Entity</th>
              <th className="px-5 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-clay-100">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap px-5 py-2.5 text-clay-600">
                  {formatDateTime(log.createdAt)}
                </td>
                <td className="px-5 py-2.5">{log.user?.name ?? '—'}</td>
                <td className="px-5 py-2.5 font-medium">{log.action}</td>
                <td className="px-5 py-2.5 text-clay-600">
                  {log.entity}
                  {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}
                </td>
                <td className="px-5 py-2.5 text-clay-600">{log.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
