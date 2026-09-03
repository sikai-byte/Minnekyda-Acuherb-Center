'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  SlotPicker,
  type PickerAppointmentType,
  type PickerPractitioner,
} from '@/components/schedule/SlotPicker';
import { CLINIC_TIME_ZONE } from '@/lib/scheduling/time';
import {
  portalBook,
  portalCancel,
  portalOpenSlots,
  portalReschedule,
  portalRescheduleSlots,
} from '@/lib/actions/portalBooking';

const WHEN = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: CLINIC_TIME_ZONE,
});

export type PortalAppointment = {
  id: string;
  startsAt: Date;
  status: string;
  appointmentType: { id: string; name: string; minutes: number };
  practitioner: { id: string; name: string; credentials?: string | null };
};

export function PortalBooking({
  appointmentTypes,
  practitioners,
  horizonDays,
}: {
  appointmentTypes: PickerAppointmentType[];
  practitioners: PickerPractitioner[];
  horizonDays: number;
}) {
  const router = useRouter();
  return (
    <SlotPicker
      appointmentTypes={appointmentTypes}
      practitioners={practitioners}
      loadSlots={portalOpenSlots}
      allowAnyPractitioner
      submit={portalBook}
      submitLabel="Book this time"
      horizonDays={horizonDays}
      onBooked={() => router.refresh()}
    />
  );
}

/// A patient moving their own visit. The cut-off is the clinic's: past it the times simply are
/// not offered and the patient is asked to phone, which the server enforces again.
export function UpcomingAppointments({
  appointments,
  rescheduleNoticeHours,
  horizonDays,
}: {
  appointments: PortalAppointment[];
  rescheduleNoticeHours: number;
  horizonDays: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [moving, setMoving] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <ul className="divide-y divide-clay-100">
      {appointments.map((appointment) => {
        const noticeMs = rescheduleNoticeHours * 60 * 60 * 1000;
        const canMove = new Date(appointment.startsAt).getTime() - Date.now() >= noticeMs;
        return (
        <li key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-medium">{WHEN.format(new Date(appointment.startsAt))}</p>
            <p className="text-sm text-clay-600">
              {appointment.appointmentType.name} · {appointment.practitioner.name}
              {appointment.practitioner.credentials ? `, ${appointment.practitioner.credentials}` : ''}
            </p>
            {appointment.status === 'REQUESTED' ? (
              <p className="text-xs text-amber-800">Waiting for the clinic to confirm</p>
            ) : null}
            {!canMove ? (
              <p className="text-xs text-clay-600">
                Within {rescheduleNoticeHours} hours of your visit — call the clinic to change it.
              </p>
            ) : null}
            {moving === appointment.id ? (
              <div className="mt-4 w-full">
                <SlotPicker
                  appointmentTypes={[appointment.appointmentType]}
                  practitioners={[appointment.practitioner]}
                  loadSlots={(_practitionerId, _appointmentTypeId, date) =>
                    portalRescheduleSlots(appointment.id, date)
                  }
                  submit={portalReschedule}
                  submitLabel="Move to this time"
                  horizonDays={horizonDays}
                  onBooked={() => {
                    setMoving(null);
                    router.refresh();
                  }}
                >
                  <input type="hidden" name="appointmentId" value={appointment.id} />
                </SlotPicker>
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            {canMove ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => setMoving(moving === appointment.id ? null : appointment.id)}
              >
                {moving === appointment.id ? 'Keep this time' : 'Reschedule'}
              </button>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await portalCancel(appointment.id);
                  setError(result?.error);
                  if (!result?.error) router.refresh();
                })
              }
            >
              Cancel
            </button>
          </div>
        </li>
        );
      })}
      {error ? <li className="pt-3 text-sm text-red-700">{error}</li> : null}
    </ul>
  );
}

export function PastAppointments({ appointments }: { appointments: PortalAppointment[] }) {
  return (
    <ul className="divide-y divide-clay-100 text-sm">
      {appointments.map((appointment) => (
        <li key={appointment.id} className="flex items-center justify-between gap-3 py-2.5">
          <span>{WHEN.format(new Date(appointment.startsAt))}</span>
          <span className="text-clay-600">
            {appointment.appointmentType.name} · {appointment.practitioner.name}
          </span>
          <span className="badge bg-clay-100 text-clay-700">
            {appointment.status.replace('_', ' ').toLowerCase()}
          </span>
        </li>
      ))}
    </ul>
  );
}
