import { describe, expect, it } from 'vitest';
import { missingRequired, missingRequiredInSection } from './required';
import type { IntakeSchema, IntakeSection } from './types';

const identity: IntakeSection = {
  key: 'identity',
  title: 'About you',
  fields: [
    { type: 'text', key: 'firstName', label: 'First name', required: true },
    { type: 'date', key: 'dob', label: 'Birthday', required: true },
    { type: 'tel', key: 'phone', label: 'Phone' },
  ],
};

const consent: IntakeSection = {
  key: 'consent',
  title: 'Consent to treat',
  fields: [
    { type: 'consent', key: 'consentTreat', label: 'Consent', body: '…', acknowledgement: 'I agree' },
    { type: 'signature', key: 'consentSignature', label: 'Signature' },
  ],
};

const schema: IntakeSchema = {
  slug: 'test',
  version: 1,
  title: 'Test intake',
  sections: [identity, consent],
};

function lookup(values: Record<string, unknown>) {
  return (key: string) => values[key];
}

describe('required intake fields', () => {
  it('names the gaps on the step the patient is on', () => {
    expect(missingRequiredInSection(identity, lookup({ firstName: 'Ada' }))).toEqual(['Birthday']);
  });

  it('treats whitespace as unanswered and ignores optional fields', () => {
    expect(missingRequiredInSection(identity, lookup({ firstName: '  ', dob: '1990-01-01' }))).toEqual([
      'First name',
    ]);
    expect(
      missingRequiredInSection(identity, lookup({ firstName: 'Ada', dob: '1990-01-01' })),
    ).toEqual([]);
  });

  it('requires the consent tick and a drawn signature', () => {
    expect(missingRequiredInSection(consent, lookup({}))).toEqual(['the agreement above', 'Signature']);
    expect(
      missingRequiredInSection(
        consent,
        lookup({ consentTreat: true, consentSignature: { dataUrl: '', signedAt: 'now' } }),
      ),
    ).toEqual(['Signature']);
    expect(
      missingRequiredInSection(
        consent,
        lookup({ consentTreat: true, consentSignature: { dataUrl: 'data:image/png;base64,x', signedAt: 'now' } }),
      ),
    ).toEqual([]);
  });

  it('prefixes the step title when checking the whole form at submit', () => {
    expect(missingRequired(schema, lookup({ firstName: 'Ada', dob: '1990-01-01' }))).toEqual([
      'Consent to treat — the agreement above',
      'Consent to treat — Signature',
    ]);
  });
});
