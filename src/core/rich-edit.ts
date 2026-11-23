/**
 * Pure editing operations on rich text, for the rich text box. No DOM here.
 *
 * Offsets are positions in the plain text, where a line break counts as one character. Ranges are
 * [start, end). Out of bounds offsets are clamped and a reversed range is turned the right way
 * round. Every function returns new, normalized runs and leaves its input alone.
 */
import type { RichText } from './forms';
import type { Mark, TextRun } from './model';
import { normalizeRich } from './rich-text';

/** Number of characters in the plain text, a break counting as one. */
export function plainLength(runs: RichText): number {
  let n = 0;
  for (const run of runs) n += run.kind === 'break' ? 1 : run.text.length;
  return n;
}

function clampRange(runs: RichText, start: number, end: number): [number, number] {
  const max = plainLength(runs);
  const a = Math.min(max, Math.max(0, Math.floor(Math.min(start, end))));
  const b = Math.min(max, Math.max(0, Math.floor(Math.max(start, end))));
  return [a, b];
}

/** The text runs that overlap [start, end), each with the start of its overlap. */
function overlaps(runs: RichText, start: number, end: number): { run: TextRun; from: number }[] {
  const out: { run: TextRun; from: number }[] = [];
  let pos = 0;
  for (const run of runs) {
    const len = run.kind === 'break' ? 1 : run.text.length;
    if (run.kind === 'text') {
      const a = Math.max(start, pos);
      const b = Math.min(end, pos + len);
      if (a < b) out.push({ run: { ...run, text: run.text.slice(a - pos, b - pos) }, from: a });
    }
    pos += len;
  }
  return out;
}

/** Applies `change` to the part of every text run inside [start, end). Splits runs at the edges. */
function mapRange(
  runs: RichText,
  start: number,
  end: number,
  change: (run: TextRun) => TextRun,
): RichText {
  const out: RichText = [];
  let pos = 0;
  for (const run of runs) {
    if (run.kind === 'break') {
      out.push(run);
      pos += 1;
      continue;
    }
    const len = run.text.length;
    const a = Math.max(start, pos) - pos;
    const b = Math.min(end, pos + len) - pos;
    if (a >= b) {
      out.push(run);
    } else {
      if (a > 0) out.push({ ...run, text: run.text.slice(0, a) });
      out.push(change({ ...run, text: run.text.slice(a, b) }));
      if (b < len) out.push({ ...run, text: run.text.slice(b) });
    }
    pos += len;
  }
  return normalizeRich(out);
}

/** The part of the text in [start, end), as runs. */
export function sliceRich(runs: RichText, start: number, end: number): RichText {
  const [a, b] = clampRange(runs, start, end);
  const out: RichText = [];
  let pos = 0;
  for (const run of runs) {
    const len = run.kind === 'break' ? 1 : run.text.length;
    if (pos + len > a && pos < b) {
      if (run.kind === 'break') out.push(run);
      else out.push({ ...run, text: run.text.slice(Math.max(a, pos) - pos, b - pos) });
    }
    pos += len;
  }
  return normalizeRich(out);
}

/** Turns `mark` off when every character in the range has it, otherwise on for all of them. */
export function toggleMark(runs: RichText, start: number, end: number, mark: Mark): RichText {
  const [a, b] = clampRange(runs, start, end);
  const parts = overlaps(runs, a, b);
  if (parts.length === 0) return normalizeRich(runs);
  const all = parts.every((p) => p.run.marks.includes(mark));
  return mapRange(runs, a, b, (run) => ({
    ...run,
    marks: all ? run.marks.filter((m) => m !== mark) : [...new Set([...run.marks, mark])].sort(),
  }));
}

/**
 * The marks that cover the whole range, for the toolbar's pressed buttons. A collapsed cursor
 * takes the marks of the character before it (or after it, at the very start).
 */
export function marksIn(runs: RichText, start: number, end: number): Mark[] {
  const [a, b] = clampRange(runs, start, end);
  const parts =
    a === b ? overlaps(runs, Math.max(0, a - 1), Math.max(0, a - 1) + 1) : overlaps(runs, a, b);
  const first = parts[0];
  if (first === undefined) return [];
  return first.run.marks.filter((m) => parts.every((p) => p.run.marks.includes(m)));
}

export interface LinkInfo {
  href: string;
  start: number;
  end: number;
}

/** Every link in the text as a range. Neighbouring pieces with one address are one link. */
function links(runs: RichText): LinkInfo[] {
  const out: LinkInfo[] = [];
  let pos = 0;
  let open: LinkInfo | null = null;
  for (const run of runs) {
    if (run.kind === 'break' || run.href === undefined) {
      open = null;
      pos += run.kind === 'break' ? 1 : run.text.length;
      continue;
    }
    const len = run.text.length;
    if (len === 0) continue;
    if (open !== null && open.href === run.href && open.end === pos) open.end = pos + len;
    else {
      open = { href: run.href, start: pos, end: pos + len };
      out.push(open);
    }
    pos += len;
  }
  return out;
}

/**
 * The link at a position: the one holding the character at `offset`, or else the one that ends
 * there (so a cursor at the end of a link is still in it). Null when there is none.
 */
export function linkAt(runs: RichText, offset: number): LinkInfo | null {
  const all = links(runs);
  const holds = all.find((l) => l.start <= offset && offset < l.end);
  if (holds) return { ...holds };
  const ends = all.find((l) => l.start < offset && offset <= l.end);
  return ends ? { ...ends } : null;
}

/** Links the text in the range. A cursor inside a link changes that whole link instead. */
export function setLink(runs: RichText, start: number, end: number, href: string): RichText {
  let [a, b] = clampRange(runs, start, end);
  if (a === b) {
    const at = linkAt(runs, a);
    if (at === null) return normalizeRich(runs);
    a = at.start;
    b = at.end;
  }
  return mapRange(runs, a, b, (run) => ({ ...run, href }));
}

/**
 * Takes the link off. Every link the selection touches goes in full, so a link is never left in
 * pieces. A cursor inside a link removes that link.
 */
export function removeLink(runs: RichText, start: number, end: number): RichText {
  const [a, b] = clampRange(runs, start, end);
  const hit =
    a === b
      ? [linkAt(runs, a)].filter((l): l is LinkInfo => l !== null)
      : links(runs).filter((l) => l.start < b && a < l.end);
  let out = normalizeRich(runs);
  for (const l of hit) {
    out = mapRange(out, l.start, l.end, (run) => {
      const bare: TextRun = { kind: 'text', text: run.text, marks: run.marks };
      return bare;
    });
  }
  return out;
}

/** Puts `inserted` where [start, end) was. For a paste or a typed replacement. */
export function replaceRange(
  runs: RichText,
  start: number,
  end: number,
  inserted: RichText,
): RichText {
  const [a, b] = clampRange(runs, start, end);
  return normalizeRich([...sliceRich(runs, 0, a), ...inserted, ...sliceRich(runs, b, Infinity)]);
}
