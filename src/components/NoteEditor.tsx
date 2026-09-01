'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { NoteFormState } from '@/lib/actions/notes';

export type NoteTemplateOption = {
  id: string;
  name: string;
  description: string | null;
  fields: Record<string, string>;
};

export type NoteDraft = {
  visitDate: string;
  chiefComplaint: string;
  subjective: string;
  objective: string;
  tcmDiagnosis: string;
  assessment: string;
  plan: string;
  pointsUsed: string;
  herbFormula: string;
  templateId: string;
};

const SECTIONS: { key: keyof NoteDraft; label: string; rows: number; hint?: string }[] = [
  { key: 'chiefComplaint', label: 'Chief complaint', rows: 2 },
  { key: 'subjective', label: 'Subjective', rows: 5 },
  { key: 'objective', label: 'Objective (tongue, pulse, palpation)', rows: 5 },
  { key: 'tcmDiagnosis', label: 'TCM diagnosis', rows: 2 },
  { key: 'assessment', label: 'Assessment', rows: 3 },
  { key: 'plan', label: 'Plan', rows: 3 },
  { key: 'pointsUsed', label: 'Points and techniques used', rows: 3 },
  { key: 'herbFormula', label: 'Herbal formula', rows: 3 },
];

const initialState: NoteFormState = {};

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <button type="submit" name="intent" value="save" className="btn-secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Save draft'}
      </button>
      <button type="submit" name="intent" value="sign" className="btn-primary" disabled={pending}>
        Sign and lock
      </button>
    </div>
  );
}

export function NoteEditor({
  action,
  templates,
  draft,
}: {
  action: (prev: NoteFormState, formData: FormData) => Promise<NoteFormState>;
  templates: NoteTemplateOption[];
  draft: NoteDraft;
}) {
  const [state, formAction] = useFormState(action, initialState);
  const [values, setValues] = useState<NoteDraft>(draft);

  /// Applying a template only fills sections the practitioner has left empty, so
  /// switching templates mid-note never destroys typed text.
  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    setValues((previous) => {
      if (!template) return { ...previous, templateId: '' };
      const next = { ...previous, templateId };
      for (const [key, text] of Object.entries(template.fields)) {
        const field = key as keyof NoteDraft;
        if (field in next && !String(next[field] ?? '').trim()) {
          next[field] = text;
        }
      }
      return next;
    });
  };

  const update = (key: keyof NoteDraft, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <p className="field-error">{state.error}</p> : null}
      <input type="hidden" name="templateId" value={values.templateId} />

      <div className="card grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Visit date</span>
          <input
            type="date"
            name="visitDate"
            className="input"
            value={values.visitDate}
            onChange={(event) => update('visitDate', event.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="label">Template</span>
          <select
            className="input"
            value={values.templateId}
            onChange={(event) => applyTemplate(event.target.value)}
          >
            <option value="">No template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card space-y-4">
        {SECTIONS.map((section) => (
          <label key={section.key} className="block">
            <span className="label">{section.label}</span>
            <textarea
              name={section.key}
              rows={section.rows}
              className="input"
              value={String(values[section.key] ?? '')}
              onChange={(event) => update(section.key, event.target.value)}
            />
          </label>
        ))}
      </div>

      <Buttons />
      <p className="text-xs text-clay-500">
        Signing locks the note. Later corrections are recorded as an amendment that preserves the
        original.
      </p>
    </form>
  );
}
