'use client';

import { useEffect, useState, useTransition } from 'react';

/// The one booking control, shared by the front desk, the patient portal and the public
/// website. Each caller passes its own loader and its own submit action, so the three
/// surfaces cannot drift apart on the rules — and none of them offers a free-text box, which
/// is what keeps health information off the calendar.

export type PickerService = { id: string; name: string; minutes: number; description?: string | null };
export type PickerPractitioner = { id: string; name: string; credentials?: string | null };

type SlotPickerProps = {
  services: PickerService[];
  practitioners: PickerPractitioner[];
  /// Returns the open starts as ISO instants. Times only — never who holds the others.
  loadSlots: (practitionerId: string, serviceId: string, isoDate: string) => Promise<string[]>;
  submit: (formData: FormData) => Promise<{ error?: string }>;
  submitLabel: string;
  /// Extra inputs posted with the booking, e.g. the contact details a new patient gives on
  /// the public form. Never a reason for the visit.
  children?: React.ReactNode;
  onBooked?: () => void;
  horizonDays: number;
};

const TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function horizon(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function SlotPicker({
  services,
  practitioners,
  loadSlots,
  submit,
  submitLabel,
  children,
  onBooked,
  horizonDays,
}: SlotPickerProps) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [practitionerId, setPractitionerId] = useState(practitioners[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!serviceId || !practitionerId || !date) return;
    let current = true;
    setLoading(true);
    setChosen('');
    loadSlots(practitionerId, serviceId, date)
      .then((open) => {
        if (current) setSlots(open);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [loadSlots, practitionerId, serviceId, date]);

  const service = services.find((option) => option.id === serviceId);

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
        setSlots(await loadSlots(practitionerId, serviceId, date));
        setChosen('');
        return;
      }
      setError(undefined);
      onBooked?.();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="practitionerId" value={practitionerId} />
      <input type="hidden" name="startsAt" value={chosen} />

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">Visit type</span>
          <select
            className="input"
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
          >
            {services.map((option) => (
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
            min={today()}
            max={horizon(horizonDays)}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </div>

      {service?.description ? <p className="text-sm text-clay-600">{service.description}</p> : null}

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
