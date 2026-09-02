/// The note editor is a tap-first form: practitioners pick from chips, sliders and
/// selectors instead of typing prose. Selections live in `ClinicalNote.fieldsJson`
/// (`structured`), and `composeNoteText` renders them into the same text columns the
/// chart and printed note have always read, so nothing downstream changes.

export type NoteTextField =
  | 'chiefComplaint'
  | 'subjective'
  | 'objective'
  | 'tcmDiagnosis'
  | 'assessment'
  | 'plan'
  | 'pointsUsed'
  | 'herbFormula';

export const NOTE_TEXT_FIELDS: NoteTextField[] = [
  'chiefComplaint',
  'subjective',
  'objective',
  'tcmDiagnosis',
  'assessment',
  'plan',
  'pointsUsed',
  'herbFormula',
];

export const NOTE_FIELD_LABELS: Record<NoteTextField, string> = {
  chiefComplaint: 'Chief complaint',
  subjective: 'Subjective',
  objective: 'Objective',
  tcmDiagnosis: 'TCM diagnosis',
  assessment: 'Assessment',
  plan: 'Plan',
  pointsUsed: 'Points and techniques',
  herbFormula: 'Herbal formula',
};

export type ControlValue = string[] | number | string;

export type StructuredNote = Record<string, ControlValue>;

export type NoteControl =
  | {
      type: 'chips';
      id: string;
      label: string;
      target: NoteTextField;
      options: string[];
      /// Single-select chips behave like a segmented control (tapping again clears).
      single?: boolean;
    }
  | {
      type: 'scale';
      id: string;
      label: string;
      target: NoteTextField;
      min: number;
      max: number;
      step?: number;
      suffix: string;
      /// Captions shown under the two ends of the track.
      ends: [string, string];
    }
  | {
      type: 'text';
      id: string;
      label: string;
      target: NoteTextField;
      placeholder?: string;
      /// Rendered without a `Label:` prefix — used for the free-text catch-all.
      bare?: boolean;
    };

export type NoteGroup = {
  key: string;
  title: string;
  hint?: string;
  controls: NoteControl[];
};

