import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/// The calendar carries no health information. That is a claim about the code, not a habit,
/// so it is asserted here: the schema has no clinical column, the booking screens have no
/// free-text box to type a symptom into, and the one unauthenticated action reads no chart.

const SRC = path.join(__dirname, '..', '..');
const SCHEMA = path.join(SRC, '..', 'prisma', 'schema.prisma');

/// The Appointment model's own columns, with relation lines removed. A relation to
/// `ClinicalNote` is the intended link between a visit and its encounter; what must never
/// appear is a column on the appointment itself holding clinical detail.
function appointmentColumns(): string {
  const schema = readFileSync(SCHEMA, 'utf8');
  const model = schema.match(/model Appointment \{[^}]*\}/)?.[0] ?? '';
  return model
    .split('\n')
    .filter((line) => !line.includes('@relation') && !line.includes('[]'))
    .join('\n');
}

/// Words that would mean the calendar had started collecting clinical detail.
const CLINICAL_WORDS = [
  'symptom',
  'complaint',
  'reason',
  'diagnosis',
  'condition',
  'pain',
  'treatmentNote',
  'notes',
  'comment',
];

describe('the calendar holds no health information', () => {
  it('has an Appointment model with scheduling columns only', () => {
    const model = appointmentColumns();
    expect(model).toMatch(/startsAt\s+DateTime/);
    for (const word of CLINICAL_WORDS) {
      expect(model.toLowerCase(), word).not.toContain(word.toLowerCase());
    }
  });

  const bookingFiles = [
    path.join(SRC, 'components', 'schedule'),
    path.join(SRC, 'components', 'portal'),
  ].flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => /Booking|SlotPicker/.test(file))
      .map((file) => path.join(dir, file)),
  );

  it('finds the booking screens', () => {
    expect(bookingFiles.length).toBeGreaterThan(2);
  });

  /// A textarea is how a symptom would get in: the booking forms offer none, and their only
  /// free-text inputs are contact details.
  it.each(bookingFiles)('%s offers no free-text clinical field', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/<textarea/);
    const named: string[] = [];
    const naming = /name="([a-zA-Z]+)"/g;
    let match = naming.exec(source);
    while (match) {
      named.push(match[1]);
      match = naming.exec(source);
    }
    const allowed = new Set([
      'firstName',
      'lastName',
      'dateOfBirth',
      'phone',
      'email',
      'decoy',
      'patientId',
      'appointmentId',
      'appointmentTypeId',
      'practitionerId',
      'startsAt',
    ]);
    for (const field of named) {
      expect(allowed.has(field), `${file} posts ${field}`).toBe(true);
    }
  });
});

describe('public booking cannot reach a chart', () => {
  const source = readFileSync(path.join(SRC, 'lib', 'actions', 'publicBooking.ts'), 'utf8');

  /// The whole point: an anonymous caller must not be able to ask a question whose answer
  /// reveals whether somebody is a patient here. Creating a chart is allowed; looking one up
  /// by any identifier is not.
  it('never reads a patient row', () => {
    expect(source).not.toMatch(/prisma\.patient\.(find|update|count|delete)/);
    expect(source).toMatch(/prisma\.patient\.create/);
  });

  it('never touches clinical tables', () => {
    for (const model of ['clinicalNote', 'intakeSubmission', 'intakeForm', 'noteTemplate']) {
      expect(source, model).not.toContain(`prisma.${model}`);
    }
  });

  it('throttles by source address and records the attempt', () => {
    expect(source).toMatch(/bookingAttempt\.count/);
    expect(source).toMatch(/bookingAttempt\.create/);
    expect(source).toMatch(/x-forwarded-for/);
  });

  it('only lets a stranger book a first visit', () => {
    expect(source).toMatch(/publiclyBookable: true, firstVisit: true/);
  });

  it('returns a reference rather than a row id', () => {
    expect(source).toMatch(/slice\(-6\)/);
  });
});
