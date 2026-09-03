'use client';

import { useRouter } from 'next/navigation';
import { SlotPicker, type PickerAppointmentType, type PickerPractitioner } from './SlotPicker';
import { bookForPatient, staffOpenSlots } from '@/lib/actions/appointments';

export function StaffBooking({
  patientId,
  appointmentTypes,
  practitioners,
  horizonDays,
}: {
  patientId: string;
  appointmentTypes: PickerAppointmentType[];
  practitioners: PickerPractitioner[];
  horizonDays: number;
}) {
  const router = useRouter();

  return (
    <SlotPicker
      appointmentTypes={appointmentTypes}
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
