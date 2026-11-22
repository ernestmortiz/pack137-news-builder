/**
 * Small pure text tools shared by the fill stage and its helpers (build spec, section 7.4).
 * Positions are counted on `textOf(runs)`, where a line break counts as one space.
 */
import type { RichText } from '../forms';
import type { Inline, Mark, TextRun } from '../model';

// Built from its code point so this file holds no em dash itself.
export const EM_DASH = String.fromCharCode(0x2014);

/*
 * The scans below are written as loops, not as regexes. A regex that starts or ends with a
 * repeated class (whitespace then a dash, or separators up to the end of the text) tries again
 * from every position of a long run and takes time that grows with the square of the text, which
 * froze the tab on a large paste (tests/unit/fill-perf.test.ts).
 */

/** True when the UTF-16 code unit is whitespace, exactly as the regex class \s reads it. */
export function isSpaceCode(code: number): boolean {
  if (code === 0x20) return true;
  if (code < 0xa0) return code >= 0x09 && code <= 0x0d;
  return (
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/** Whitespace or one of , ; : - and the en dash: what may sit between a name and a tag or note. */
export function isSeparatorCode(code: number): boolean {
  return (
    code === 0x2c ||
    code === 0x3b ||
    code === 0x3a ||
    code === 0x2d ||
    code === 0x2013 ||
    isSpaceCode(code)
  );
}

/** Removes separators (see isSeparatorCode) from both ends. */
export function trimSeparators(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isSeparatorCode(text.charCodeAt(start))) start++;
  while (end > start && isSeparatorCode(text.charCodeAt(end - 1))) end--;
  return text.slice(start, end);
}

/** Every em dash, with the whitespace on both sides of it, becomes ", ". */
export function emDashesToCommas(text: string): string {
  let at = text.indexOf(EM_DASH);
  if (at < 0) return text;
  let out = '';
  let pos = 0;
  while (at >= 0) {
    let from = at;
    while (from > pos && isSpaceCode(text.charCodeAt(from - 1))) from--;
    let to = at + 1;
    while (isSpaceCode(text.charCodeAt(to))) to++;
    out += text.slice(pos, from) + ', ';
    pos = to;
    at = text.indexOf(EM_DASH, pos);
  }
  return out + text.slice(pos);
}

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
  return emDashesToCommas(message);
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
    // One at a time: a spread of a very long line overflows the call stack.
    for (const run of line) out.push(run);
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
