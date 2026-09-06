import { redirect } from 'next/navigation';
import { BrandLockup } from '@/components/Brand';
import { currentUser } from '@/lib/auth';
import { staffMfaRequired } from '@/lib/mfaPolicy';
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
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLockup width={220} />
          <p className="mt-4 text-sm text-clay-600">Helping You Live Your Healthiest Life</p>
        </div>
        {searchParams.reason === 'idle' ? (
          <p className="mb-4 rounded border border-clay-200 bg-clay-50 px-3 py-2 text-sm text-clay-700">
            You were signed out because this browser was left idle.
          </p>
        ) : null}
        {staffMfaRequired() ? null : (
          <p className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Two-step verification is switched off on this host, so a password is all that
            protects an account. Synthetic data only.
          </p>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
