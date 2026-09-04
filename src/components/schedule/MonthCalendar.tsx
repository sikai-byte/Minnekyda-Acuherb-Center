'use client';

import { useMemo } from 'react';
import { monthGrid, monthOf, shiftMonth } from '@/lib/scheduling/calendar';

/// A month of clinic days, with the ones worth clicking on marked as such.
///
/// Everything here is arithmetic on `YYYY-MM-DD` strings in the clinic's own timezone, never
/// on the browser's calendar: a patient booking from another timezone late at night must not
/// be shown a different month to the one the clinic is in. Which days are open is decided by
/// the server and passed in; this component never works out availability for itself.

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

type MonthCalendarProps = {
  /// `YYYY-MM`, the month on screen.
  month: string;
  /// `YYYY-MM-DD`, the chosen day, or empty.
  value: string;
  /// The days that have something free. Null while the server is still answering, which is
  /// drawn as "not yet known" rather than as "nothing open".
  openDays: string[] | null;
  min: string;
  max: string;
  onSelect: (isoDate: string) => void;
  onMonthChange: (month: string) => void;
};

export function MonthCalendar({
  month,
  value,
  openDays,
  min,
  max,
  onSelect,
  onMonthChange,
}: MonthCalendarProps) {
  const open = useMemo(() => (openDays ? new Set(openDays) : null), [openDays]);

  const cells = useMemo(() => monthGrid(month), [month]);

  const canGoBack = month > monthOf(min);
  const canGoForward = month < monthOf(max);

  return (
    <div className="rounded-xl border border-clay-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-lg px-3 text-clay-700 hover:bg-clay-100 disabled:opacity-30"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          disabled={!canGoBack}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span aria-live="polite" className="text-sm font-semibold text-clay-800">
          {MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`))}
        </span>
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-lg px-3 text-clay-700 hover:bg-clay-100 disabled:opacity-30"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          disabled={!canGoForward}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-clay-500">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={index} aria-hidden>
            {label}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((isoDate, index) => {
          if (!isoDate) return <span key={`blank-${index}`} />;
          const inRange = isoDate >= min && isoDate <= max;
          /// Unknown availability stays clickable: the day's own times are the real answer,
          /// and a slow month query should not hide a day that is in fact free.
          const bookable = inRange && (open === null || open.has(isoDate));
          const selected = isoDate === value;
          return (
            <button
              key={isoDate}
              type="button"
              onClick={() => onSelect(isoDate)}
              disabled={!bookable}
              aria-pressed={selected}
              aria-label={isoDate}
              className={`min-h-11 rounded-lg border text-sm ${
                selected
                  ? 'border-moss-600 bg-moss-600 font-semibold text-white'
                  : bookable
                    ? 'border-clay-200 bg-white text-clay-800 hover:border-moss-400'
                    : 'cursor-not-allowed border-transparent bg-clay-50 text-clay-300'
              }`}
            >
              {Number(isoDate.slice(-2))}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-clay-500">
        {open === null ? 'Checking which days are open…' : 'Greyed days have nothing open.'}
      </p>
    </div>
  );
}
