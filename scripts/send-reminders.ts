import { sendDueReminders } from '../src/lib/email/reminders';
import { prisma } from '../src/lib/db';

/// `npm run reminders` — the daily cron entry point. Prints counts only: which patients were
/// reminded is in the `EmailMessage` table, not in a cron log that ships to a log aggregator.

async function main(): Promise<void> {
  const hoursAhead = process.env.REMINDER_HOURS_AHEAD
    ? Number(process.env.REMINDER_HOURS_AHEAD)
    : undefined;
  if (hoursAhead !== undefined && (!Number.isFinite(hoursAhead) || hoursAhead <= 0)) {
    throw new Error('REMINDER_HOURS_AHEAD must be a positive number of hours');
  }

  const run = await sendDueReminders({ hoursAhead });
  console.info('appointment reminders', run);
}

main()
  .catch((error) => {
    console.error('reminder run failed', error instanceof Error ? error.message : 'unknown');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
