/**
 * Small pure text tools shared by the fill stage and its helpers (build spec, section 7.4).
 * Positions are counted on `textOf(runs)`, where a line break counts as one space.
 */
import type { RichText } from '../forms';
import type { Inline, Mark, TextRun } from '../model';

// Built from its code point so this file holds no em dash itself.
export const EM_DASH = String.fromCharCode(0x2014);
const EM_DASH_RUN = new RegExp(`\\s*${EM_DASH}\\s*`, 'g');

/** The plain text of a line. A line break reads as a space. */
export function textOf(runs: Inline[]): string {
  return runs.map((r) => (r.kind === 'text' ? r.text : ' ')).join('');
}

/** Collapses every run of whitespace to one space and trims the ends. */
export function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** One unformatted run, or nothing for empty text. */
export function plain(text: string, marks: Mark[] = []): RichText {
  return text === '' ? [] : [{ kind: 'text', text, marks: [...marks] }];
}

/** A message for the user: em dashes (from quoted pasted text) become commas. */
export function sentence(message: string): string {
  return message.replace(EM_DASH_RUN, ', ');
}

function copyRun(run: TextRun, text: string): TextRun {
  const out: TextRun = { kind: 'text', text, marks: [...run.marks] };
  if (run.href !== undefined) out.href = run.href;
  return out;
}

/** The part of a line between two text positions. Runs are copied, never shared. */
export function sliceRich(runs: Inline[], start: number, end = Number.POSITIVE_INFINITY): Inline[] {
  const out: Inline[] = [];
  let pos = 0;
  for (const run of runs) {
    if (run.kind === 'break') {
      if (pos >= start && pos < end) out.push({ kind: 'break' });
      pos += 1;
      continue;
    }
    const from = Math.max(start - pos, 0);
    const to = Math.min(end - pos, run.text.length);
    if (to > from) out.push(copyRun(run, run.text.slice(from, to)));
    pos += run.text.length;
  }
  return out;
}

const isBlank = (run: Inline) => run.kind === 'break' || run.text.trim() === '';

/** Drops blank runs and line breaks at both ends and trims the outer spaces. */
export function trimRich(runs: Inline[]): Inline[] {
  let first = 0;
  let last = runs.length - 1;
  while (first <= last && isBlank(runs[first] as Inline)) first++;
  while (last >= first && isBlank(runs[last] as Inline)) last--;
  const out = runs
    .slice(first, last + 1)
    .map((r): Inline => (r.kind === 'break' ? { kind: 'break' } : copyRun(r, r.text)));
  const head = out[0];
  if (head?.kind === 'text') head.text = head.text.trimStart();
  const tail = out[out.length - 1];
  if (tail?.kind === 'text') tail.text = tail.text.trimEnd();
  return out;
}

/** Splits a line at its line breaks. Empty lines are dropped. */
export function splitLines(runs: Inline[]): Inline[][] {
  const lines: Inline[][] = [[]];
  for (const run of runs) {
    if (run.kind === 'break') lines.push([]);
    else (lines[lines.length - 1] as Inline[]).push(run);
  }
  return lines.map(trimRich).filter((line) => line.length > 0);
}

/** Joins lines into one rich text with a line break between them. */
export function joinLines(lines: Inline[][]): Inline[] {
  const out: Inline[] = [];
  for (const line of lines) {
    if (line.length === 0) continue;
    if (out.length > 0) out.push({ kind: 'break' });
    out.push(...line);
  }
  return out;
}

export interface LinkSpan {
  text: string;
  href: string;
  /** Text positions of the link within `textOf(runs)`. */
  start: number;
  end: number;
}

/** The links of a line, in order. Neighbouring runs with the same destination are one link. */
export function linksOf(runs: Inline[]): LinkSpan[] {
  const out: LinkSpan[] = [];
  let pos = 0;
  let open: LinkSpan | undefined;
  for (const run of runs) {
    const length = run.kind === 'text' ? run.text.length : 1;
    if (run.kind === 'text' && run.href !== undefined && run.text !== '') {
      if (open !== undefined && open.href === run.href && open.end === pos) {
        open.text += run.text;
        open.end = pos + length;
      } else {
        open = { text: run.text, href: run.href, start: pos, end: pos + length };
        out.push(open);
      }
    }
    pos += length;
  }
  return out.filter((link) => link.text.trim() !== '');
}

/** True when the line is one link and nothing else but arrows, bullets or punctuation. */
export function isLinkOnly(runs: Inline[]): boolean {
  const links = linksOf(runs);
  if (links.length !== 1) return false;
  const outside = runs
    .map((r) => (r.kind === 'text' && r.href === undefined ? r.text : ''))
    .join('');
  return !/[\p{L}\p{N}]/u.test(outside);
}

/** Capitalizes the first letter. */
export function capitalize(text: string): string {
  return text.replace(
    /^(\P{L}*)(\p{L})/u,
    (_m, lead: string, ch: string) => lead + ch.toUpperCase(),
  );
}
