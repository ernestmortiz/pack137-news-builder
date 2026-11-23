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
import type { FieldPath } from '../core/fill';
import type { ContributorPart, LetterForm, PhotoField, StoryBlock } from '../core/letter';
import { altTextProblems } from '../core/alt-text';
import { photoSpots } from '../core/render-letter';
import { LETTER_HEADINGS } from '../core/letter';
import { safeUrl } from '../templates/components';

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

/** One reminder, and the field in the form where it can be dealt with. */
export interface LetterNote {
  message: string;
  path: FieldPath;
}

/**
 * Plain-words reminders that never block copying, each with the field to look at. Alt text is
 * required (spec 8.2), so a photo with none is always listed.
 */
export function letterNotes(letter: LetterForm): LetterNote[] {
  const out: LetterNote[] = [];
  const note = (message: string, path: FieldPath): void => void out.push({ message, path });
  if (letter.summary.trim() === '') note('The summary line is empty.', ['summary']);
  if (!letter.intro.some((run) => run.kind === 'text' && run.text.trim() !== '')) {
    note('The intro paragraph is empty.', ['intro']);
  }
  if (letter.story.title.trim() === '') note('The feature story has no title.', ['story', 'title']);
  if (letter.story.blocks.length === 0)
    note('The feature story has no blocks yet.', ['story', 'blocks']);
  if (letter.comingUp.items.length === 0)
    note('Coming up has no events yet.', ['comingUp', 'items']);
  // Named the same way as photoSpots: photo blocks are numbered among photo blocks.
  const spots = new Set(photoSpots(letter).map((spot) => spot.where));
  const photos: { where: string; photo: PhotoField; path: FieldPath }[] = [];
  let photoNo = 0;
  letter.story.blocks.forEach((block, i) => {
    if (block.kind === 'photo') {
      photoNo += 1;
      photos.push({
        where: `Photo ${photoNo}`,
        photo: block.photo,
        path: ['story', 'blocks', i, 'photo', 'alt'],
      });
    } else if (block.kind === 'sidebar' && block.photo) {
      photos.push({
        where: `Sidebar photo in block ${i + 1}`,
        photo: block.photo,
        path: ['story', 'blocks', i, 'photo', 'alt'],
      });
    }
  });
  for (const { where, photo, path } of photos) {
    const src = photo.src.trim();
    if (spots.has(where)) {
      note(
        `${where} is a photo spot. After pasting, replace the Insert photo here box with the photo in TroopTrack, then use Finish photos.`,
        path,
      );
    } else if (/^http:\/\//i.test(src)) {
      note(
        `${where}: This photo's address is not secure (http). Use the https address from TroopTrack.`,
        path,
      );
    }
    for (const problem of altTextProblems(photo.alt, photo.caption)) {
      note(`${where}: ${problem.message}`, path);
    }
  }
  const link = (where: string, text: string, url: string, path: FieldPath): void => {
    if (text.trim() !== '' && url.trim() === '')
      note(`${where}: there is link text but no link.`, path);
    else if (url.trim() !== '' && safeUrl(url) === null) {
      note(
        `${where}: the link is not a full web or email address (starting with https:// or mailto:), so the link is left out.`,
        path,
      );
    }
  };
  const help = letter.comingUp.button;
  if (help.url.trim() !== '' && safeUrl(help.url) === null) {
    note(
      `The ${help.text.trim() === '' ? 'I can help' : help.text.trim()} button's link is not a full web or email address, so the button is left out.`,
      ['comingUp', 'button', 'url'],
    );
  }
  letter.comingUp.items.forEach((item, i) =>
    link(`Coming up, event ${i + 1}`, item.link.text, item.link.url, [
      'comingUp',
      'items',
      i,
      'link',
      'url',
    ]),
  );
  if (letter.around.enabled) {
    letter.around.items.forEach((item, i) =>
      link(`Around the pack, item ${i + 1}`, item.link.text, item.link.url, [
        'around',
        'items',
        i,
        'link',
        'url',
      ]),
    );
  }
  if (letter.photoAsk.enabled)
    link('Photo and story ask', letter.photoAsk.linkText, letter.photoAsk.url, ['photoAsk', 'url']);
  return out;
}

/** The same reminders as plain sentences, for the list beside the preview. */
export function letterWarnings(letter: LetterForm): string[] {
  return letterNotes(letter).map((n) => n.message);
}

/** The title the page and the status line use for an issue, such as "December 2026". */
export function issueTitle(issue: MonthOfYear): string {
  return formatMonthYear(issue);
}
