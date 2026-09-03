'use client';

import { useRouter } from 'next/navigation';
import { SlotPicker, type PickerPractitioner, type PickerService } from './SlotPicker';
import { bookForPatient, staffOpenSlots } from '@/lib/actions/appointments';

export function StaffBooking({
  patientId,
  services,
  practitioners,
  horizonDays,
}: {
  patientId: string;
  services: PickerService[];
  practitioners: PickerPractitioner[];
  horizonDays: number;
}) {
  const router = useRouter();

  return (
    <SlotPicker
      services={services}
      practitioners={practitioners}
      loadSlots={staffOpenSlots}
      submit={bookForPatient}
      submitLabel="Book"
      horizonDays={horizonDays}
      onBooked={() => router.push(`/patients/${patientId}`)}
    >
      <input type="hidden" name="patientId" value={patientId} />
    </SlotPicker>
  );
}
