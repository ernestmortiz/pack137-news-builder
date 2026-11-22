/** Pure helpers for the Settings screen and the draft choices. No DOM here. */
import type { MonthOfYear } from '../core/dates';
import { formatMonthYear } from '../core/dates';
import type { DraftFile } from '../core/draft';
import { emptyLetter } from '../core/letter';
import type { LetterForm } from '../core/letter';
import {
  defaultSettings,
  type PackSettings,
  type SettingsProblem,
  type StandingLink,
} from '../core/settings';
import { mailtoDetails, mailtoSummary, type MailLine } from './paths';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** The month after `m`, rolling over the year. */
export function monthAfter(m: MonthOfYear): MonthOfYear {
  return m.month >= 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 };
}

/** `pack137-letter-2026-12.json` for the December 2026 issue. */
export function draftFileName(issue: MonthOfYear): string {
  const year = String(Math.trunc(issue.year)).padStart(4, '0');
  const month = String(Math.trunc(issue.month)).padStart(2, '0');
  return `pack137-letter-${year}-${month}.json`;
}

export type StartChoiceId = 'keep' | 'next' | 'blank';

export interface StartChoice {
  id: StartChoiceId;
  label: string;
  /** The issue month the letter will have after this choice. For 'blank' the caller decides. */
  issue?: MonthOfYear;
}

/** The three choices offered when a saved draft is found (spec 8.3). */
export function startChoices(saved: DraftFile): StartChoice[] {
  const next = monthAfter(saved.letter.issue);
  return [
    {
      id: 'keep',
      label: `Keep working on the ${formatMonthYear(saved.letter.issue)} letter`,
      issue: saved.letter.issue,
    },
    { id: 'next', label: `Start ${formatMonthYear(next)} from it`, issue: next },
    { id: 'blank', label: 'Start a blank letter' },
  ];
}

/** Messages for one setting, by its path. */
export function problemsAt(
  problems: readonly SettingsProblem[],
  path: readonly (string | number)[],
): string[] {
  return problems
    .filter((p) => p.path.length === path.length && p.path.every((part, i) => part === path[i]))
    .map((p) => p.message);
}

/** Problems whose path is not one of the fields on screen, so none of them is lost. */
export function otherProblems(problems: readonly SettingsProblem[]): string[] {
  const known = (path: SettingsProblem['path']): boolean => {
    const [a, b, c] = path;
    if (path.length === 1)
      return ['logoUrl', 'photoFormUrl', 'yearAtAGlanceUrl', 'programYearStartMonth'].includes(
        String(a),
      );
    if (path.length === 2)
      return a === 'email' && (b === 'contact' || b === 'volunteer' || b === 'feedback');
    if (path.length === 3)
      return a === 'standingLinks' && typeof b === 'number' && (c === 'label' || c === 'url');
    return false;
  };
  return problems.filter((p) => !known(p.path)).map((p) => p.message);
}

/** The full link each email setting produces in the letter (ADR 0004 UI 4). */
export function emailLinks(
  settings: PackSettings,
  letterFeedback?: FeedbackText,
): { key: 'contact' | 'volunteer' | 'feedback'; text: string }[] {
  return mailLinkValues(settings, letterFeedback).map(({ key, link }) => ({
    key,
    text: mailtoSummary(link) ?? link,
  }));
}

/** The subject and body of the feedback link, as typed in the letter. */
export interface FeedbackText {
  subject: string;
  body: string;
}

/** Each email setting's full link plus the decoded breakdown a mail program would use (N3). */
export function emailLinkDetails(
  settings: PackSettings,
  letterFeedback?: FeedbackText,
): { key: 'contact' | 'volunteer' | 'feedback'; lines: MailLine[] }[] {
  return mailLinkValues(settings, letterFeedback).map(({ key, link }) => ({
    key,
    lines: mailtoDetails(link) ?? [{ text: link, alert: false }],
  }));
}

function mailLinkValues(
  settings: PackSettings,
  letterFeedback?: FeedbackText,
): { key: 'contact' | 'volunteer' | 'feedback'; link: string }[] {
  const feedback = letterFeedback ?? emptyLetter({ year: 2000, month: 1 }, settings).feedback;
  const query = [
    feedback.subject !== '' ? `subject=${encodeURIComponent(feedback.subject)}` : '',
    feedback.body !== '' ? `body=${encodeURIComponent(feedback.body)}` : '',
  ].filter((p) => p !== '');
  const links = {
    contact: `mailto:${settings.email.contact}`,
    volunteer: `mailto:${settings.email.volunteer}?subject=I%20can%20help`,
    feedback: `mailto:${settings.email.feedback}${query.length > 0 ? '?' + query.join('&') : ''}`,
  };
  return (['contact', 'volunteer', 'feedback'] as const).map((key) => ({
    key,
    link: links[key],
  }));
}

/** A copy of `links` with the entry at `from` moved to `to`. Out of range returns an unchanged copy. */
export function moveLink(links: readonly StandingLink[], from: number, to: number): StandingLink[] {
  const copy = links.map((l) => ({ ...l }));
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  if (item) copy.splice(to, 0, item);
  return copy;
}

