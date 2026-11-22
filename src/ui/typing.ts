/**
 * A typed change stored as only what changed (no DOM here). A step in a 5 MB field must not hold
 * the 5 MB text twice, so the history keeps where the change starts, the text it removed and the
 * text it put in. Undo and redo rebuild the field's text from its current value.
 */
import type { FieldPath } from '../core/fill';

export interface TypingChange {
  path: FieldPath;
  /** Length of the text before the change that stays the same. */
  start: number;
  removed: string;
  inserted: string;
  /** Selections are [start, end] in the field's text. */
  selBefore: [number, number];
  selAfter: [number, number];
}

/** The change that turns `before` into `after`: common start and common end are left out. */
export function toChange(edit: {
  path: FieldPath;
  before: string;
  after: string;
  selBefore: [number, number];
  selAfter: [number, number];
}): TypingChange {
  const { before, after } = edit;
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let tail = 0;
  while (
    tail < max - start &&
    before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)
  )
    tail++;
  return {
    path: edit.path,
    start,
    removed: before.slice(start, before.length - tail),
    inserted: after.slice(start, after.length - tail),
    selBefore: edit.selBefore,
    selAfter: edit.selAfter,
  };
}

/** The text before the change, from the text after it. */
export function textBefore(
  current: string,
  c: Pick<TypingChange, 'start' | 'removed' | 'inserted'>,
): string {
  return current.slice(0, c.start) + c.removed + current.slice(c.start + c.inserted.length);
}

/** The text after the change, from the text before it. */
export function textAfter(
  current: string,
  c: Pick<TypingChange, 'start' | 'removed' | 'inserted'>,
): string {
  return current.slice(0, c.start) + c.inserted + current.slice(c.start + c.removed.length);
}

/** Rough stored size of a change, for the history's byte budget. */
export function changeBytes(c: TypingChange): number {
  return c.removed.length + c.inserted.length + JSON.stringify(c.path).length + 64;
}
