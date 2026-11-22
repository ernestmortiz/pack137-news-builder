/** Pure helpers for the Settings screen and the draft choices. No DOM here. */
import type { MonthOfYear } from '../core/dates';
import { formatMonthYear } from '../core/dates';
import type { DraftFile } from '../core/draft';
import { emptyLetter } from '../core/letter';
import type { PackSettings, SettingsProblem, StandingLink } from '../core/settings';
import { mailtoSummary } from './paths';

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

export const MAX_STANDING_LINKS = 12;

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
): { key: 'contact' | 'volunteer' | 'feedback'; text: string }[] {
  const feedback = emptyLetter({ year: 2000, month: 1 }, settings).feedback;
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
    text: mailtoSummary(links[key]) ?? links[key],
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
