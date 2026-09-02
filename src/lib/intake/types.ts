export type FieldWidth = 'full' | 'half' | 'third';

export type IntakeField =
  | {
      type: 'text' | 'tel' | 'email' | 'date' | 'textarea';
      key: string;
      label: string;
      required?: boolean;
      placeholder?: string;
      width?: FieldWidth;
    }
  | {
      /// Grid of conditions the patient taps to select, mirroring the "circle if
      /// relevant" sections of the paper form. `withNotes` adds a free-text box
      /// per selected item for the dates/details the paper form asks for.
      type: 'checkboxGrid';
      key: string;
      label?: string;
      options: string[];
      columns?: 2 | 3 | 4;
      withNotes?: boolean;
      width?: FieldWidth;
    }
  | {
      type: 'radio';
      key: string;
      label: string;
      options: string[];
      width?: FieldWidth;
    }
  | {
      type: 'consent';
      key: string;
      label: string;
      body: string;
      acknowledgement: string;
    }
  | {
      type: 'initials';
      key: string;
      label: string;
    }
  | {
      type: 'signature';
      key: string;
      label: string;
    };

export type IntakeSection = {
  key: string;
  title: string;
  description?: string;
  fields: IntakeField[];
};

export type IntakeSchema = {
  slug: string;
  version: number;
  title: string;
  sections: IntakeSection[];
};

export type IntakeAnswers = Record<string, unknown>;

export type SignatureValue = {
  dataUrl: string;
  signedAt: string;
  typedName?: string;
};

export function isCheckboxGridValue(value: unknown): value is { selected: string[]; notes?: Record<string, string> } {
  return typeof value === 'object' && value !== null && Array.isArray((value as { selected?: unknown }).selected);
}
