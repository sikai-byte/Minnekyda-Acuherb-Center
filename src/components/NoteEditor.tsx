'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { NoteFormState } from '@/lib/actions/notes';
import {
  NOTE_FIELD_LABELS,
  NOTE_GROUPS,
  NOTE_TEXT_FIELDS,
  composeNoteText,
  type NoteControl,
  type StructuredNote,
} from '@/lib/notes/structure';

export type NoteTemplateOption = {
  id: string;
  name: string;
  description: string | null;
  presets: StructuredNote;
};

const initialState: NoteFormState = {};

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-[44px] rounded-full border px-4 text-sm transition-colors ${
        selected
          ? 'border-moss-600 bg-moss-600 text-white'
          : 'border-clay-200 bg-white text-clay-700 active:bg-clay-100'
      }`}
    >
      {label}
    </button>
  );
}

function ControlField({
  control,
  value,
  onChange,
}: {
  control: NoteControl;
  value: string[] | number | string | undefined;
  onChange: (next: string[] | number | string | undefined) => void;
}) {
  if (control.type === 'chips') {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (option: string) => {
      if (control.single) {
        onChange(selected[0] === option ? undefined : [option]);
        return;
      }
      onChange(
        selected.includes(option)
          ? selected.filter((item) => item !== option)
          : [...selected, option],
      );
    };
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="label">{control.label}</span>
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="text-xs text-clay-500 underline"
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {control.options.map((option) => (
            <Chip
              key={option}
              label={option}
              selected={selected.includes(option)}
              onClick={() => toggle(option)}
            />
          ))}
        </div>
      </div>
    );
  }

  if (control.type === 'scale') {
    const active = typeof value === 'number';
    const step = control.step ?? 1;
    const shown = active ? (value as number) : Math.round((control.min + control.max) / 2 / step) * step;
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="label">{control.label}</span>
          {active ? (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="text-xs text-clay-500 underline"
            >
              Not recorded
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-4">
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={step}
            value={shown}
            onChange={(event) => onChange(Number(event.target.value))}
            className={`h-11 flex-1 ${active ? 'accent-moss-600' : 'accent-clay-300'}`}
            aria-label={control.label}
          />
          <span
            className={`w-20 shrink-0 text-right text-lg font-semibold tabular-nums ${
              active ? 'text-clay-800' : 'text-clay-400'
            }`}
          >
            {active ? `${shown}${control.suffix}` : '—'}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-xs text-clay-500">
          <span>{control.ends[0]}</span>
          <span>{control.ends[1]}</span>
        </div>
        {active ? null : (
          <p className="mt-1 text-xs text-clay-500">Not recorded — drag the slider to set a value.</p>
        )}
      </div>
    );
  }

  return (
    <label className="block">
      <span className="label">{control.label}</span>
      <textarea
        rows={2}
        className="input"
        placeholder={control.placeholder ?? 'Optional — only if the taps above miss something'}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-3 border-t border-clay-200 bg-linen-50/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
      <button
        type="submit"
        name="intent"
        value="save"
        className="btn-secondary min-h-[48px] flex-1"
        disabled={pending}
      >
        {pending ? 'Saving…' : 'Save draft'}
      </button>
      <button
        type="submit"
        name="intent"
        value="sign"
        className="btn-primary min-h-[48px] flex-1"
        disabled={pending}
      >
        Sign and lock
      </button>
    </div>
  );
}

export function NoteEditor({
  action,
  templates,
  visitDate: initialVisitDate,
  templateId: initialTemplateId,
  structured: initialStructured,
}: {
  action: (prev: NoteFormState, formData: FormData) => Promise<NoteFormState>;
  templates: NoteTemplateOption[];
  visitDate: string;
  templateId: string;
  structured: StructuredNote;
}) {
  const [state, formAction] = useFormState(action, initialState);
  const [visitDate, setVisitDate] = useState(initialVisitDate);
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [structured, setStructured] = useState<StructuredNote>(initialStructured);
  const [openGroups, setOpenGroups] = useState<string[]>([NOTE_GROUPS[0].key]);
  const [showPreview, setShowPreview] = useState(false);

  const preview = useMemo(() => composeNoteText(structured), [structured]);

  const setControl = (id: string, next: string[] | number | string | undefined) =>
    setStructured((previous) => {
      const copy = { ...previous };
      const empty =
        next === undefined ||
        (Array.isArray(next) && next.length === 0) ||
        (typeof next === 'string' && !next.trim());
      if (empty) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  /// Applying a template only fills controls left untouched, so switching templates
  /// mid-note never clears what the practitioner already tapped.
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setStructured((previous) => {
      const next = { ...previous };
      for (const [controlId, value] of Object.entries(template.presets)) {
        if (next[controlId] === undefined) next[controlId] = value;
      }
      return next;
    });
  };

  /// Groups open independently: a practitioner working through a visit often wants the
  /// complaint and the treatment side by side.
  const toggleGroup = (key: string, header: HTMLElement) => {
    const opening = !openGroups.includes(key);
    setOpenGroups((previous) =>
      opening ? [...previous, key] : previous.filter((item) => item !== key),
    );
    if (opening) {
      requestAnimationFrame(() => header.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  };

  const countFor = (groupKey: string) =>
    NOTE_GROUPS.find((group) => group.key === groupKey)?.controls.filter(
      (control) => structured[control.id] !== undefined,
    ).length ?? 0;

  return (
    <form action={formAction} className="space-y-4 pb-24">
      {state?.error ? <p className="field-error">{state.error}</p> : null}
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="structured" value={JSON.stringify(structured)} />

      <div className="card grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Visit date</span>
          <input
            type="date"
            name="visitDate"
            className="input min-h-[48px]"
            value={visitDate}
            onChange={(event) => setVisitDate(event.target.value)}
            required
          />
        </label>
        <div>
          <span className="label">Template</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip label="No template" selected={!templateId} onClick={() => setTemplateId('')} />
            {templates.map((template) => (
              <Chip
                key={template.id}
                label={template.name}
                selected={templateId === template.id}
                onClick={() => applyTemplate(template.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {NOTE_GROUPS.map((group) => {
        const open = openGroups.includes(group.key);
        const count = countFor(group.key);
        return (
          <section key={group.key} className="card p-0">
            <button
              type="button"
              onClick={(event) => toggleGroup(group.key, event.currentTarget)}
              className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 text-left"
            >
              <span className="flex items-center gap-2">
                <span className="text-base font-semibold text-clay-800">{group.title}</span>
                {count > 0 ? (
                  <span className="badge bg-moss-100 text-moss-700">{count}</span>
                ) : null}
              </span>
              <span className="text-clay-400">{open ? '▲' : '▼'}</span>
            </button>
            {open ? (
              <div className="space-y-5 border-t border-clay-100 px-4 pb-20 pt-4">
                {group.hint ? <p className="text-sm text-clay-500">{group.hint}</p> : null}
                {group.controls.map((control) => (
                  <ControlField
                    key={control.id}
                    control={control}
                    value={structured[control.id]}
                    onChange={(next) => setControl(control.id, next)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}

      <section className="card p-0">
        <button
          type="button"
          onClick={() => setShowPreview((previous) => !previous)}
          className="flex min-h-[56px] w-full items-center justify-between px-4 text-left"
        >
          <span className="text-base font-semibold text-clay-800">Note preview</span>
          <span className="text-clay-400">{showPreview ? '▲' : '▼'}</span>
        </button>
        {showPreview ? (
          <div className="space-y-3 border-t border-clay-100 px-4 py-4">
            {NOTE_TEXT_FIELDS.map((field) =>
              preview[field] ? (
                <div key={field}>
                  <h3 className="text-xs uppercase tracking-wide text-clay-500">
                    {NOTE_FIELD_LABELS[field]}
                  </h3>
                  <p className="whitespace-pre-line text-clay-800">{preview[field]}</p>
                </div>
              ) : null,
            )}
            {Object.values(preview).every((value) => !value) ? (
              <p className="text-sm text-clay-500">Nothing recorded yet.</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <Buttons />
      <p className="text-xs text-clay-500">
        Signing locks the note. Later corrections are recorded as an amendment that preserves the
        original.
      </p>
    </form>
  );
}
