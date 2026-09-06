import type { IntakeSchema, IntakeSection, SignatureValue } from './types';

/// Answers live merged in the kiosk's client state and split into answers/signatures on the
/// server, so the check reads values through a lookup rather than a fixed shape.
export type AnswerLookup = (key: string) => unknown;

function isSignedSignature(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SignatureValue).dataUrl === 'string' &&
    (value as SignatureValue).dataUrl !== ''
  );
}

/// Labels of everything the patient still has to fill in on one step. The wizard blocks
/// "Save and continue" on this so nobody discovers a blank step-1 field sixteen screens later.
export function missingRequiredInSection(section: IntakeSection, lookup: AnswerLookup): string[] {
  const missing: string[] = [];
  for (const field of section.fields) {
    const value = lookup(field.key);
    if (field.type === 'signature') {
      if (!isSignedSignature(value)) missing.push(field.label);
      continue;
    }
    if (field.type === 'consent') {
      if (value !== true) missing.push('the agreement above');
      continue;
    }
    if ('required' in field && field.required) {
      if (typeof value !== 'string' || value.trim() === '') missing.push(field.label);
    }
  }
  return missing;
}

/// The submit-time check, which names the step each gap is on because the patient may be
/// several screens away from it.
export function missingRequired(schema: IntakeSchema, lookup: AnswerLookup): string[] {
  return schema.sections.flatMap((section) =>
    missingRequiredInSection(section, lookup).map((label) => `${section.title} — ${label}`),
  );
}
