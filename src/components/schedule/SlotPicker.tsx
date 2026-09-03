'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { CLINIC_TIME_ZONE } from '@/lib/scheduling/time';

/// The one booking control, shared by the front desk, the patient portal and the public
/// website. Each caller passes its own loader and its own submit action, and the open times
/// always come from the server's canonical availability service — this component does no
/// scheduling arithmetic of its own, so the three surfaces cannot drift apart on the rules.
/// None of them offers a free-text box, which is what keeps health information off the
/// calendar.

export type PickerAppointmentType = {
  id: string;
  name: string;
  minutes: number;
  description?: string | null;
};
export type PickerPractitioner = { id: string; name: string; credentials?: string | null };

type SlotPickerProps = {
  appointmentTypes: PickerAppointmentType[];
  practitioners: PickerPractitioner[];
  /// Returns the open starts as ISO instants. Times only — never who holds the others.
  loadSlots: (
    practitionerId: string,
    appointmentTypeId: string,
    date: string,
  ) => Promise<string[]>;
  submit: (formData: FormData) => Promise<{ error?: string }>;
  submitLabel: string;
  /// Extra inputs posted with the booking, e.g. the contact details a new patient gives on
  /// the public form. Never a reason for the visit.
  children?: React.ReactNode;
  onBooked?: () => void;
  horizonDays: number;
  /// Patient-facing surfaces offer "any practitioner" first, because that is how most people
  /// book; the server decides who actually takes the visit.
  allowAnyPractitioner?: boolean;
};

const TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: CLINIC_TIME_ZONE,
});

const DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: CLINIC_TIME_ZONE,
});

/// Clinic-local, not the visitor's device: a patient in another timezone still books against
/// the clinic's day.
function clinicDay(at: Date): string {
  return DATE_PARTS.format(at);
}

export function SlotPicker({
  appointmentTypes,
  practitioners,
  loadSlots,
  submit,
  submitLabel,
  children,
  onBooked,
  horizonDays,
  allowAnyPractitioner = false,
}: SlotPickerProps) {
  const [appointmentTypeId, setAppointmentTypeId] = useState(appointmentTypes[0]?.id ?? '');
  const [practitionerId, setPractitionerId] = useState(
    allowAnyPractitioner ? '' : practitioners[0]?.id ?? '',
  );
  const today = useMemo(() => clinicDay(new Date()), []);
  const latest = useMemo(
    () => clinicDay(new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000)),
    [horizonDays],
  );
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!appointmentTypeId || !date) return;
    let current = true;
    setLoading(true);
    setChosen('');
    loadSlots(practitionerId, appointmentTypeId, date)
      .then((open) => {
        if (current) setSlots(open);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [loadSlots, practitionerId, appointmentTypeId, date]);

  const appointmentType = appointmentTypes.find((option) => option.id === appointmentTypeId);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chosen) {
      setError('Pick a time.');
      return;
    }
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await submit(formData);
      if (result?.error) {
        setError(result.error);
        /// The slot may have gone while the form was open, so reload what is left.
        setSlots(await loadSlots(practitionerId, appointmentTypeId, date));
        setChosen('');
        return;
      }
      setError(undefined);
      onBooked?.();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="appointmentTypeId" value={appointmentTypeId} />
      <input type="hidden" name="practitionerId" value={practitionerId} />
      <input type="hidden" name="startsAt" value={chosen} />

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">Visit type</span>
          <select
            className="input"
            value={appointmentTypeId}
            onChange={(event) => setAppointmentTypeId(event.target.value)}
          >
            {appointmentTypes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} · {option.minutes} min
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Practitioner</span>
          <select
            className="input"
            value={practitionerId}
            onChange={(event) => setPractitionerId(event.target.value)}
          >
            {allowAnyPractitioner ? <option value="">Any practitioner</option> : null}
            {practitioners.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.credentials ? `, ${option.credentials}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Day</span>
          <input
            type="date"
            className="input"
            value={date}
            min={today}
            max={latest}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </div>

      {appointmentType?.description ? (
        <p className="text-sm text-clay-600">{appointmentType.description}</p>
      ) : null}

      <div>
        <span className="label">Open times</span>
        {loading ? (
          <p className="text-sm text-clay-600">Looking…</p>
        ) : slots && slots.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {slots.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => {
                  setChosen(slot);
                  setError(undefined);
                }}
                className={`min-h-11 rounded-lg border px-4 py-2 text-sm ${
                  chosen === slot
                    ? 'border-moss-600 bg-moss-600 text-white'
                    : 'border-clay-300 bg-white text-clay-800 hover:border-moss-400'
                }`}
              >
                {TIME_FORMAT.format(new Date(slot))}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-clay-600">
            Nothing open that day. Try another, or call the clinic.
          </p>
        )}
      </div>

      {children}

      {error ? <p className="field-error">{error}</p> : null}

      <button type="submit" className="btn-primary" disabled={pending || !chosen}>
        {pending ? 'Booking…' : submitLabel}
      </button>
    </form>
  );
}
