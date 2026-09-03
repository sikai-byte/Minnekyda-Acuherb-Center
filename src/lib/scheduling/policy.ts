import { prisma } from '@/lib/db';
import { CONSERVATIVE_POLICY, type CapacityPolicy } from './slots';

/// The clinic's scheduling settings, read from the single `SchedulingPolicy` row.
///
/// They are data rather than constants because the staggered-treatment model is not settled:
/// the clinic runs five rooms with quarter-hour arrivals, which only works if a practitioner
/// may oversee more than one retained treatment at a time, and nobody has yet said which
/// minutes of a 60-minute visit need the practitioner present. Until they do, the row's
/// defaults — one appointment at a time, whole visit counted — under-book rather than
/// double-book someone.

export type SchedulingSettings = CapacityPolicy & {
  selfBookingNoticeMinutes: number;
  selfCancelNoticeHours: number;
  bookingHorizonDays: number;
};

export const DEFAULT_SETTINGS: SchedulingSettings = {
  ...CONSERVATIVE_POLICY,
  selfBookingNoticeMinutes: 120,
  selfCancelNoticeHours: 24,
  bookingHorizonDays: 60,
};

/// Falls back to the defaults rather than throwing when the row is missing: a clinic that has
/// not run its seed should still be able to look at an empty calendar.
export async function schedulingSettings(): Promise<SchedulingSettings> {
  const row = await prisma.schedulingPolicy.findUnique({ where: { id: 'default' } });
  if (!row) return DEFAULT_SETTINGS;
  return {
    maxConcurrentPerPractitioner: row.maxConcurrentPerPractitioner,
    practitionerActiveMinutes: row.practitionerActiveMinutes,
    slotStepMinutes: row.slotStepMinutes,
    selfBookingNoticeMinutes: row.selfBookingNoticeMinutes,
    selfCancelNoticeHours: row.selfCancelNoticeHours,
    bookingHorizonDays: row.bookingHorizonDays,
  };
}

export function capacityPolicy(settings: SchedulingSettings): CapacityPolicy {
  return {
    maxConcurrentPerPractitioner: settings.maxConcurrentPerPractitioner,
    practitionerActiveMinutes: settings.practitionerActiveMinutes,
    slotStepMinutes: settings.slotStepMinutes,
  };
}