export const NOTE_GROUPS: NoteGroup[] = [
  {
    key: 'complaint',
    title: 'Chief complaint',
    controls: [
      {
        type: 'chips',
        id: 'complaintArea',
        label: 'Area',
        target: 'chiefComplaint',
        options: [
          'Neck',
          'Shoulder',
          'Upper back',
          'Low back',
          'Hip',
          'Knee',
          'Ankle / foot',
          'Elbow / wrist',
          'Headache',
          'Digestion',
          'Sleep',
          'Stress / anxiety',
          'Fatigue',
          'Menstrual',
          'Allergies',
          'Immune support',
        ],
      },
      {
        type: 'chips',
        id: 'complaintSide',
        label: 'Side',
        target: 'chiefComplaint',
        options: ['Left', 'Right', 'Bilateral', 'Midline'],
        single: true,
      },
      {
        type: 'scale',
        id: 'painNow',
        label: 'Pain now',
        target: 'chiefComplaint',
        min: 0,
        max: 10,
        suffix: '/10',
        ends: ['No pain', 'Worst imaginable'],
      },
      {
        type: 'scale',
        id: 'painWorst',
        label: 'Pain at worst this week',
        target: 'chiefComplaint',
        min: 0,
        max: 10,
        suffix: '/10',
        ends: ['No pain', 'Worst imaginable'],
      },
      {
        type: 'chips',
        id: 'duration',
        label: 'Duration',
        target: 'chiefComplaint',
        options: ['New today', '< 1 week', '1–4 weeks', '1–3 months', '3–12 months', '> 1 year'],
        single: true,
      },
      { type: 'text', id: 'complaintOther', label: 'Add detail', target: 'chiefComplaint', bare: true },
    ],
  },
  {
    key: 'subjective',
    title: 'Subjective',
    hint: 'Ten questions — tap what applies.',
    controls: [
      {
        type: 'chips',
        id: 'sinceLastVisit',
        label: 'Since last visit',
        target: 'subjective',
        options: ['Much better', 'Better', 'No change', 'Worse', 'Much worse', 'First visit'],
        single: true,
      },
      {
        type: 'chips',
        id: 'painQuality',
        label: 'Pain quality',
        target: 'subjective',
        options: [
          'Dull',
          'Achy',
          'Sharp',
          'Stabbing',
          'Burning',
          'Throbbing',
          'Cramping',
          'Heavy',
          'Stiff',
          'Numbness',
          'Tingling',
          'Radiating',
        ],
      },
      {
        type: 'chips',
        id: 'aggravating',
        label: 'Aggravated by',
        target: 'subjective',
        options: ['Cold', 'Damp', 'Heat', 'Movement', 'Rest', 'Sitting', 'Standing', 'Lifting', 'Stress', 'Screens', 'Mornings', 'Evenings'],
      },
      {
        type: 'chips',
        id: 'relieving',
        label: 'Relieved by',
        target: 'subjective',
        options: ['Heat', 'Cold', 'Movement', 'Rest', 'Massage', 'Pressure', 'Stretching', 'Nothing'],
      },
      {
        type: 'chips',
        id: 'sleep',
        label: 'Sleep',
        target: 'subjective',
        options: ['Sleeps well', 'Hard to fall asleep', 'Wakes at night', 'Early waking', 'Vivid dreams', 'Unrefreshed', 'Night pain'],
      },
      {
        type: 'chips',
        id: 'energy',
        label: 'Energy',
        target: 'subjective',
        options: ['Good', 'Low in morning', 'Afternoon dip', 'Tired after meals', 'Exhausted', 'Wired but tired'],
      },
      {
        type: 'chips',
        id: 'digestion',
        label: 'Appetite and digestion',
        target: 'subjective',
        options: ['Normal', 'Bloating', 'Gas', 'Reflux', 'Nausea', 'Poor appetite', 'Strong appetite', 'Sugar cravings'],
      },
      {
        type: 'chips',
        id: 'elimination',
        label: 'Bowels and urination',
        target: 'subjective',
        options: ['Normal', 'Constipation', 'Loose stools', 'Alternating', 'Urgency', 'Frequent urination', 'Night urination'],
      },
      {
        type: 'chips',
        id: 'temperature',
        label: 'Temperature and sweat',
        target: 'subjective',
        options: ['Runs cold', 'Runs hot', 'Cold hands and feet', 'Sweats easily', 'Night sweats', 'Hot flashes', 'Little sweat'],
      },
      {
        type: 'chips',
        id: 'mood',
        label: 'Mood and stress',
        target: 'subjective',
        options: ['Calm', 'Stressed', 'Anxious', 'Irritable', 'Low mood', 'Foggy', 'Overwhelmed'],
      },
      {
        type: 'chips',
        id: 'gynecology',
        label: 'Menstrual',
        target: 'subjective',
        options: ['Not applicable', 'Regular', 'Irregular', 'Cramping', 'Clots', 'Heavy', 'Light', 'PMS', 'Spotting', 'Pregnant'],
      },
      { type: 'text', id: 'subjectiveOther', label: 'Add detail', target: 'subjective', bare: true },
    ],
  },
  {
    key: 'objective',
    title: 'Objective',
    controls: [
      {
        type: 'chips',
        id: 'tongueBody',
        label: 'Tongue body',
        target: 'objective',
        options: ['Pale', 'Pink', 'Red', 'Dark red', 'Purple', 'Dusky', 'Red tip', 'Red sides'],
      },
      {
        type: 'chips',
        id: 'tongueShape',
        label: 'Tongue shape',
        target: 'objective',
        options: ['Normal', 'Swollen', 'Thin', 'Scalloped', 'Cracked', 'Quivering', 'Deviated', 'Curled'],
      },
      {
        type: 'chips',
        id: 'tongueCoat',
        label: 'Tongue coat',
        target: 'objective',
        options: ['Thin white', 'Thick white', 'Yellow', 'Greasy', 'Dry', 'Wet', 'Peeled', 'No coat'],
      },
      {
        type: 'chips',
        id: 'pulseQuality',
        label: 'Pulse',
        target: 'objective',
        options: ['Wiry', 'Slippery', 'Thin', 'Weak', 'Rapid', 'Slow', 'Deep', 'Floating', 'Choppy', 'Tight', 'Soggy', 'Full'],
      },
      {
        type: 'chips',
        id: 'pulsePosition',
        label: 'Pulse notable at',
        target: 'objective',
        options: ['Left cun', 'Left guan', 'Left chi', 'Right cun', 'Right guan', 'Right chi'],
      },
      {
        type: 'chips',
        id: 'palpation',
        label: 'Palpation',
        target: 'objective',
        options: [
          'Trapezius tension',
          'Paraspinal tightness',
          'Trigger points',
          'Nodules',
          'Tender to light pressure',
          'Warm to touch',
          'Cool to touch',
          'Swelling',
          'No findings',
        ],
      },
      {
        type: 'chips',
        id: 'rangeOfMotion',
        label: 'Range of motion',
        target: 'objective',
        options: ['Full', 'Mildly limited', 'Moderately limited', 'Severely limited', 'Painful at end range', 'Guarding'],
        single: true,
      },
      { type: 'text', id: 'objectiveOther', label: 'Add detail', target: 'objective', bare: true },
    ],
  },
  {
    key: 'diagnosis',
    title: 'Diagnosis and assessment',
    controls: [
      {
        type: 'chips',
        id: 'pattern',
        label: 'Pattern',
        target: 'tcmDiagnosis',
        options: [
          'Liver qi stagnation',
          'Qi and blood stagnation',
          'Spleen qi deficiency',
          'Damp-heat',
          'Phlegm-damp',
          'Blood deficiency',
          'Kidney yin deficiency',
          'Kidney yang deficiency',
          'Liver yang rising',
          'Heart shen disturbance',
          'Wind-cold invasion',
          'Wind-damp bi syndrome',
          'Cold bi syndrome',
          'Yin deficiency with empty heat',
        ],
      },
      {
        type: 'chips',
        id: 'channels',
        label: 'Channels involved',
        target: 'tcmDiagnosis',
        options: ['LU', 'LI', 'ST', 'SP', 'HT', 'SI', 'BL', 'KI', 'PC', 'TH', 'GB', 'LR', 'Du', 'Ren'],
      },
      {
        type: 'chips',
        id: 'progress',
        label: 'Progress',
        target: 'assessment',
        options: ['Improving as expected', 'Improving slowly', 'Plateau', 'Flare', 'Resolved', 'New presentation'],
        single: true,
      },
      {
        type: 'scale',
        id: 'improvement',
        label: 'Overall improvement to date',
        target: 'assessment',
        min: 0,
        max: 100,
        step: 10,
        suffix: '%',
        ends: ['No change', 'Resolved'],
      },
      { type: 'text', id: 'assessmentOther', label: 'Add detail', target: 'assessment', bare: true },
    ],
  },
  {
    key: 'treatment',
    title: 'Treatment given',
    controls: [
      {
        type: 'chips',
        id: 'points',
        label: 'Points',
        target: 'pointsUsed',
        options: [
          'LI4',
          'LI11',
          'LI15',
          'LU7',
          'ST36',
          'ST25',
          'ST44',
          'SP6',
          'SP9',
          'SP10',
          'HT7',
          'SI3',
          'SI11',
          'BL13',
          'BL23',
          'BL40',
          'BL57',
          'BL60',
          'KI3',
          'KI6',
          'PC6',
          'TH5',
          'GB20',
          'GB21',
          'GB30',
          'GB34',
          'LR3',
          'LR14',
          'Du4',
          'Du14',
          'Du20',
          'Ren4',
          'Ren6',
          'Ren12',
          'Yintang',
          'Taiyang',
          'Anmian',
          'Baxie',
          'Huatuojiaji',
          'Ear shenmen',
        ],
      },
      {
        type: 'chips',
        id: 'technique',
        label: 'Technique',
        target: 'pointsUsed',
        options: ['Even', 'Tonify', 'Reduce', 'Electro-stim', 'Moxa', 'Cupping', 'Gua sha', 'Tuina', 'Auricular', 'Dry needling'],
      },
      {
        type: 'scale',
        id: 'retention',
        label: 'Needle retention',
        target: 'pointsUsed',
        min: 5,
        max: 45,
        step: 5,
        suffix: ' min',
        ends: ['5 min', '45 min'],
      },
      {
        type: 'chips',
        id: 'tolerance',
        label: 'Tolerance',
        target: 'pointsUsed',
        options: ['Tolerated well', 'Mild discomfort', 'Needle sensitive', 'Lightheaded', 'Deeply relaxed', 'Fell asleep'],
        single: true,
      },
      { type: 'text', id: 'treatmentOther', label: 'Add detail', target: 'pointsUsed', bare: true },
    ],
  },
  {
    key: 'plan',
    title: 'Plan',
    controls: [
      {
        type: 'chips',
        id: 'frequency',
        label: 'Frequency',
        target: 'plan',
        options: ['2x per week', '1x per week', 'Every other week', 'Monthly', 'As needed'],
        single: true,
      },
      {
        type: 'chips',
        id: 'followUp',
        label: 'Return in',
        target: 'plan',
        options: ['3 days', '1 week', '2 weeks', '3 weeks', '4 weeks', '6 weeks'],
        single: true,
      },
      {
        type: 'chips',
        id: 'homeCare',
        label: 'Home care',
        target: 'plan',
        options: [
          'Heat to area',
          'Ice to area',
          'Stretching',
          'Walking',
          'Hydration',
          'Breathing exercises',
          'Reduce cold and raw foods',
          'Reduce caffeine',
          'Reduce sugar',
          'Earlier bedtime',
          'Epsom salt bath',
          'Reduce screen time',
        ],
      },
      {
        type: 'chips',
        id: 'referral',
        label: 'Referral',
        target: 'plan',
        options: ['None', 'Primary care', 'Physical therapy', 'Imaging', 'Massage', 'Mental health'],
        single: true,
      },
      { type: 'text', id: 'planOther', label: 'Add detail', target: 'plan', bare: true },
    ],
  },
  {
    key: 'herbs',
    title: 'Herbs',
    controls: [
      {
        type: 'chips',
        id: 'formula',
        label: 'Formula',
        target: 'herbFormula',
        options: [
          'None dispensed',
          'Xiao Yao San',
          'Si Ni San',
          'Gui Pi Tang',
          'Bu Zhong Yi Qi Tang',
          'Liu Wei Di Huang Wan',
          'Ba Zhen Tang',
          'Er Chen Tang',
          'Yin Qiao San',
          'Tian Wang Bu Xin Dan',
          'Du Huo Ji Sheng Tang',
          'Ping Wei San',
        ],
        single: true,
      },
      {
        type: 'chips',
        id: 'formulaForm',
        label: 'Form',
        target: 'herbFormula',
        options: ['Granules', 'Raw herbs', 'Patent pills', 'Tincture', 'Topical'],
        single: true,
      },
      {
        type: 'chips',
        id: 'dosing',
        label: 'Dosing',
        target: 'herbFormula',
        options: ['1x daily', '2x daily', '3x daily', 'As needed'],
        single: true,
      },
      {
        type: 'chips',
        id: 'supply',
        label: 'Supply',
        target: 'herbFormula',
        options: ['1 week', '2 weeks', '3 weeks', '1 month'],
        single: true,
      },
      {
        type: 'text',
        id: 'formulaOther',
        label: 'Modifications and cautions',
        target: 'herbFormula',
        bare: true,
      },
    ],
  },
];

