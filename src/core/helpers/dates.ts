/**
 * Dates helper (build spec, section 7.4). Reads the date at the start of a row, works out the year
 * (ADR 0003) and notes when the date was struck through.
 */
import {
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
  return { date, yearAssumed: match.yearAssumed, rest: trimRich(rest) };
}

/** "Sat Nov 21" or "Sat Feb 27 to Sun Feb 28". Empty when the date is not a real day. */
export function dateLabel(date: DateField | undefined): string {
  if (date === undefined || !isValidDate(date.start)) return '';
  if (date.end !== undefined && isValidDate(date.end)) return formatRange(date.start, date.end);
  return formatDate(date.start);
}
