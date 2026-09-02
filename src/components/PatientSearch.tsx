'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { searchPatients, type PatientSearchResult } from '@/lib/actions/patientSearch';
import { age, formatDate, patientName } from '@/lib/format';
import { StartIntakeButton } from './StartIntakeButton';

/// 'kiosk' offers each match a Start intake button; 'chart' links through to the chart.
export function PatientSearch({
  mode,
  placeholder,
  autoFocus,
}: {
  mode: 'kiosk' | 'chart';
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PatientSearchResult[] | null>(null);
  const [searched, setSearched] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = term.trim();
    if (!query) {
      setResults(null);
      setSearched('');
      return;
    }
    startTransition(async () => {
      setResults(await searchPatients(query));
      setSearched(query);
    });
  };

  return (
    <div>
      {/* Posted, not navigated: a patient's name must never appear in a URL. */}
      <form className="flex flex-wrap gap-2" onSubmit={submit}>
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={placeholder}
          className="input max-w-sm"
          autoFocus={autoFocus}
        />
        <button type="submit" className="btn-secondary" disabled={pending}>
          {pending ? 'Searching…' : 'Search'}
        </button>
        {results ? (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setTerm('');
              setResults(null);
              setSearched('');
            }}
          >
            Clear
          </button>
        ) : null}
        <Link href="/patients/new" className="btn-ghost">
          New patient
        </Link>
      </form>

      {results && results.length === 0 ? (
        <p className="mt-6 text-sm text-clay-600">
          No patients match “{searched}”.{' '}
          <Link href="/patients/new" className="underline">
            Add them first
          </Link>
          .
        </p>
      ) : null}

      {results && results.length > 0 ? (
        <div className="mt-6 space-y-3">
          {results.map((patient) => (
            <div key={patient.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-medium">
                  {mode === 'chart' ? (
                    <Link href={`/patients/${patient.id}`} className="hover:underline">
                      {patientName(patient)}
                    </Link>
                  ) : (
                    patientName(patient)
                  )}
                </p>
                <p className="text-sm text-clay-600">
                  {formatDate(patient.dateOfBirth)} · age {age(patient.dateOfBirth)}
                  {patient.phone ? ` · ${patient.phone}` : ''}
                </p>
              </div>
              {mode === 'kiosk' ? (
                <StartIntakeButton patientId={patient.id} />
              ) : (
                <Link href={`/patients/${patient.id}`} className="btn-secondary">
                  Open chart
                </Link>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
