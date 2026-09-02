import { describe, expect, it } from 'vitest';
import {
  COMPOSED_TEXT_FIELDS,
  NOTE_TEXT_FIELDS,
  composeNoteText,
  structuredFromNote,
  templatePresets,
} from './structure';

const legacyNote = {
  chiefComplaint: 'Low back pain',
  subjective: 'Sleeping poorly, worse in the morning',
  objective: 'Tongue pale with thin white coat',
  tcmDiagnosis: 'Kidney yang deficiency with damp cold',
  assessment: 'Improving slowly',
  plan: 'Weekly acupuncture, review in a month',
  pointsUsed: 'BL23, BL40, GV4',
  herbFormula: 'You Gui Wan, granules',
};

describe('note composition', () => {
  /// Regression guard for the data-loss bug: a text column with no editor control would be
  /// blanked on save, which is a chart alteration, not a UI bug.
  it('gives every text column a free-text control', () => {
    expect([...COMPOSED_TEXT_FIELDS].sort()).toEqual([...NOTE_TEXT_FIELDS].sort());
  });

  it('round-trips a pre-tap-first note without losing any column', () => {
    const structured = structuredFromNote(null, legacyNote);
    const composed = composeNoteText(structured);

    for (const field of NOTE_TEXT_FIELDS) {
      expect(composed[field], field).toContain(legacyNote[field]);
    }
  });

  it('survives a second save unchanged', () => {
    const once = composeNoteText(structuredFromNote(null, legacyNote));
    const twice = composeNoteText(structuredFromNote({ structured: structuredFromNote(null, legacyNote) }, once));
    expect(twice).toEqual(once);
  });

  it('prefers stored selections over the rendered text', () => {
    const stored = { painNow: 4, sleep: ['Wakes at night'] };
    expect(structuredFromNote({ structured: stored }, legacyNote)).toEqual(stored);
  });

  it('renders scales and chips as labelled lines', () => {
    const composed = composeNoteText({ painNow: 7 });
    const rendered = Object.values(composed).join('\n');
    expect(rendered).toMatch(/7\/10/);
  });

  it('ignores template presets that are not structured selections', () => {
    expect(templatePresets({ presets: { retention: 20 } })).toEqual({ retention: 20 });
    expect(templatePresets({ presets: 'freeform' })).toEqual({});
    expect(templatePresets(null)).toEqual({});
  });
});
