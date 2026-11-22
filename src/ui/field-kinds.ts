/**
 * Which fields get the device's built-in spell checker (owner decision, Option 1). Free text is
 * checked. Addresses, emails, links, numbers, dates, times, the paste box and the code boxes are
 * not, because the checker would underline every one of them. No dictionary is shipped and
 * nothing leaves the device.
 */
export type FieldKind =
  /** Words people write: labels, titles, paragraphs, notes, captions, alt text, names, roles. */
  | 'text'
  | 'address'
  | 'email'
  | 'url'
  | 'number'
  | 'date'
  | 'time'
  /** The paste box and the read-only code boxes. */
  | 'code';

export function spellcheckFor(kind: FieldKind): boolean {
  return kind === 'text';
}

/** Sets `spellcheck` explicitly (true or false) so the browser never has to guess. */
export function markSpelling<T extends HTMLElement>(control: T, kind: FieldKind): T {
  control.spellcheck = spellcheckFor(kind);
  return control;
}

/** The kind that an input's `type` attribute stands for. Anything unknown counts as text. */
export function kindOfInputType(type: string): FieldKind {
  switch (type) {
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    case 'number':
      return 'number';
    case 'date':
    case 'time':
    case 'datetime-local':
    case 'month':
    case 'week':
      return type === 'time' ? 'time' : 'date';
    default:
      return 'text';
  }
}
