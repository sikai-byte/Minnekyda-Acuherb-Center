import { prisma } from '@/lib/db';
import { notifyAppointment } from './notifications';

/// Appointment reminders. A reminder is a scheduled job rather than a reaction to something a
/// user did, so it lives here and is run by `npm run reminders` from a cron — once a day is
/// enough for a clinic whose visits are booked days ahead.
///
/// Idempotent by design: `Appointment.reminderSentAt` is stamped as each one goes out, so a
/// cron that fires twice, a retried container, or a run that crashes halfway does not put two
/// reminders in a patient's inbox.

/// A day and a half ahead by default: tomorrow's visits are reminded today, and a run that is
/// late still catches them.
const DEFAULT_HOURS_AHEAD = 36;

export type ReminderRun = { considered: number; sent: number; skipped: number; failed: number };

export async function sendDueReminders(
  options: { hoursAhead?: number; now?: Date } = {},
): Promise<ReminderRun> {
  const now = options.now ?? new Date();
  const hoursAhead = options.hoursAhead ?? DEFAULT_HOURS_AHEAD;
  const until = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const due = await prisma.appointment.findMany({
    where: {
      /// Confirmed visits only. A website request nobody has confirmed yet, and anything
      /// cancelled, completed or already checked in, are not things to remind anyone about.
      status: 'SCHEDULED',
      startsAt: { gt: now, lte: until },
      reminderSentAt: null,
    },
    orderBy: { startsAt: 'asc' },
    select: { id: true },
  });

  const run: ReminderRun = { considered: due.length, sent: 0, skipped: 0, failed: 0 };

  for (const appointment of due) {
    const outcome = await notifyAppointment(appointment.id, 'APPOINTMENT_REMINDER');
    if (outcome.status === 'SENT') run.sent += 1;
    else if (outcome.status === 'FAILED') run.failed += 1;
    else run.skipped += 1;

    /// Stamped even when nothing was sent — a chart with no email address, or mail switched
    /// off — so the next run does not walk the same appointments again. A genuine send failure
    /// is the one case left unstamped, so the next run retries it.
    if (outcome.status !== 'FAILED') {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { reminderSentAt: new Date() },
      });
    }
  }

  return run;
}
