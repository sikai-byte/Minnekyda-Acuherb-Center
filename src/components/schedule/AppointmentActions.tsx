'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AppointmentStatus } from '@prisma/client';
import {
  moveAppointmentRoom,
  rescheduleAppointment,
  setAppointmentStatus,
  staffOpenSlots,
} from '@/lib/actions/appointments';
import type { LifecycleAction } from '@/lib/scheduling/booking';
import { CLINIC_TIME_ZONE } from '@/lib/scheduling/time';

/// The day's taps: confirm a website request, check someone in, close the visit out, cancel,
/// record a no-show, move the visit or move the room. Which buttons appear follows from the
/// status, and the server decides again — these are a convenience, not the control.
const NEXT: Record<AppointmentStatus, { action: LifecycleAction; label: string; ghost?: boolean }[]> = {
  REQUESTED: [
    { action: 'confirm', label: 'Confirm' },
    { action: 'check-in', label: 'Check in' },
    { action: 'cancel', label: 'Decline', ghost: true },
  ],
  SCHEDULED: [
    { action: 'check-in', label: 'Check in' },
    { action: 'complete', label: 'Complete', ghost: true },
    { action: 'no-show', label: 'No-show', ghost: true },
    { action: 'cancel', label: 'Cancel', ghost: true },
  ],
  CHECKED_IN: [{ action: 'complete', label: 'Complete' }],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const TIME = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: CLINIC_TIME_ZONE,
});

const DAY = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: CLINIC_TIME_ZONE,
});

export type ActionsRoom = { id: string; name: string };

export function AppointmentActions({
  appointmentId,
  status,
  appointmentTypeId,
  practitionerId,
  roomId,
  startsAt,
  rooms,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  appointmentTypeId: string;
  practitionerId: string;
  roomId: string | null;
  startsAt: string;
  rooms: ActionsRoom[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [panel, setPanel] = useState<'none' | 'move' | 'room'>('none');
  const [pending, startTransition] = useTransition();
  const options = NEXT[status];
  const open = status === 'REQUESTED' || status === 'SCHEDULED' || status === 'CHECKED_IN';

  const run = (work: () => Promise<{ error?: string } | void>) =>
    startTransition(async () => {
      const result = await work();
      setError(result?.error);
      if (!result?.error) {
        setPanel('none');
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {options.map((option) => (
          <button
            key={option.action}
            type="button"
            disabled={pending}
            className={option.ghost ? 'btn-ghost' : 'btn-secondary'}
            onClick={() => run(() => setAppointmentStatus(appointmentId, option.action))}
          >
            {option.label}
          </button>
        ))}
        {open ? (
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setPanel(panel === 'move' ? 'none' : 'move')}
            >
              Reschedule
            </button>
            {rooms.length > 0 ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setPanel(panel === 'room' ? 'none' : 'room')}
              >
                Room
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {panel === 'move' ? (
        <MovePanel
          appointmentTypeId={appointmentTypeId}
          practitionerId={practitionerId}
          startsAt={startsAt}
          pending={pending}
          onPick={(iso) => run(() => rescheduleAppointment(appointmentId, iso))}
        />
      ) : null}

      {panel === 'room' ? (
        <div className="flex flex-wrap justify-end gap-2">
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              disabled={pending || room.id === roomId}
              className={room.id === roomId ? 'btn-secondary opacity-50' : 'btn-ghost'}
              onClick={() => run(() => moveAppointmentRoom(appointmentId, room.id))}
            >
              {room.name}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}

/// Times come from the same server availability the booking screens use, so a reschedule can
/// only ever offer a slot the booking transaction would also accept.
function MovePanel({
  appointmentTypeId,
  practitionerId,
  startsAt,
  pending,
  onPick,
}: {
  appointmentTypeId: string;
  practitionerId: string;
  startsAt: string;
  pending: boolean;
  onPick: (iso: string) => void;
}) {
  const [date, setDate] = useState(DAY.format(new Date(startsAt)));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    staffOpenSlots(practitionerId, appointmentTypeId, date)
      .then((open) => {
        if (current) setSlots(open);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [practitionerId, appointmentTypeId, date]);

  return (
    <div className="w-full rounded-lg border border-clay-200 bg-white p-3">
      <label className="block">
        <span className="label">Move to</span>
        <input
          type="date"
          className="input"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {loading ? (
          <span className="text-sm text-clay-600">Looking…</span>
        ) : slots && slots.length > 0 ? (
          slots.map((slot) => (
            <button
              key={slot}
              type="button"
              disabled={pending}
              className="min-h-11 rounded-lg border border-clay-300 px-3 py-2 text-sm hover:border-moss-400"
              onClick={() => onPick(slot)}
            >
              {TIME.format(new Date(slot))}
            </button>
          ))
        ) : (
          <span className="text-sm text-clay-600">Nothing open that day.</span>
        )}
      </div>
    </div>
  );
}
