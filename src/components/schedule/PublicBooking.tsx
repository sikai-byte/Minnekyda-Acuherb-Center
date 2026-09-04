'use client';

import { useState } from 'react';
import { SlotPicker, type PickerAppointmentType, type PickerPractitioner } from './SlotPicker';
import { CLINIC_TIME_ZONE } from '@/lib/scheduling/time';
import {
  publicOpenDays,
  publicOpenSlots,
  requestPublicBooking,
} from '@/lib/actions/publicBooking';

const WHEN = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: CLINIC_TIME_ZONE,
});

type Confirmation = { reference: string; when: string; confirmed: boolean };

/// Identity and contact details only. There is no symptom or reason box here by design: a
/// stranger on the open internet must not be able to put health information into this system.
export function PublicBooking({
  appointmentTypes,
  practitioners,
  horizonDays,
  autoConfirm,
}: {
  appointmentTypes: PickerAppointmentType[];
  practitioners: PickerPractitioner[];
  horizonDays: number;
  autoConfirm: boolean;
}) {
  const [confirmed, setConfirmed] = useState<Confirmation | null>(null);

  if (confirmed) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">
          {confirmed.confirmed ? 'Your visit is booked' : 'We have your request'}
        </h2>
        <p className="text-sm text-clay-700">
          {WHEN.format(new Date(confirmed.when))}. Reference {confirmed.reference}.
        </p>
        <p className="text-sm text-clay-600">
          {confirmed.confirmed
            ? 'Your appointment is confirmed. '
            : 'We are holding this time for you and will call to confirm it. '}
          Please arrive ten minutes early for your first visit so you have time to complete your
          health history on our iPad, and call the clinic if you need to change it.
        </p>
      </div>
    );
  }

  return (
    <SlotPicker
      appointmentTypes={appointmentTypes}
      practitioners={practitioners}
      loadSlots={publicOpenSlots}
      loadOpenDays={publicOpenDays}
      allowAnyPractitioner
      submit={async (formData) => {
        const result = await requestPublicBooking(formData);
        if (result.reference && result.when) {
          setConfirmed({
            reference: result.reference,
            when: result.when,
            confirmed: result.confirmed === true,
          });
          return {};
        }
        return { error: result.error };
      }}
      submitLabel={autoConfirm ? 'Book this time' : 'Request this time'}
      horizonDays={horizonDays}
    >
      <fieldset className="grid gap-4 border-t border-clay-200 pt-5 sm:grid-cols-2">
        <legend className="label">Your details</legend>
        <label className="block">
          <span className="label">First name</span>
          <input name="firstName" className="input" autoComplete="given-name" required />
        </label>
        <label className="block">
          <span className="label">Last name</span>
          <input name="lastName" className="input" autoComplete="family-name" required />
        </label>
        <label className="block">
          <span className="label">Date of birth</span>
          <input name="dateOfBirth" type="date" className="input" required />
        </label>
        <label className="block">
          <span className="label">Phone</span>
          <input name="phone" type="tel" className="input" autoComplete="tel" required />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Email</span>
          <input name="email" type="email" className="input" autoComplete="email" required />
        </label>
        <input
          type="text"
          name="decoy"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
      </fieldset>
    </SlotPicker>
  );
}
