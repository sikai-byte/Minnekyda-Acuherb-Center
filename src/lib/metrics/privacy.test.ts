import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/// Telemetry is the one table written on every clinical action, so what it is allowed to hold
/// is asserted rather than intended: identifiers and timings, and nothing a person said.

const ROOT = path.join(__dirname, '..', '..', '..');
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');

const ALLOWED_FIELDS = [
  'id',
  'type',
  'occurredAt',
  'durationMs',
  'patientId',
  'userId',
  'appointmentId',
  'submissionId',
  'noteId',
  'appointmentTypeId',
  'roomId',
  'source',
  'minutes',
];

function clinicEventModel(): string {
  const schema = readFileSync(SCHEMA, 'utf8');
  const model = schema.match(/model ClinicEvent \{[\s\S]*?\n\}/)?.[0];
  expect(model, 'ClinicEvent model').toBeTruthy();
  return model!;
}

describe('the telemetry table holds no clinical content', () => {
  it('declares only allow-listed fields', () => {
    const fields: string[] = [];
    const declaration = /^\s{2}(\w+)\s+\w/gm;
    let match = declaration.exec(clinicEventModel());
    while (match) {
      fields.push(match[1]);
      match = declaration.exec(clinicEventModel());
    }

    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(ALLOWED_FIELDS, `unexpected telemetry column: ${field}`).toContain(field);
    }
  });

  it('is indexed for the date-range reads the reports do', () => {
    expect(clinicEventModel()).toMatch(/@@index\(\[occurredAt\]\)/);
  });

  it('writes nothing beyond those fields', () => {
    const source = readFileSync(path.join(ROOT, 'src', 'lib', 'telemetry.ts'), 'utf8');
    const write = source.match(/data: \{[\s\S]*?\n      \}/)?.[0] ?? '';
    expect(write).toBeTruthy();
    const written: string[] = [];
    const assignment = /(\w+):/g;
    let match = assignment.exec(write);
    while (match) {
      written.push(match[1]);
      match = assignment.exec(write);
    }
    for (const field of written.filter((name) => name !== 'data')) {
      expect(ALLOWED_FIELDS, `telemetry writes ${field}`).toContain(field);
    }
  });

  /// A count of notes is operational; a word of one is not. The report layer may read timings
  /// and statuses only, never a note or an intake answer.
  it('reads no clinical text in the report layer', () => {
    for (const file of ['report.ts', 'clinic.ts']) {
      const source = readFileSync(path.join(ROOT, 'src', 'lib', 'metrics', file), 'utf8');
      expect(source).not.toMatch(/clinicalNote|intakeSubmission|fieldsJson|answersJson/);
    }
  });

  it('keeps names out of the operations report', () => {
    const source = readFileSync(
      path.join(ROOT, 'src', 'app', 'admin', 'metrics', 'page.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/patientName|firstName|lastName/);
  });
});
