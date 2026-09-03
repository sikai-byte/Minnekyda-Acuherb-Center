import Link from 'next/link';
import { logout } from '@/lib/actions/auth';

/// The portal deliberately shares no navigation with the staff app: nothing here links to
/// a route a patient is allowed to open.
export function PortalShell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-clay-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/portal" className="text-lg font-semibold tracking-tight text-clay-900">
            Minnekyda <span className="text-moss-600">Acuherb</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/portal" className="btn-ghost">
              My records
            </Link>
            <Link href="/portal/appointments" className="btn-ghost">
              My appointments
            </Link>
            <Link href="/portal/profile" className="btn-ghost">
              My details
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-clay-600">{name}</span>
            <form action={logout}>
              <button type="submit" className="btn-secondary">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
