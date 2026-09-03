'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  SlotPicker,
  type PickerAppointmentType,
  type PickerPractitioner,
} from '@/components/schedule/SlotPicker';
import { CLINIC_TIME_ZONE } from '@/lib/scheduling/time';
import { portalBook, portalCancel, portalOpenSlots } from '@/lib/actions/portalBooking';

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
  appointmentType: { name: string };
  practitioner: { name: string; credentials?: string | null };
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

export function UpcomingAppointments({ appointments }: { appointments: PortalAppointment[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <ul className="divide-y divide-clay-100">
      {appointments.map((appointment) => (
        <li key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="font-medium">{WHEN.format(new Date(appointment.startsAt))}</p>
            <p className="text-sm text-clay-600">
              {appointment.appointmentType.name} · {appointment.practitioner.name}
              {appointment.practitioner.credentials ? `, ${appointment.practitioner.credentials}` : ''}
            </p>
            {appointment.status === 'REQUESTED' ? (
              <p className="text-xs text-amber-800">Waiting for the clinic to confirm</p>
            ) : null}
          </div>
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
        </li>
      ))}
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
