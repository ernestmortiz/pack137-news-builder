/**
 * Field paths into a form, such as ['sections', 1, 'rows', 2, 'date']. Used to check that every
 * "check me" marker points at a real field and to apply a suggestion to one field.
 */
import type { AnnouncementForm, RichText } from '../forms';

type Path = (string | number)[];

function child(value: unknown, key: string | number): unknown {
  if (Array.isArray(value)) return typeof key === 'number' ? (value as unknown[])[key] : undefined;
  if (typeof value === 'object' && value !== null && typeof key === 'string')
    return Object.prototype.hasOwnProperty.call(value, key)
      ? (value as Record<string, unknown>)[key]
      : undefined;
  return undefined;
}

/** The value at a path, or undefined when the path does not lead to a field. */
export function getAt(form: AnnouncementForm, path: Path): unknown {
  let value: unknown = form;
  for (const key of path) value = child(value, key);
  return value;
}

/** True when the path leads to a field of the form. */
export function hasPath(form: AnnouncementForm, path: Path): boolean {
  return path.length > 0 && getAt(form, path) !== undefined;
}

/** Keys that reach an object's prototype. No form field has one of these names. */
const UNSAFE_KEYS = new Set<string | number>(['__proto__', 'constructor', 'prototype']);

/**
 * A copy of the form with the value at `path` replaced. The path must already exist. A path that
 * holds '__proto__', 'constructor' or 'prototype' at any level changes nothing: the copy comes
 * back as it was, so a path from outside can never reach a prototype.
 */
export function setAt(form: AnnouncementForm, path: Path, next: unknown): AnnouncementForm {
  const copy = structuredClone(form);
  if (path.some((key) => UNSAFE_KEYS.has(key))) return copy;
  const last = path[path.length - 1];
  const parent = getAt(copy, path.slice(0, -1));
  if (last === undefined || typeof parent !== 'object' || parent === null) return copy;
  (parent as Record<string | number, unknown>)[last] = next;
  return copy;
}

export function isRichText(value: unknown): value is RichText {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (v) =>
        typeof v === 'object' &&
        v !== null &&
        ((v as { kind?: unknown }).kind === 'text' || (v as { kind?: unknown }).kind === 'break'),
    )
  );
}

export type FormField =
  | { path: Path; kind: 'text'; value: string }
  | { path: Path; kind: 'url'; value: string }
  | { path: Path; kind: 'rich'; value: RichText };

/** Keys that hold a choice, not words the user typed. */
const SKIP = new Set(['layout', 'style', 'strength', 'date']);
const URL_KEYS = new Set(['url', 'src']);

function walk(value: unknown, path: Path, out: FormField[]): void {
  if (typeof value === 'string') {
    const key = path[path.length - 1];
    out.push({ path, kind: typeof key === 'string' && URL_KEYS.has(key) ? 'url' : 'text', value });
    return;
  }
  if (isRichText(value)) {
    out.push({ path, kind: 'rich', value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, [...path, i], out));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, v] of Object.entries(value)) if (!SKIP.has(key)) walk(v, [...path, key], out);
  }
}

/** Every plain text, rich text and link field of a form, with its path. */
export function formFields(form: AnnouncementForm): FormField[] {
  const out: FormField[] = [];
  walk(form, [], out);
  return out;
}
