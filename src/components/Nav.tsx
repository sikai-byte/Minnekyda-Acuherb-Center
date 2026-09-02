import Link from 'next/link';
import type { SessionUser } from '@/lib/session';
import { logout } from '@/lib/actions/auth';

const ROLE_LABELS: Record<SessionUser['role'], string> = {
  ADMIN: 'Admin',
  PRACTITIONER: 'Practitioner',
  FRONT_DESK: 'Front desk',
  /// Patient sessions never render this nav; they are confined to the portal shell.
  PATIENT: 'Patient',
};

export function Nav({ user }: { user: SessionUser }) {
  return (
    <header className="no-print border-b border-clay-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight text-clay-900">
          Minnekyda <span className="text-moss-600">Acuherb</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/patients" className="btn-ghost">
            Patients
          </Link>
          <Link href="/kiosk" className="btn-ghost">
            iPad intake
          </Link>
          {user.role === 'ADMIN' ? (
            <>
              <Link href="/admin/staff" className="btn-ghost">
                Staff
              </Link>
              <Link href="/admin/audit" className="btn-ghost">
                Audit log
              </Link>
            </>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-clay-600">
            {user.name} · {ROLE_LABELS[user.role]}
          </span>
          <form action={logout}>
            <button type="submit" className="btn-secondary">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
