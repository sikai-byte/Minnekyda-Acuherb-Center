import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { beginMfaEnrollment } from '@/lib/actions/auth';
import { otpauthUri } from '@/lib/mfa';
import { getSession } from '@/lib/session';
import { MfaSetupForm } from './MfaSetupForm';

export const dynamic = 'force-dynamic';

/// Enrolment is mandatory for staff accounts: the pending session cannot become a real
/// session until a generated code proves the authenticator app holds the same secret.
export default async function MfaSetupPage() {
  const session = await getSession();
  if (session.user) redirect('/');
  if (!session.pendingMfa) redirect('/login');

  const enrollment = await beginMfaEnrollment();
  if (!enrollment) redirect('/login/mfa');

  const uri = otpauthUri(enrollment.secret, enrollment.email);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Set up two-step verification</h1>
          <p className="mt-1 text-sm text-clay-600">
            Required for every staff account. Scan this with Google Authenticator, 1Password, or
            your phone&apos;s built-in code generator.
          </p>
        </div>
        <MfaSetupForm qrDataUrl={qrDataUrl} secret={enrollment.secret} />
      </div>
    </div>
  );
}
