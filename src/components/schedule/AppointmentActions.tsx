'use client';

import { useState, useTransition } from 'react';
import type { AppointmentStatus } from '@prisma/client';
import { setAppointmentStatus } from '@/lib/actions/appointments';

/// The day's taps: confirm a website request, check someone in, close the visit out, cancel,
/// or record a no-show. Which buttons appear follows from the status, and the server decides
/// again — these are a convenience, not the control.
const NEXT: Record<AppointmentStatus, { transition: string; label: string; tone?: 'ghost' }[]> = {
  REQUESTED: [
    { transition: 'confirm', label: 'Confirm' },
    { transition: 'cancel', label: 'Decline', tone: 'ghost' },
  ],
  BOOKED: [
    { transition: 'check-in', label: 'Check in' },
    { transition: 'no-show', label: 'No-show', tone: 'ghost' },
    { transition: 'cancel', label: 'Cancel', tone: 'ghost' },
  ],
  CHECKED_IN: [{ transition: 'complete', label: 'Complete' }],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function AppointmentActions({
  appointmentId,
  status,
}: {
  appointmentId: string;
  status: AppointmentStatus;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const options = NEXT[status];
  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => (
        <button
          key={option.transition}
          type="button"
          disabled={pending}
          className={option.tone === 'ghost' ? 'btn-ghost' : 'btn-secondary'}
          onClick={() =>
            startTransition(async () => {
              const result = await setAppointmentStatus(appointmentId, option.transition as 'confirm');
              setError(result?.error);
            })
          }
        >
          {option.label}
        </button>
      ))}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
