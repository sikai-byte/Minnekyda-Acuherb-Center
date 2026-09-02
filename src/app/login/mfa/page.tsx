import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { MfaForm } from './MfaForm';

export const dynamic = 'force-dynamic';

export default async function MfaPage() {
  const session = await getSession();
  if (session.user) redirect('/');
  if (!session.pendingMfa) redirect('/login');

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Two-step verification</h1>
          <p className="mt-1 text-sm text-clay-600">
            Enter the six-digit code from your authenticator app.
          </p>
        </div>
        <MfaForm />
      </div>
    </div>
  );
}