/** "8:41 pm" from a Date, for "Saved on this device at 8:41 pm". */
export function clockText(when: Date): string {
  const hour = when.getHours();
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(when.getMinutes()).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
}

/* ---------- opening a draft: what its settings would change (S1, S2) ---------- */

export interface SettingDifference {
  /** "Logo address: your value -> draft value", in full. */
  text: string;
  /** For web addresses, the host each side really goes to, in ASCII (punycode). Empty otherwise. */
  hostText: string;
}

/** The host of a web address in ASCII form (a lookalike shows as xn--...), or null when it has none. */
export function asciiHost(address: string): string | null {
  try {
    const url = new URL(address.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.hostname;
  } catch {
    return null;
  }
}

const shown = (value: string): string => (value === '' ? '(empty)' : value);

function webDifference(label: string, mine: string, theirs: string): SettingDifference | null {
  if (mine === theirs) return null;
  const a = asciiHost(mine);
  const b = asciiHost(theirs);
  return {
    text: `${label}: ${shown(mine)} -> ${shown(theirs)}`,
    hostText: a === null && b === null ? '' : `Site: ${a ?? '(none)'} -> ${b ?? '(none)'}`,
  };
}

function plainDifference(label: string, mine: string, theirs: string): SettingDifference | null {
  return mine === theirs
    ? null
    : { text: `${label}: ${shown(mine)} -> ${shown(theirs)}`, hostText: '' };
}

/** Every setting that differs between yours and a draft's, in plain words and in full. */
export function settingsDifferences(mine: PackSettings, theirs: PackSettings): SettingDifference[] {
  const out: (SettingDifference | null)[] = [
    webDifference('Logo address', mine.logoUrl, theirs.logoUrl),
    plainDifference('Contact email', mine.email.contact, theirs.email.contact),
    plainDifference('Volunteer email', mine.email.volunteer, theirs.email.volunteer),
    plainDifference('Feedback email', mine.email.feedback, theirs.email.feedback),
    webDifference('Photo form address', mine.photoFormUrl, theirs.photoFormUrl),
    webDifference('Year at a glance address', mine.yearAtAGlanceUrl, theirs.yearAtAGlanceUrl),
    plainDifference(
      'Program year starts in',
      MONTH_NAMES[mine.programYearStartMonth - 1] ?? String(mine.programYearStartMonth),
      MONTH_NAMES[theirs.programYearStartMonth - 1] ?? String(theirs.programYearStartMonth),
    ),
  ];
  const count = Math.max(mine.standingLinks.length, theirs.standingLinks.length);
  for (let i = 0; i < count; i++) {
    const a = mine.standingLinks[i];
    const b = theirs.standingLinks[i];
    const n = `Footer link ${i + 1}`;
    out.push(plainDifference(`${n} name`, a?.label ?? '', b?.label ?? ''));
    out.push(webDifference(`${n} address`, a?.url ?? '', b?.url ?? ''));
  }
  return out.filter((d): d is SettingDifference => d !== null);
}

/** Names only (no values) of the settings that differ from the Pack 137 defaults. */
export function differingSettingNames(settings: PackSettings): string[] {
  const names = settingsDifferences(defaultSettings(), settings).map(
    (d) => d.text.split(':')[0] ?? d.text,
  );
  return [...new Set(names)];
}

/** A short fingerprint (FNV-1a, 32 bit) of the JSON of validated settings. Not a secret, only a change marker. */
export function settingsFingerprint(settings: PackSettings): string {
  const text = JSON.stringify(settings);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** True when the settings differ from the defaults and this device has not seen exactly these before. */
export function settingsChangedOutside(settings: PackSettings, seen: string | undefined): boolean {
  if (differingSettingNames(settings).length === 0) return false;
  return seen !== settingsFingerprint(settings);
}

export const SETTINGS_OUTSIDE_MESSAGE =
  'Your settings were changed outside this tool or on another copy of it. Open Settings to check them.';

export interface LinkReport {
  heading: string;
  lines: string[];
}

/**
 * Where a draft's links go, for each settings choice that is on offer. One report when the choice
 * makes no difference. `warn` is draftLinkWarnings from src/core/draft.ts.
 */
export function draftLinkReports(
  warn: (letter: LetterForm, settings: PackSettings) => string[],
  letter: LetterForm,
  mine: PackSettings,
  theirs: PackSettings,
  differs: boolean,
): LinkReport[] {
  if (!differs) return [{ heading: '', lines: warn(letter, mine) }];
  return [
    { heading: 'If you keep your settings', lines: warn(letter, mine) },
    { heading: "If you use the draft's settings", lines: warn(letter, theirs) },
  ];
}

/* ---------- repaired on load (N4) ---------- */

export interface RepairNotice {
  message: string;
  details: string[];
}

export function settingsRepairNotice(problems: readonly SettingsProblem[]): RepairNotice | null {
  if (problems.length === 0) return null;
  return {
    message: 'Some saved settings could not be used and were reset. Open Settings to check them.',
    details: problems.map((p) => p.message),
  };
}

export function draftRepairNotice(notes: readonly string[]): RepairNotice | null {
  if (notes.length === 0) return null;
  return {
    message: 'Parts of your saved letter could not be read and were left empty.',
    details: [...notes],
  };
}
