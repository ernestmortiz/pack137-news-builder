/**
 * Small pure helpers for the Converter screen: matching "check me" markers to fields by path,
 * shortening and capping parse issues, showing a mailto value in full, and date text.
 */
import type { CalendarDate } from '../core/dates';
import { formatDate, isValidDate } from '../core/dates';
import type { FieldPath } from '../core/fill';
import type { FormWarning } from '../core/form-warnings';
import type { Issue } from '../core/model';

export function samePath(a: FieldPath, b: FieldPath): boolean {
  return a.length === b.length && a.every((part, i) => part === b[i]);
}

/** True when `path` is `prefix` itself or sits inside it. */
export function isWithin(path: FieldPath, prefix: FieldPath): boolean {
  return path.length >= prefix.length && prefix.every((part, i) => part === path[i]);
}

/**
 * Items for a field. A marker on the field itself matches, and so does one on a part inside it
 * (a marker on ['sections', 0, 'rows', 1, 'date', 'start'] shows beside the row's date field).
 */
export function itemsFor<T extends { path: FieldPath }>(
  items: readonly T[],
  field: FieldPath,
): T[] {
  return items.filter((item) => isWithin(item.path, field));
}

/** Items whose path is exactly `path`. Used for a whole row or section. */
export function itemsAt<T extends { path: FieldPath }>(items: readonly T[], path: FieldPath): T[] {
  return items.filter((item) => samePath(item.path, path));
}

/** The field a form warning belongs beside, when that is clear from the warning alone. */
export function warningPath(warning: FormWarning): FieldPath | undefined {
  if (warning.code === 'image-no-alt') return ['image', 'alt'];
  if (warning.code === 'button-no-link') {
    if (warning.where === 'Help button') return ['ask', 'button'];
    if (warning.where === 'Second button') return ['secondary'];
    if (warning.where === 'Button') return ['button'];
  }
  return undefined;
}

/* ---------- parse issues ---------- */

export const ISSUE_DETAIL_MAX = 200;
export const ISSUE_LIST_MAX = 20;

