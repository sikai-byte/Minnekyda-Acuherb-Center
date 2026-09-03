import { prisma } from '@/lib/db';
import { CONSERVATIVE_POLICY, type CapacityPolicy } from './slots';

/// The clinic's scheduling settings, read from the single `SchedulingPolicy` row.
///
/// They are data rather than constants so the clinic can change a notice period or close
/// online booking without a deploy. How much of a visit needs the practitioner is not here:
/// that varies by visit type and lives on `AppointmentType`.

export type SchedulingSettings = CapacityPolicy & {
  selfBookingNoticeMinutes: number;
  selfCancelNoticeHours: number;
  selfRescheduleNoticeHours: number;
  bookingHorizonDays: number;
  publicRequestsAutoConfirm: boolean;
};

export const DEFAULT_SETTINGS: SchedulingSettings = {
  ...CONSERVATIVE_POLICY,
  selfBookingNoticeMinutes: 120,
  selfCancelNoticeHours: 24,
  selfRescheduleNoticeHours: 48,
  bookingHorizonDays: 60,
  publicRequestsAutoConfirm: true,
};

/// Falls back to the defaults rather than throwing when the row is missing: a clinic that has
/// not run its seed should still be able to look at an empty calendar.
export async function schedulingSettings(): Promise<SchedulingSettings> {
  const row = await prisma.schedulingPolicy.findUnique({ where: { id: 'default' } });
  if (!row) return DEFAULT_SETTINGS;
  return {
    maxConcurrentPerPractitioner: row.maxConcurrentPerPractitioner,
    slotStepMinutes: row.slotStepMinutes,
    selfBookingNoticeMinutes: row.selfBookingNoticeMinutes,
    selfCancelNoticeHours: row.selfCancelNoticeHours,
    selfRescheduleNoticeHours: row.selfRescheduleNoticeHours,
    bookingHorizonDays: row.bookingHorizonDays,
    publicRequestsAutoConfirm: row.publicRequestsAutoConfirm,
  };
}

export function capacityPolicy(settings: SchedulingSettings): CapacityPolicy {
  return {
    maxConcurrentPerPractitioner: settings.maxConcurrentPerPractitioner,
    slotStepMinutes: settings.slotStepMinutes,
  };
}
