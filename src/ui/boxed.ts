/**
 * Keeps the Message form's `boxed` list lined up with its `paragraphs` list (owner decision
 * 2026-11-22). `boxed[i]` belongs to `paragraphs[i]`; a missing entry means no box. Every helper
 * edits the form in place and leaves `boxed` out when no paragraph is boxed, so a form nobody
 * styled stays exactly as it was.
 */
import type { MessageForm } from '../core/forms';
import { moveItem } from './paths';

type Boxable = Pick<MessageForm, 'paragraphs' | 'boxed'>;

/** True when paragraph `index` is in a box. */
export function isBoxed(form: Boxable, index: number): boolean {
  return form.boxed?.[index] === true;
}

/** Drops trailing false entries, and the whole list when nothing is boxed. */
function tidy(form: Boxable, list: boolean[]): void {
  while (list.length > 0 && list[list.length - 1] !== true) list.pop();
  if (list.length === 0) delete form.boxed;
  else form.boxed = list;
}

/** A copy of `boxed`, one entry per paragraph. */
function padded(form: Boxable): boolean[] {
  return form.paragraphs.map((_p, i) => form.boxed?.[i] === true);
}

/** Boxes or unboxes paragraph `index`. */
export function setBoxed(form: Boxable, index: number, on: boolean): void {
  if (index < 0 || index >= form.paragraphs.length) return;
  const list = padded(form);
  list[index] = on;
  tidy(form, list);
}

/**
 * Call after `paragraphs` had the entry at `from` moved to `to` (the box setting went unmoved).
 * Moves the box setting the same way.
 */
export function boxedMoved(form: Boxable, from: number, to: number): void {
  if (form.boxed === undefined) return;
  const list = form.paragraphs.map((_p, i) => form.boxed?.[i] === true);
  moveItem(list, from, to);
  tidy(form, list);
}

/** Call after the entry at `index` was taken out of `paragraphs`. Removes its box setting too. */
export function boxedRemoved(form: Boxable, index: number): void {
  if (form.boxed === undefined) return;
  const list = form.boxed.slice(0, form.paragraphs.length + 1);
  if (index < list.length) list.splice(index, 1);
  tidy(
    form,
    list.map((v) => v === true),
  );
}
