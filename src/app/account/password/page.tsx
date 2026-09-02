import { requireUserPendingPasswordChange } from '@/lib/auth';
import { PasswordForm } from './PasswordForm';

export const dynamic = 'force-dynamic';

export default async function PasswordPage() {
  const user = await requireUserPendingPasswordChange();

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {user.mustChangePassword ? 'Choose a new password' : 'Change your password'}
      </h1>
      <p className="mt-1 text-sm text-clay-600">
        {user.mustChangePassword
          ? 'This account still uses a password that was set for you. Pick your own before continuing.'
          : 'At least 12 characters, with upper and lower case letters and a number.'}
      </p>
      <div className="mt-6">
        <PasswordForm />
      </div>
    </div>
  );
}
