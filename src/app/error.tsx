'use client';

/// Error screens are seen by patients on the kiosk as well as staff, so they never show a
/// message, stack trace or digest that could carry chart data.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-clay-600">
        Nothing was saved. Try again, and let the front desk know if it keeps happening.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        {/* A session that expired or changed roles under an open screen lands here, and the
            way out of that is a fresh sign-in rather than another attempt. */}
        <a href="/login" className="btn-ghost">
          Sign in again
        </a>
      </div>
    </div>
  );
}
