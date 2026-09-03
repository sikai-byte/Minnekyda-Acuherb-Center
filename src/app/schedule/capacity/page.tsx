import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { recordAudit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { capacityReport, weekOf, type OpenBlock } from '@/lib/scheduling/capacity';
import { addDays, clinicIsoDate, isIsoDate } from '@/lib/scheduling/time';

export const dynamic = 'force-dynamic';

const WEEK_DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function hours(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} hrs`;
}

function clockTime(minute: number): string {
  const hour = Math.floor(minute / 60);
  const rest = String(minute % 60).padStart(2, '0');
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${rest}${suffix}`;
}

function day(isoDate: string): string {
  return WEEK_DAY.format(new Date(`${isoDate}T12:00:00.000Z`));
}

function Figure({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-clay-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-clay-600">{detail}</p>
    </div>
  );
}

function Bar({ label, detail, rate }: { label: string; detail: string; rate: number }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-clay-600">
          {percent(rate)} · {detail}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-clay-100">
        <div
          className="h-2 rounded-full bg-moss-500"
          style={{ width: `${Math.min(100, Math.round(rate * 100))}%` }}
        />
      </div>
    </li>
  );
}

function byDay(open: OpenBlock[]): { isoDate: string; blocks: OpenBlock[] }[] {
  const days: { isoDate: string; blocks: OpenBlock[] }[] = [];
  for (const block of open) {
    const last = days.at(-1);
    if (last && last.isoDate === block.isoDate) last.blocks.push(block);
    else days.push({ isoDate: block.isoDate, blocks: [block] });
  }
  return days;
}

/// The Weekly Clinic Capacity report. Scheduling staff see it, because it is how the week gets
/// filled; it counts visits and minutes and never names a patient.
export default async function CapacityPage({ searchParams }: { searchParams: { week?: string } }) {
  const user = await requireRole(['ADMIN', 'PRACTITIONER', 'FRONT_DESK']);

  const anchor = isIsoDate(searchParams.week ?? '') ? searchParams.week! : clinicIsoDate(new Date());
  const window = weekOf(anchor);
  const report = await capacityReport(window);

  await recordAudit({
    userId: user.id,
    action: 'view_capacity_report',
    entity: 'Appointment',
    detail: { from: window.fromIso, to: window.toIso },
  });

  const { summary } = report;
  const closedOut = summary.completed + summary.cancelled + summary.noShows;
  const open = byDay(report.open);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly clinic capacity</h1>
          <p className="mt-1 text-sm text-clay-600">
            {day(window.fromIso)} – {day(window.toIso)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/schedule/capacity?week=${addDays(window.fromIso, -7)}`} className="btn-secondary">
            ← Previous
          </Link>
          <Link href="/schedule/capacity" className="btn-ghost">
            This week
          </Link>
          <Link href={`/schedule/capacity?week=${addDays(window.fromIso, 7)}`} className="btn-secondary">
            Next →
          </Link>
          <Link href="/schedule" className="btn-ghost">
            Daily schedule
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Figure
          label="Booked"
          value={String(summary.booked)}
          detail={`${summary.firstVisits} first visit${summary.firstVisits === 1 ? '' : 's'} · ${
            summary.returning
          } returning`}
        />
        <Figure
          label="Schedule fill"
          value={percent(summary.fillRate)}
          detail={`${hours(summary.bookedMinutes)} of ${hours(summary.roomMinutes)} room time`}
        />
        <Figure
          label="Completed"
          value={String(summary.completed)}
          detail={`${percent(summary.completionRate)} of ${closedOut} closed-out visit${
            closedOut === 1 ? '' : 's'
          }`}
        />
        <Figure
          label="Cancelled"
          value={String(summary.cancelled)}
          detail={`${percent(summary.cancellationRate)} of closed-out visits; the time went back on sale`}
        />
        <Figure
          label="No-shows"
          value={String(summary.noShows)}
          detail={`${percent(summary.noShowRate)} of closed-out visits`}
        />
        <Figure
          label="Open hours"
          value={hours(summary.openMinutes)}
          detail={`Across ${report.rooms.length} treatment room${report.rooms.length === 1 ? '' : 's'}`}
        />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-lg font-semibold tracking-tight">Practitioner utilisation</h2>
          <p className="mt-1 text-sm text-clay-600">
            Booked minutes against the hours each practitioner was rostered for.
          </p>
          {report.practitioners.length === 0 ? (
            <p className="mt-3 text-sm text-clay-600">No practitioner has working hours set.</p>
          ) : (
            <ul className="mt-3 divide-y divide-clay-100">
              {report.practitioners.map((entry) => (
                <Bar
                  key={entry.id}
                  label={entry.name}
                  detail={hours(entry.minutes)}
                  rate={entry.rate}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold tracking-tight">Room utilisation</h2>
          <p className="mt-1 text-sm text-clay-600">
            Booked minutes against the hours the clinic was open.
          </p>
          <ul className="mt-3 divide-y divide-clay-100">
            {report.rooms.map((entry) => (
              <Bar key={entry.id} label={entry.name} detail={hours(entry.minutes)} rate={entry.rate} />
            ))}
          </ul>
        </section>
      </div>

      <section className="card mt-4">
        <h2 className="text-lg font-semibold tracking-tight">Open capacity</h2>
        <p className="mt-1 text-sm text-clay-600">
          Times with at least one treatment room free while a practitioner is working.
        </p>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-clay-600">
            Nothing free this week within the rostered hours.
          </p>
        ) : (
          <dl className="mt-3 divide-y divide-clay-100 text-sm">
            {open.map((entry) => (
              <div key={entry.isoDate} className="flex flex-wrap gap-x-4 gap-y-1 py-2">
                <dt className="w-32 font-medium">{day(entry.isoDate)}</dt>
                <dd className="text-clay-700">
                  {entry.blocks
                    .map((block) => `${clockTime(block.startMinute)}–${clockTime(block.endMinute)}`)
                    .join(' · ')}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <p className="mt-6 text-sm text-clay-600">
        Fill and utilisation count requested, scheduled, checked-in and completed visits;
        cancellations and no-shows are counted but occupy nothing, because their room went back
        on sale. Denominators come from the practitioners&rsquo; working hours and the active
        treatment rooms, so this report can never claim time the booking screens would not have
        offered.
      </p>
    </AppShell>
  );
}
