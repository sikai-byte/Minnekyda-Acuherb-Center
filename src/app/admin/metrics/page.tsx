import { AppShell } from '@/components/AppShell';
import { requireRole } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { formatDate } from '@/lib/format';
import { clinicDayStart } from '@/lib/scheduling/time';
import { FRONT_DESK_MINUTES_PER_VISIT, PAPER_CHART_MINUTES } from '@/lib/metrics/baselines';
import { clinicReport, lastDays } from '@/lib/metrics/report';
import type { Duration } from '@/lib/metrics/clinic';

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];

function hours(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} hrs`;
}

function duration(value: Duration): string {
  if (value.medianMinutes === null) return 'No data yet';
  return `${value.medianMinutes} min`;
}

function Metric({
  label,
  value,
  detail,
  estimate,
}: {
  label: string;
  value: string;
  detail: string;
  estimate?: boolean;
}) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-clay-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-clay-600">{detail}</p>
      {estimate ? (
        <p className="mt-2 text-xs text-clay-500">Estimate, from the clinic&rsquo;s own figures</p>
      ) : null}
    </div>
  );
}

/// The operations report. Deliberately admin-only and deliberately free of names: it answers
/// how long things take and how full the rooms are, never who was treated.
export default async function MetricsPage({ searchParams }: { searchParams: { days?: string } }) {
  const user = await requireRole(['ADMIN']);

  const days = RANGES.includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const report = await clinicReport(lastDays(days));

  await recordAudit({
    userId: user.id,
    action: 'view_metrics',
    entity: 'ClinicEvent',
    detail: { days },
  });

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
          <p className="mt-1 text-sm text-clay-600">
            {formatDate(clinicDayStart(report.window.fromIso))} –{' '}
            {formatDate(clinicDayStart(report.window.toIso))}
          </p>
        </div>
        <nav className="flex gap-1 text-sm">
          {RANGES.map((range) => (
            <a
              key={range}
              href={`/admin/metrics?days=${range}`}
              className={range === days ? 'btn-primary' : 'btn-ghost'}
            >
              {range} days
            </a>
          ))}
        </nav>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          label="Intake on the iPad"
          value={duration(report.intake)}
          detail={`Median of ${report.intake.count} completed intakes${
            report.intake.meanMinutes === null ? '' : `, mean ${report.intake.meanMinutes} min`
          }`}
        />
        <Metric
          label="Transcription avoided"
          value={hours(report.transcription.estimatedMinutesSaved)}
          detail={`${report.transcription.charts} charts × ${PAPER_CHART_MINUTES} min of preparing and re-typing paper`}
          estimate
        />
        <Metric
          label="Writing a visit note"
          value={duration(report.note)}
          detail={`Median of ${report.note.count} signed notes, from opening the editor to signing`}
        />
        <Metric
          label="Visit → signed note"
          value={duration(report.noteLag)}
          detail={`Median across ${report.noteLag.count} completed visits`}
        />
        <Metric
          label="Practitioner utilisation"
          value={`${report.utilisation.appointmentPercent}%`}
          detail={`${hours(report.utilisation.bookedMinutes)} booked of ${hours(
            report.utilisation.openMinutes,
          )} open`}
        />
        <Metric
          label="Room utilisation"
          value={`${report.utilisation.roomPercent}%`}
          detail={`Against ${report.utilisation.rooms} treatment rooms open the same hours`}
        />
        <Metric
          label="No-shows"
          value={`${report.noShow.percent}%`}
          detail={`${report.noShow.noShows} of ${report.noShow.completed + report.noShow.noShows} expected visits; cancellations excluded`}
        />
        <Metric
          label="Booked by patients"
          value={`${report.frontDesk.selfBookedPercent}%`}
          detail={`${report.frontDesk.selfBooked} of ${report.frontDesk.total} visits booked online rather than at the desk`}
        />
        <Metric
          label="Front-desk time returned"
          value={hours(report.frontDesk.estimatedMinutesSaved)}
          detail={`${report.frontDesk.selfBooked} self-booked visits × ${FRONT_DESK_MINUTES_PER_VISIT} min of check-in, rebooking and payment`}
          estimate
        />
      </section>

      <p className="mt-6 text-sm text-clay-600">
        Timings are measured from this platform&rsquo;s own events, so they begin the day the
        feature shipped and cannot be backfilled. The two figures marked as estimates multiply a
        count by the clinic&rsquo;s stated minutes for the paper process — they are what the old
        workflow would have cost, not something measured here.
      </p>
    </AppShell>
  );
}