/** Shortens long text for display. A hostile paste can carry a 1 MB URL. */
export function shorten(text: string, max = ISSUE_DETAIL_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}... (${text.length - max} more characters)`;
}

export interface ShownIssue {
  message: string;
  detail: string;
}

/** At most `limit` issues, details shortened, plus how many were left out. */
export function capIssues(
  issues: readonly Issue[],
  limit = ISSUE_LIST_MAX,
): { shown: ShownIssue[]; hidden: number } {
  const shown = issues.slice(0, limit).map((issue) => ({
    message: shorten(issue.message),
    detail: issue.detail === undefined ? '' : shorten(issue.detail),
  }));
  return { shown, hidden: Math.max(0, issues.length - limit) };
}

/* ---------- links ---------- */

/**
 * For an email link, the full value in plain words, so a hidden cc or bcc is visible
 * (ADR 0004 UI 4). Returns null for any other kind of link. Never shortens.
 */
export function mailtoSummary(url: string): string | null {
  const value = url.trim();
  if (!/^mailto:/i.test(value)) return null;
  return `Email link, full value: ${value}`;
}

export interface MailLine {
  text: string;
  /** True for a cc or bcc, which should stand out. */
  alert: boolean;
}

function decodePart(raw: string): { text: string; ok: boolean } {
  try {
    return { text: decodeURIComponent(raw), ok: true };
  } catch {
    return { text: raw, ok: false };
  }
}

function addresses(text: string): string[] {
  return text
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a !== '');
}

/**
 * An email link in plain words. The first line is the full raw value. The lines after it are what
 * a mail program will really use: it percent-decodes header names and values (RFC 6068), so
 * `%62cc=` is a hidden bcc. Only the parts that are present are listed. Null for other links.
 */
export function mailtoDetails(url: string): MailLine[] | null {
  const raw = mailtoSummary(url);
  if (raw === null) return null;
  const rest = url.trim().slice('mailto:'.length);
  const q = rest.indexOf('?');
  const head = q === -1 ? rest : rest.slice(0, q);
  const query = q === -1 ? '' : rest.slice(q + 1);
  let undecoded = false;
  const take = (value: string): string => {
    const d = decodePart(value);
    if (!d.ok) undecoded = true;
    return d.text;
  };
  const headers: Record<'to' | 'cc' | 'bcc' | 'subject' | 'body', string[]> = {
    to: addresses(take(head)),
    cc: [],
    bcc: [],
    subject: [],
    body: [],
  };
  for (const pair of query.split('&')) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    const name = take(eq === -1 ? pair : pair.slice(0, eq))
      .trim()
      .toLowerCase();
    const value = take(eq === -1 ? '' : pair.slice(eq + 1));
    if (name === 'to' || name === 'cc' || name === 'bcc') headers[name].push(...addresses(value));
    else if (name === 'subject' || name === 'body') headers[name].push(value);
  }
  const lines: MailLine[] = [{ text: raw, alert: false }];
  if (headers.to.length > 0)
    lines.push({ text: `Sends to: ${headers.to.join(', ')}`, alert: false });
  if (headers.cc.length > 0) {
    lines.push({ text: `Copy (cc): ${headers.cc.join(', ')}`, alert: true });
  }
  if (headers.bcc.length > 0) {
    lines.push({ text: `Hidden copy (bcc): ${headers.bcc.join(', ')}`, alert: true });
  }
  if (headers.subject.length > 0) {
    lines.push({ text: `Subject: ${headers.subject.join(' ')}`, alert: false });
  }
  if (headers.body.length > 0)
    lines.push({ text: `Body: ${headers.body.join(' ')}`, alert: false });
  if (undecoded) {
    lines.push({
      text: 'Part of this link could not be decoded, so it is shown as written. Check it carefully.',
      alert: true,
    });
  }
  return lines;
}

/* ---------- dates ---------- */

/** "Sat Nov 21, 2026", so an assumed year is visible beside the field. */
export function dateWithYear(date: CalendarDate): string {
  return isValidDate(date) ? `${formatDate(date)}, ${date.year}` : 'Not a real date';
}

/** "2026-11-21", the value of a date input. */
export function toIsoDate(date: CalendarDate): string {
  const p = (n: number, width: number): string => String(n).padStart(width, '0');
  return `${p(date.year, 4)}-${p(date.month, 2)}-${p(date.day, 2)}`;
}

/** Reads a date input value. Returns undefined for an empty or unreal date. */
export function fromIsoDate(value: string): CalendarDate | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m === null) return undefined;
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return isValidDate(date) ? date : undefined;
}

/* ---------- keeping markers on the right row ---------- */

/** The array index a path uses under `arrayPath`, or undefined when the path is elsewhere. */
function indexUnder(path: FieldPath, arrayPath: FieldPath): number | undefined {
  if (!isWithin(path, arrayPath)) return undefined;
  const index = path[arrayPath.length];
  return typeof index === 'number' ? index : undefined;
}

function withIndex(path: FieldPath, at: number, index: number): FieldPath {
  return path.map((part, i) => (i === at ? index : part));
}

/**
 * After two neighbouring entries of the array at `arrayPath` swap places, moves each marker with
 * its entry. Updates the paths in place, so a marker keeps its identity, and returns the list.
 */
export function remapAfterSwap<T extends { path: FieldPath }>(
  items: T[],
  arrayPath: FieldPath,
  a: number,
  b: number,
): T[] {
  for (const item of items) {
    const index = indexUnder(item.path, arrayPath);
    if (index === a) item.path = withIndex(item.path, arrayPath.length, b);
    else if (index === b) item.path = withIndex(item.path, arrayPath.length, a);
  }
  return items;
}

/** After the entry at `removed` leaves the array at `arrayPath`: drops its markers, closes the gap. */
export function remapAfterRemove<T extends { path: FieldPath }>(
  items: T[],
  arrayPath: FieldPath,
  removed: number,
): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const index = indexUnder(item.path, arrayPath);
    if (index === removed) continue;
    if (index !== undefined && index > removed) {
      item.path = withIndex(item.path, arrayPath.length, index - 1);
    }
    kept.push(item);
  }
  return kept;
}
