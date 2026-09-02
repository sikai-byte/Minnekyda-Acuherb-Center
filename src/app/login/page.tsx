import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  if (await currentUser()) redirect('/');

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Minnekyda <span className="text-moss-600">Acuherb</span> Center
          </h1>
          <p className="mt-1 text-sm text-clay-600">Helping You Live Your Healthiest Life</p>
        </div>
        {searchParams.reason === 'idle' ? (
          <p className="mb-4 rounded border border-clay-200 bg-clay-50 px-3 py-2 text-sm text-clay-700">
            You were signed out because this browser was left idle.
          </p>
        ) : null}
        <LoginForm />
      </div>
    </div>
  );
}