export const CONTROLS_BY_ID: Record<string, NoteControl> = Object.fromEntries(
  NOTE_GROUPS.flatMap((group) => group.controls.map((control) => [control.id, control])),
);

/// The `bare` text control each section ends with, so legacy free-text notes can be
/// loaded back into the editor without losing anything.
export const FREE_TEXT_CONTROL_BY_FIELD: Partial<Record<NoteTextField, string>> = Object.fromEntries(
  NOTE_GROUPS.flatMap((group) =>
    group.controls
      .filter((control): control is Extract<NoteControl, { type: 'text' }> => control.type === 'text' && control.bare === true)
      .map((control) => [control.target, control.id]),
  ),
) as Partial<Record<NoteTextField, string>>;

function renderControl(control: NoteControl, value: ControlValue | undefined): string | null {
  if (value === undefined || value === null) return null;

  if (control.type === 'scale') {
    if (typeof value !== 'number') return null;
    return `${control.label}: ${value}${control.suffix}`;
  }

  if (control.type === 'text') {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return null;
    return control.bare ? text : `${control.label}: ${text}`;
  }

  const selected = Array.isArray(value) ? value.filter(Boolean) : typeof value === 'string' ? [value] : [];
  if (selected.length === 0) return null;
  return `${control.label}: ${selected.join(', ')}`;
}

