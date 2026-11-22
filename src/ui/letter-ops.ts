/**
 * Pure helpers for the Monthly letter screen. No DOM here, so each one is tested on its own.
 * They work on the LetterForm from src/core/letter.ts and never import the renderer.
 */
import {
  formatDateTime,
  formatMonthYear,
  type CalendarDate,
  type MonthOfYear,
  type TimeOfDay,
} from '../core/dates';
import type { ContributorPart, LetterForm, PhotoField, StoryBlock } from '../core/letter';
import { LETTER_HEADINGS } from '../core/letter';

/** The month after `today`, rolling December into January of the next year. */
export function nextMonth(today: CalendarDate): MonthOfYear {
  return today.month === 12
    ? { year: today.year + 1, month: 1 }
    : { year: today.year, month: today.month + 1 };
}

/* ---------- story blocks and their parts ---------- */

export type BlockKind = StoryBlock['kind'];

export const BLOCK_KINDS: { kind: BlockKind; name: string; help: string }[] = [
  {
    kind: 'contributor',
    name: 'Contributor',
    help: 'A name tag, then paragraphs and bullet lists',
  },
  { kind: 'photo', name: 'Photo', help: 'One picture with a caption' },
  { kind: 'stats', name: 'Stat band', help: 'Two big numbers, such as 48 families' },
  { kind: 'sidebar', name: 'Sidebar box', help: 'A boxed extra, such as a recipe' },
];

export function blockName(kind: BlockKind): string {
  return BLOCK_KINDS.find((b) => b.kind === kind)?.name ?? kind;
}

export function newPhoto(): PhotoField {
  return { src: '', alt: '', caption: '' };
}

export function newPart(kind: ContributorPart['kind']): ContributorPart {
  return kind === 'paragraph' ? { kind, text: [] } : { kind, items: [{ lead: '', text: [] }] };
}

export function newBlock(kind: BlockKind): StoryBlock {
  switch (kind) {
    case 'contributor':
      return { kind, name: '', role: '', parts: [newPart('paragraph')] };
    case 'photo':
      return { kind, photo: newPhoto() };
    case 'stats':
      return {
        kind,
        stats: [
          { value: '', text: '' },
          { value: '', text: '' },
        ],
      };
    case 'sidebar':
      return { kind, title: '', source: '', body: [[]] };
  }
}

/* ---------- optional sections ---------- */

export type OptionalSection = 'closing' | 'photoAsk' | 'around' | 'horizon';

export const OPTIONAL_SECTIONS: OptionalSection[] = ['closing', 'photoAsk', 'around', 'horizon'];

/** Plain names for the four switches. The three with a fixed heading use it as is. */
export function sectionName(section: OptionalSection): string {
  return section === 'photoAsk' ? 'Photo and story ask' : LETTER_HEADINGS[section];
}

export function setSectionEnabled(letter: LetterForm, section: OptionalSection, on: boolean): void {
  letter[section].enabled = on;
}

/* ---------- dates, times and the year ---------- */

/** "20:05", the value of a time input. */
export function toTimeValue(time: TimeOfDay): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(time.hour)}:${p(time.minute)}`;
}

/**
 * Reads a time. Accepts a time input's "20:05" (seconds are ignored) and typed forms such as
 * "8:00 pm" or "8 pm". Returns undefined for anything else, including an empty string.
 */
export function parseTime(value: string): TimeOfDay | undefined {
  const m =
    /^(\d{1,2})(?::(\d{2}))?(?::\d{2}(?:\.\d+)?)?\s*([ap])\.?m\.?$|^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/i.exec(
      value.trim(),
    );
  if (m === null) return undefined;
  if (m[3] !== undefined) {
    const hour12 = Number(m[1]);
    const minute = Number(m[2] ?? '0');
    if (hour12 < 1 || hour12 > 12 || minute > 59) return undefined;
    const pm = m[3].toLowerCase() === 'p';
    return { hour: (hour12 % 12) + (pm ? 12 : 0), minute };
  }
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (hour > 23 || minute > 59) return undefined;
  return { hour, minute };
}

/** "Sun Dec 6, 8:00 pm", or "Sun Dec 6" when there is no time. */
export function whenText(date: CalendarDate, time?: TimeOfDay): string {
  return formatDateTime(date, time);
}

/** A four digit year the masthead can use. Undefined while the person is still typing it. */
export function parseYear(text: string): number | undefined {
  if (!/^\d{4}$/.test(text.trim())) return undefined;
  const year = Number(text);
  return year >= 2000 && year <= 2100 ? year : undefined;
}

/** The date a new Coming up or On the horizon entry starts with: the first of the issue month. */
export function defaultItemDate(issue: MonthOfYear): CalendarDate {
  return { year: issue.year, month: issue.month, day: 1 };
}

/* ---------- things to look at ---------- */

/**
 * Plain-words reminders that never block copying. Alt text is required (spec 8.2), so a photo
 * with none is always listed.
 */
export function letterWarnings(letter: LetterForm): string[] {
  const out: string[] = [];
  if (letter.summary.trim() === '') out.push('The summary line is empty.');
  if (letter.story.title.trim() === '') out.push('The feature story has no title.');
  const photos: { where: string; photo: PhotoField }[] = [];
  letter.story.blocks.forEach((block, i) => {
    if (block.kind === 'photo') photos.push({ where: `Story block ${i + 1}`, photo: block.photo });
    else if (block.kind === 'sidebar' && block.photo) {
      photos.push({ where: `Story block ${i + 1} (sidebar box)`, photo: block.photo });
    }
  });
  for (const { where, photo } of photos) {
    if (photo.src.trim() === '') out.push(`${where}: the photo has no address yet.`);
    if (photo.alt.trim() === '') out.push(`${where}: the photo needs a description.`);
  }
  const link = (where: string, text: string, url: string): void => {
    if (text.trim() !== '' && url.trim() === '')
      out.push(`${where}: there is link text but no link.`);
  };
  letter.comingUp.items.forEach((item, i) =>
    link(`Coming up, event ${i + 1}`, item.link.text, item.link.url),
  );
  if (letter.around.enabled) {
    letter.around.items.forEach((item, i) =>
      link(`Around the pack, item ${i + 1}`, item.link.text, item.link.url),
    );
  }
  if (letter.photoAsk.enabled)
    link('Photo and story ask', letter.photoAsk.linkText, letter.photoAsk.url);
  return out;
}

/** The title the page and the status line use for an issue, such as "December 2026". */
export function issueTitle(issue: MonthOfYear): string {
  return formatMonthYear(issue);
}
