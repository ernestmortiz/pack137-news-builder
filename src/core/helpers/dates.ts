/**
 * Dates helper (build spec, section 7.4). Reads the date at the start of a row, works out the year
 * (ADR 0003), notes when the date was struck through and notes a pasted weekday that does not
 * match the date.
 */
import {
  findDate,
  formatDate,
  formatRange,
  isValidDate,
  matchLeadingDate,
  type CalendarDate,
} from '../dates';
import type { DateField } from '../forms';
import type { Inline } from '../model';
import { sliceRich, textOf, trimRich } from './text';

export interface DateOptions {
  today: CalendarDate;
  programYearStartMonth: number;
}

export interface RowDate {
  date: DateField;
  /** The year was not written. The form marks the date so the user can check it. */
  yearAssumed: boolean;
  /** The line after the date, with any separator such as ":" or "-" removed. */
  rest: Inline[];
  /**
   * Each weekday written in the paste that is not the weekday of its date, in order: the first
   * day, then the last day of a range. Empty when every written weekday is right or none is written.
   */
  weekdayMismatches: WeekdayMismatch[];
}

/** A weekday written in the paste that is not the weekday of the date beside it. */
export interface WeekdayMismatch {
  /** The weekday as pasted, without a closing full stop or comma: "Mon", "Tues", "Monday". */
  said: string;
  /** The date it was written beside, with the year that was written or chosen. */
  date: CalendarDate;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

/** The weekday spellings that matchLeadingDate in ../dates reads, as whole words. */
const WEEKDAY_WORDS =
  /(?<![a-z])(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?(?![a-z])/gi;

/** 0 for Sunday to 6 for Saturday. Worked out in UTC, so the device's time zone plays no part. */
function dayOfWeek(d: CalendarDate): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

/**
 * Compares the weekdays written in the date text (`raw`, as matchLeadingDate returns it) with the
 * dates that were read. A weekday at the very start belongs to the first day. One written later,
 * after the range word, belongs to the last day. `raw` is a few words at most.
 */
function weekdayMismatches(raw: string, date: DateField): WeekdayMismatch[] {
  const out: WeekdayMismatch[] = [];
  for (const m of raw.matchAll(WEEKDAY_WORDS)) {
    const target = m.index === 0 ? date.start : date.end;
    if (target === undefined) continue;
    const said = m[0];
    if (DAY_KEYS.indexOf(said.slice(0, 3).toLowerCase()) !== dayOfWeek(target))
      out.push({ said, date: { ...target } });
  }
  return out;
}

/** "The paste said Mon, but Jan 16, 2027 is a Saturday. Check the date." */
export function weekdayMismatchMessage(mismatch: WeekdayMismatch): string {
  const { said, date } = mismatch;
  const day = `${MONTH_NAMES[date.month - 1] ?? ''} ${date.day}, ${date.year}`;
  return `The paste said ${said}, but ${day} is a ${DAY_NAMES[dayOfWeek(date)] ?? ''}. Check the date.`;
}

/** True when every visible character between the two positions is struck through. */
function isStruck(runs: Inline[], start: number, end: number): boolean {
  const part = sliceRich(runs, start, end).filter((r) => r.kind === 'text' && r.text.trim() !== '');
  return part.length > 0 && part.every((r) => r.kind === 'text' && r.marks.includes('strike'));
}

/** Reads a date at the very start of a line. Null when the line does not begin with one. */
export function readLeadingDate(runs: Inline[], options: DateOptions): RowDate | null {
  const text = textOf(runs);
  const match = matchLeadingDate(text, options.today, options.programYearStartMonth);
  if (match === null) return null;
  const lead = text.length - text.trimStart().length;
  const end = lead + match.raw.length;

  const date: DateField = { start: match.start };
  if (match.end !== undefined) date.end = match.end;
  if (isStruck(runs, lead, end)) date.struck = true;

  const rest = trimRich(sliceRich(runs, end));
  const head = rest[0];
  if (head?.kind === 'text' && head.href === undefined) {
    head.text = head.text.replace(/^[\s:;,–-]+/, '');
  }
  return {
    date,
    yearAssumed: match.yearAssumed,
    rest: trimRich(rest),
    weekdayMismatches: weekdayMismatches(match.raw, date),
  };
}

/**
 * A date written inside a row's line rather than at its start, as in
 * "Den Meeting - Dec 16th 6:15pm - Fun On The Run" (owner report, 2026-11-23). The date comes out
 * of the line and the words around it close up: "Den Meeting - 6:15pm - Fun On The Run". A link
 * keeps its place, since the line is cut as rich text.
 */
export function readInlineDate(runs: Inline[], options: DateOptions): RowDate | null {
  const text = textOf(runs);
  const match = findDate(text, options.today, options.programYearStartMonth);
  if (match === null) return null;
  // "on Dec 16" loses the "on" with the date.
  const lead = /\b(?:on|this|next)\s+$/i.exec(text.slice(0, match.index));
  const start = lead === null ? match.index : lead.index;
  const end = match.index + match.raw.length;

  const date: DateField = { start: match.start };
  if (match.end !== undefined) date.end = match.end;
  if (isStruck(runs, match.index, end)) date.struck = true;

  const before = trimRich(sliceRich(runs, 0, start));
  const after = trimRich(sliceRich(runs, end));
  const tail = before[before.length - 1];
  // A separator left dangling at either side ("Meeting - " + " - Fun") is kept once, not twice.
  if (tail?.kind === 'text' && tail.href === undefined) {
    const head = after[0];
    if (head?.kind === 'text' && head.href === undefined && /^[–-]/.test(head.text.trimStart()))
      tail.text = tail.text.replace(/\s*[–-]\s*$/, '');
  }
  const rest =
    before.length === 0
      ? after
      : after.length === 0
        ? before
        : [...before, { kind: 'text' as const, text: ' ', marks: [] }, ...after];
  const first = rest[0];
  if (first?.kind === 'text' && first.href === undefined)
    first.text = first.text.replace(/^[\s:;,–-]+/, '');
  return {
    date,
    yearAssumed: match.yearAssumed,
    rest: trimRich(rest),
    weekdayMismatches: weekdayMismatches(match.raw, date),
  };
}

/** "Sat Nov 21" or "Sat Feb 27 to Sun Feb 28". Empty when the date is not a real day. */
export function dateLabel(date: DateField | undefined): string {
  if (date === undefined || !isValidDate(date.start)) return '';
  if (date.end !== undefined && isValidDate(date.end)) return formatRange(date.start, date.end);
  return formatDate(date.start);
}