/// Renders the tapped selections into the note's text columns, one `Label: values`
/// line per control, in the order the editor presents them.
export function composeNoteText(structured: StructuredNote): Record<NoteTextField, string> {
  const lines: Record<NoteTextField, string[]> = {
    chiefComplaint: [],
    subjective: [],
    objective: [],
    tcmDiagnosis: [],
    assessment: [],
    plan: [],
    pointsUsed: [],
    herbFormula: [],
  };

  for (const group of NOTE_GROUPS) {
    for (const control of group.controls) {
      const rendered = renderControl(control, structured[control.id]);
      if (rendered) lines[control.target].push(rendered);
    }
  }

  return Object.fromEntries(
    NOTE_TEXT_FIELDS.map((field) => [field, lines[field].join('\n')]),
  ) as Record<NoteTextField, string>;
}

/// Rebuilds the editor state for an existing draft. Notes written before the tap-first
/// editor have prose but no selections, so their text is loaded into each section's
/// free-text control instead of being discarded.
export function structuredFromNote(
  fieldsJson: unknown,
  text: Partial<Record<NoteTextField, string | null>>,
): StructuredNote {
  const stored =
    typeof fieldsJson === 'object' && fieldsJson !== null && !Array.isArray(fieldsJson)
      ? (fieldsJson as { structured?: unknown }).structured
      : undefined;
  if (isStructuredNote(stored)) return stored;

  const migrated: StructuredNote = {};
  for (const field of NOTE_TEXT_FIELDS) {
    const value = text[field]?.trim();
    const controlId = FREE_TEXT_CONTROL_BY_FIELD[field];
    if (value && controlId) migrated[controlId] = value;
  }
  return migrated;
}

/// Templates preselect chips and sliders rather than pre-typing prose.
export function templatePresets(fieldsJson: unknown): StructuredNote {
  const presets =
    typeof fieldsJson === 'object' && fieldsJson !== null && !Array.isArray(fieldsJson)
      ? (fieldsJson as { presets?: unknown }).presets
      : undefined;
  return isStructuredNote(presets) ? presets : {};
}

export function isStructuredNote(value: unknown): value is StructuredNote {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    (entry) =>
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      (Array.isArray(entry) && entry.every((item) => typeof item === 'string')),
  );
}
