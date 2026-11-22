/**
 * Draft files (build spec, section 8.3). A draft is how a letter moves between people or devices,
 * and how last month's issue becomes this month's starting point. It carries the letter and the
 * settings it was written with, and a schema version so older files can be migrated.
 *
 * A draft file is untrusted input (ADR 0004, Settings): `readDraft` parses it as data only,
 * validates every field against the current shapes, migrates older versions, and never throws.
 *
 * Contract owned by the orchestrator (Phase 5).
 */
import { isValidDate, type CalendarDate, type MonthOfYear, type TimeOfDay } from './dates';
import type { ButtonField, RichText } from './forms';
import {
  emptyLetter,
  type AroundItem,
  type ComingItem,
  type ContributorPart,
  type HorizonItem,
  type LeadItem,
  type LetterForm,
  type LinkField,
  type PhotoField,
  type StoryBlock,
} from './letter';
import type { Inline, Mark } from './model';
import { validateSettings, type PackSettings } from './settings';

/** Marks a file as a Pack 137 letter draft, so other JSON files are refused with a clear message. */
export const DRAFT_KIND = 'pack137-letter-draft';
/** The current draft schema version. Bump it, and add a migration, when LetterForm or PackSettings change shape. */
export const DRAFT_VERSION = 1;
/** Draft files larger than this are refused before parsing. */
export const MAX_DRAFT_BYTES = 5 * 1024 * 1024;

export interface DraftFile {
  kind: typeof DRAFT_KIND;
  version: number;
  /** ISO 8601 time the draft was written, for display only. */
  savedAt: string;
  letter: LetterForm;
  settings: PackSettings;
}

export type DraftReadResult =
  | {
      ok: true;
      draft: DraftFile;
      /** True when an older version was upgraded. */
      migrated: boolean;
      /** Fields that were missing or invalid and were replaced, in plain words, at most 20. */
      notes: string[];
    }
  | { ok: false; message: string };

/** The JSON text of a draft file, pretty printed, ending in a newline. */
export function writeDraft(letter: LetterForm, settings: PackSettings, savedAt: Date): string {
  const draft: DraftFile = {
    kind: DRAFT_KIND,
    version: DRAFT_VERSION,
    savedAt: savedAt.toISOString(),
    letter,
    settings,
  };
  return JSON.stringify(draft, null, 2) + '\n';
}

/* ---------- limits ---------- */

/** Notes returned at most. When there are more, the last one counts the rest. */
export const MAX_DRAFT_NOTES = 20;
/** Story blocks kept at most. The November 2026 issue has 14. */
export const MAX_STORY_BLOCKS = 100;
/** Items kept at most in any other list (paragraphs, bullets, dated items, parts of a story). */
export const MAX_LIST_ITEMS = 200;
/** Pieces (runs and line breaks) kept at most in one line of formatted text. */
export const MAX_TEXT_RUNS = 1000;
/** Photo widths above the card's inner width make no sense (PhotoField.width). */
const MAX_PHOTO_WIDTH = 552;
/** Years a date or an issue may carry. Outside this range a value is a mistake, not a date. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/* ---------- messages ---------- */

const NOT_READABLE =
  'This file could not be read. It may be damaged or it may not be a draft file.';
const NOT_A_DRAFT = 'This file is not a Pack 137 letter draft.';
const TOO_LARGE = 'This file is too large to be a letter draft. Draft files are 5 MB at most.';
const NO_VERSION = 'This draft does not say which version it is, so it cannot be opened.';
const TOO_NEW = 'This draft was made by a newer version of the tool. Update the tool to open it.';
const NOT_MIGRATED = 'This older draft could not be brought up to date, so it cannot be opened.';
const NO_LETTER = 'This draft has no letter in it.';

/* ---------- reading untrusted values ---------- */

type Loose = Record<string, unknown>;

const hasOwn = Object.prototype.hasOwnProperty;

/** A plain data object: not null and not a list. */
function isRecord(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads one named field, and only when the object itself holds it. The reader asks only for the
 * field names of the current shapes, never for a name taken from the file, so `__proto__`,
 * `constructor`, `prototype` and every unknown key are never looked at and never copied.
 */
function own(record: Loose, key: string): unknown {
  return hasOwn.call(record, key) ? record[key] : undefined;
}

/**
 * The plain-word notes about what was replaced or removed. Notes name a place in the letter and
 * never quote the file, so nothing from the file can end up in them. At most MAX_DRAFT_NOTES are
 * kept; past that, the last one says how many more there were.
 */
class Notes {
  private readonly kept: string[] = [];
  private more = 0;

  add(note: string): void {
    if (this.kept.length < MAX_DRAFT_NOTES) {
      if (!this.kept.includes(note)) this.kept.push(note);
    } else this.more += 1;
  }

  list(): string[] {
    if (this.more === 0) return [...this.kept];
    const shown = this.kept.slice(0, MAX_DRAFT_NOTES - 1);
    const rest = this.kept.length - shown.length + this.more;
    return [...shown, `And ${rest} more things were replaced or removed.`];
  }
}

/* ---------- size ---------- */

/** True when the text is over MAX_DRAFT_BYTES as UTF-8, without making a copy of it. */
function overSizeLimit(text: string): boolean {
  // Every character is at least one byte and at most three per UTF-16 unit.
  if (text.length > MAX_DRAFT_BYTES) return true;
  if (text.length * 3 <= MAX_DRAFT_BYTES) return false;
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
    if (bytes > MAX_DRAFT_BYTES) return true;
  }
  return false;
}

/* ---------- migration ---------- */

/**
 * One step of a migration: takes the whole draft object as an older version wrote it and returns
 * it in the shape of the next version. It works on loose data; the result is validated afterwards
 * like any other input, so a step only has to move or rename things.
 */
export type DraftMigration = (draft: Record<string, unknown>) => Record<string, unknown>;

/**
 * The migrations, keyed by the version they upgrade from: the entry at 1 turns a version 1 draft
 * into a version 2 draft. Version 1 is the first version, so there are none yet. When
 * DRAFT_VERSION goes up, add the step for the old version here.
 */
export const DRAFT_MIGRATIONS: Readonly<Record<number, DraftMigration>> = {};

/** What the reader runs against. `readDraft` uses the real values; tests can pretend a later version. */
export interface DraftSchema {
  version: number;
  migrations: Readonly<Record<number, DraftMigration>>;
}

/** Runs every step from the draft's version up to the current one. Null when a step is missing or fails. */
function migrate(draft: Loose, from: number, schema: DraftSchema): Loose | null {
  let current = draft;
  for (let version = from; version < schema.version; version++) {
    const key = String(version);
    const step: unknown = hasOwn.call(schema.migrations, key)
      ? schema.migrations[version]
      : undefined;
    if (typeof step !== 'function') return null;
    let next: unknown;
    try {
      next = (step as DraftMigration)(current);
    } catch {
      return null;
    }
    if (!isRecord(next)) return null;
    current = next;
  }
  return current;
}

/* ---------- small fields ---------- */

function text(record: Loose, key: string, where: string, what: string, notes: Notes): string {
  const value = own(record, key);
  if (typeof value === 'string') return value;
  notes.add(`${where}: the ${what} was missing or not text, so it was left empty.`);
  return '';
}

function isWhole(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** A real calendar date (Feb 30 is not one) with whole-number parts, or null. */
function calendarDate(value: unknown): CalendarDate | null {
  if (!isRecord(value)) return null;
  const year = own(value, 'year');
  const month = own(value, 'month');
  const day = own(value, 'day');
  if (!isWhole(year, MIN_YEAR, MAX_YEAR) || !isWhole(month, 1, 12) || !isWhole(day, 1, 31)) {
    return null;
  }
  const date = { year, month, day };
  return isValidDate(date) ? date : null;
}

function timeOfDay(value: unknown): TimeOfDay | null {
  if (!isRecord(value)) return null;
  const hour = own(value, 'hour');
  const minute = own(value, 'minute');
  return isWhole(hour, 0, 23) && isWhole(minute, 0, 59) ? { hour, minute } : null;
}

/**
 * The first `cap` entries of a list. Something that is not a list gives an empty one with a note;
 * a list that is too long is cut with a note.
 */
function listOf(value: unknown, cap: number, where: string, what: string, notes: Notes): unknown[] {
  if (!Array.isArray(value)) {
    notes.add(`${where}: the ${what} were missing or not a list, so the list was left empty.`);
    return [];
  }
  const all: unknown[] = value;
  if (all.length <= cap) return all;
  notes.add(`${where}: only the first ${cap} ${what} were kept.`);
  return all.slice(0, cap);
}

/* ---------- formatted text ---------- */

const MARK_ORDER: readonly Mark[] = ['em', 'strike', 'strong'];

/** Null when `value` is not a valid run. `tidied` is set when a mark or a link address was dropped. */
function inline(value: unknown, state: { tidied: boolean }): Inline | null {
  if (!isRecord(value)) return null;
  const kind = own(value, 'kind');
  if (kind === 'break') return { kind: 'break' };
  if (kind !== 'text') return null;
  const runText = own(value, 'text');
  if (typeof runText !== 'string') return null;

  const rawMarks = own(value, 'marks');
  let marks: Mark[] = [];
  if (Array.isArray(rawMarks)) {
    const given: unknown[] = rawMarks;
    // Sorted and without repeats, as the content model wants.
    marks = MARK_ORDER.filter((mark) => given.includes(mark));
    if (marks.length !== given.length) state.tidied = true;
  } else state.tidied = true;

  const href = own(value, 'href');
  if (typeof href === 'string') return { kind: 'text', text: runText, marks, href };
  if (href !== undefined) state.tidied = true;
  return { kind: 'text', text: runText, marks };
}

/** One line of formatted text. Runs that are not valid are removed; the rest keep their order. */
function richText(value: unknown, where: string, what: string, notes: Notes): RichText {
  if (!Array.isArray(value)) {
    notes.add(`${where}: the ${what} was missing or not valid, so it was left empty.`);
    return [];
  }
  let all: unknown[] = value;
  if (all.length > MAX_TEXT_RUNS) {
    notes.add(
      `${where}: the ${what} had too many pieces, so only the first ${MAX_TEXT_RUNS} were kept.`,
    );
    all = all.slice(0, MAX_TEXT_RUNS);
  }
  const state = { tidied: false };
  const runs: RichText = [];
  let dropped = false;
  for (const item of all) {
    const run = inline(item, state);
    if (run === null) dropped = true;
    else runs.push(run);
  }
  if (dropped) notes.add(`${where}: parts of the ${what} were not valid and were removed.`);
  if (state.tidied)
    notes.add(`${where}: some formatting in the ${what} was not valid and was removed.`);
  return runs;
}

/** A list of lines of formatted text, such as paragraphs. */
function richList(value: unknown, where: string, what: string, notes: Notes): RichText[] {
  const lines: RichText[] = [];
  let dropped = false;
  for (const item of listOf(value, MAX_LIST_ITEMS, where, what, notes)) {
    if (Array.isArray(item)) lines.push(richText(item, where, what, notes));
    else dropped = true;
  }
  if (dropped) notes.add(`${where}: some ${what} were not valid and were removed.`);
  return lines;
}

/* ---------- links and photos ---------- */

function linkField(value: unknown, where: string, notes: Notes): LinkField {
  if (!isRecord(value)) {
    notes.add(`${where}: the link was missing or not valid, so it was left empty.`);
    return { text: '', url: '' };
  }
  return {
    text: text(value, 'text', where, 'link text', notes),
    url: text(value, 'url', where, 'link address', notes),
  };
}

function buttonField(
  value: unknown,
  fallback: ButtonField,
  where: string,
  notes: Notes,
): ButtonField {
  if (!isRecord(value)) {
    notes.add(`${where}: the button was missing or not valid, so the usual button is used.`);
    return fallback;
  }
  return {
    text: text(value, 'text', where, 'button text', notes),
    url: text(value, 'url', where, 'button address', notes),
  };
}

/** A photo. Addresses stay as typed: the renderer checks them against the allow-list at output time. */
function photoField(value: Loose, where: string, notes: Notes): PhotoField {
  const src = text(value, 'src', where, 'photo address', notes);
  const alt = text(value, 'alt', where, 'photo description', notes);
  const caption = text(value, 'caption', where, 'photo caption', notes);
  const width = own(value, 'width');
  // Fields are written in the order of PhotoField, so saving a draft again gives the same file.
  if (typeof width === 'number' && width >= 1 && width <= MAX_PHOTO_WIDTH) {
    return { src, alt, width, caption };
  }
  if (width !== undefined) {
    notes.add(`${where}: the photo width was not valid, so the photo is shown at full width.`);
  }
  return { src, alt, caption };
}

/* ---------- story blocks ---------- */

function leadItems(value: unknown, where: string, notes: Notes): LeadItem[] {
  const items: LeadItem[] = [];
  let dropped = false;
  for (const item of listOf(value, MAX_LIST_ITEMS, where, 'bullets', notes)) {
    if (!isRecord(item)) {
      dropped = true;
      continue;
    }
    items.push({
      lead: text(item, 'lead', where, 'bold start of a bullet', notes),
      text: richText(own(item, 'text'), where, 'text of a bullet', notes),
    });
  }
  if (dropped) notes.add(`${where}: some bullets were not valid and were removed.`);
  return items;
}

function contributorParts(value: unknown, where: string, notes: Notes): ContributorPart[] {
  const parts: ContributorPart[] = [];
  let dropped = false;
  for (const part of listOf(value, MAX_LIST_ITEMS, where, 'paragraphs and lists', notes)) {
    const kind = isRecord(part) ? own(part, 'kind') : undefined;
    if (!isRecord(part) || (kind !== 'paragraph' && kind !== 'list')) {
      dropped = true;
    } else if (kind === 'paragraph') {
      parts.push({ kind, text: richText(own(part, 'text'), where, 'paragraph', notes) });
    } else {
      parts.push({ kind, items: leadItems(own(part, 'items'), where, notes) });
    }
  }
  if (dropped) notes.add(`${where}: some paragraphs or lists were not valid and were removed.`);
  return parts;
}

function stat(value: unknown, where: string, notes: Notes): { value: string; text: string } {
  if (!isRecord(value)) return { value: '', text: '' };
  return {
    value: text(value, 'value', where, 'number', notes),
    text: text(value, 'text', where, 'line under the number', notes),
  };
}

/** One story block, or null (with a note) when it is not one of the four kinds. */
function storyBlock(value: unknown, where: string, notes: Notes): StoryBlock | null {
  const kind = isRecord(value) ? own(value, 'kind') : undefined;
  if (!isRecord(value)) {
    notes.add(`${where} could not be read and was removed.`);
    return null;
  }
  if (kind === 'contributor') {
    return {
      kind,
      name: text(value, 'name', where, 'name', notes),
      role: text(value, 'role', where, 'role', notes),
      parts: contributorParts(own(value, 'parts'), where, notes),
    };
  }
  if (kind === 'photo') {
    const photo = own(value, 'photo');
    if (isRecord(photo)) return { kind, photo: photoField(photo, where, notes) };
    notes.add(`${where}: the photo was missing or not valid, so it was left empty.`);
    return { kind, photo: { src: '', alt: '', caption: '' } };
  }
  if (kind === 'stats') {
    const raw = own(value, 'stats');
    const given: unknown[] = Array.isArray(raw) ? raw : [];
    if (given.length !== 2 || !isRecord(given[0]) || !isRecord(given[1])) {
      notes.add(`${where}: a stat band has exactly two stats, so it was adjusted to two.`);
    }
    return { kind, stats: [stat(given[0], where, notes), stat(given[1], where, notes)] };
  }
  if (kind === 'sidebar') {
    const block: StoryBlock = {
      kind,
      title: text(value, 'title', where, 'title', notes),
      source: text(value, 'source', where, 'source line', notes),
      body: richList(own(value, 'body'), where, 'paragraphs', notes),
    };
    const photo = own(value, 'photo');
    if (isRecord(photo)) block.photo = photoField(photo, where, notes);
    else if (photo !== undefined) {
      notes.add(`${where}: the photo was not valid and was removed.`);
    }
    return block;
  }
  notes.add(`${where} was of a kind this tool does not know and was removed.`);
  return null;
}

/* ---------- dated and listed items ---------- */

function aroundItems(value: unknown, notes: Notes): AroundItem[] {
  const where = 'Around the pack';
  const items: AroundItem[] = [];
  listOf(value, MAX_LIST_ITEMS, where, 'items', notes).forEach((item, i) => {
    const at = `${where}, item ${i + 1}`;
    if (!isRecord(item)) {
      notes.add(`${at} could not be read and was removed.`);
      return;
    }
    items.push({
      lead: text(item, 'lead', at, 'bold start', notes),
      text: richText(own(item, 'text'), at, 'text', notes),
      link: linkField(own(item, 'link'), at, notes),
    });
  });
  return items;
}

/**
 * Coming up items. An item whose date is missing or not a real date is removed, with a note,
 * rather than given a made-up date that would then be printed in the letter.
 */
function comingItems(value: unknown, notes: Notes): ComingItem[] {
  const where = 'Coming up';
  const items: ComingItem[] = [];
  listOf(value, MAX_LIST_ITEMS, where, 'items', notes).forEach((item, i) => {
    const at = `${where}, item ${i + 1}`;
    const date = isRecord(item) ? calendarDate(own(item, 'date')) : null;
    if (!isRecord(item) || date === null) {
      notes.add(`${at} had no valid date and was removed.`);
      return;
    }
    const rawTime = own(item, 'time');
    const time = rawTime === undefined ? null : timeOfDay(rawTime);
    if (rawTime !== undefined && time === null) {
      notes.add(`${at}: the time was not valid and was removed.`);
    }
    const body = {
      text: richText(own(item, 'text'), at, 'text', notes),
      link: linkField(own(item, 'link'), at, notes),
    };
    // Fields are written in the order of ComingItem, so saving a draft again gives the same file.
    items.push(time === null ? { date, ...body } : { date, time, ...body });
  });
  return items;
}

/** On the horizon items. As in Coming up, an item without a real date is removed with a note. */
function horizonItems(value: unknown, notes: Notes): HorizonItem[] {
  const where = 'On the horizon';
  const items: HorizonItem[] = [];
  listOf(value, MAX_LIST_ITEMS, where, 'items', notes).forEach((item, i) => {
    const at = `${where}, item ${i + 1}`;
    const date = isRecord(item) ? calendarDate(own(item, 'date')) : null;
    if (!isRecord(item) || date === null) {
      notes.add(`${at} had no valid date and was removed.`);
      return;
    }
    items.push({ date, text: text(item, 'text', at, 'text', notes) });
  });
  return items;
}

/* ---------- the letter ---------- */

/** An on or off switch. Anything but true or false gives the blank letter's position (on). */
function enabledFlag(record: Loose, fallback: boolean, where: string, notes: Notes): boolean {
  const value = own(record, 'enabled');
  if (typeof value === 'boolean') return value;
  notes.add(
    `${where}: the on or off switch was missing or not valid, so the section is switched ${fallback ? 'on' : 'off'}.`,
  );
  return fallback;
}

/** The section as an object, or null with one note saying it starts blank. */
function section(letter: Loose, key: string, name: string, notes: Notes): Loose | null {
  const value = own(letter, key);
  if (isRecord(value)) return value;
  notes.add(`The ${name} section was missing or not valid, so it starts blank.`);
  return null;
}

/**
 * The issue month. When it is missing or not valid there is no clock to ask (this function must
 * give the same answer every time), so it falls back to the month the draft was saved, and failing
 * that to January 2000, which is plainly wrong on screen and easy to spot. A note says to check it.
 */
function issueMonth(value: unknown, savedAt: string, notes: Notes): MonthOfYear {
  if (isRecord(value)) {
    const year = own(value, 'year');
    const month = own(value, 'month');
    if (isWhole(year, MIN_YEAR, MAX_YEAR) && isWhole(month, 1, 12)) return { year, month };
  }
  notes.add('The issue month was missing or not valid. Check the month and year on the masthead.');
  if (savedAt !== '') {
    const saved = new Date(savedAt);
    const year = saved.getUTCFullYear();
    if (isWhole(year, MIN_YEAR, MAX_YEAR)) return { year, month: saved.getUTCMonth() + 1 };
  }
  return { year: MIN_YEAR, month: 1 };
}

/**
 * Builds a fresh LetterForm from loose data, one known field at a time. Nothing is copied over
 * wholesale, so unknown fields and odd keys in the file are left behind.
 */
function letterFrom(raw: Loose, settings: PackSettings, savedAt: string, notes: Notes): LetterForm {
  const issue = issueMonth(own(raw, 'issue'), savedAt, notes);
  // The blank letter supplies whole sections that are missing, and the default switch positions.
  const blank = emptyLetter(issue, settings);

  const story = section(raw, 'story', 'feature story', notes);
  const blocks: StoryBlock[] = [];
  if (story !== null) {
    listOf(own(story, 'blocks'), MAX_STORY_BLOCKS, 'Feature story', 'story blocks', notes).forEach(
      (item, i) => {
        const block = storyBlock(item, `Story block ${i + 1}`, notes);
        if (block !== null) blocks.push(block);
      },
    );
  }

  const closing = section(raw, 'closing', 'closing and high fives', notes);
  const photoAsk = section(raw, 'photoAsk', 'photo and story ask', notes);
  const around = section(raw, 'around', 'around the pack', notes);
  const comingUp = section(raw, 'comingUp', 'coming up', notes);
  const horizon = section(raw, 'horizon', 'on the horizon', notes);
  const feedback = section(raw, 'feedback', 'feedback', notes);

  return {
    version: 1,
    issue,
    summary: text(raw, 'summary', 'Letter', 'summary line', notes),
    greeting: text(raw, 'greeting', 'Letter', 'greeting', notes),
    intro: richText(own(raw, 'intro'), 'Letter', 'intro paragraph', notes),
    story:
      story === null
        ? blank.story
        : { title: text(story, 'title', 'Feature story', 'title', notes), blocks },
    closing:
      closing === null
        ? blank.closing
        : {
            enabled: enabledFlag(closing, blank.closing.enabled, 'Closing and high fives', notes),
            paragraphs: richList(
              own(closing, 'paragraphs'),
              'Closing and high fives',
              'paragraphs',
              notes,
            ),
            thanks: richList(
              own(closing, 'thanks'),
              'Closing and high fives',
              'thank-you lines',
              notes,
            ),
            closingLine: text(
              closing,
              'closingLine',
              'Closing and high fives',
              'closing line',
              notes,
            ),
            signer: text(closing, 'signer', 'Closing and high fives', 'signer name', notes),
            signerRole: text(closing, 'signerRole', 'Closing and high fives', 'signer role', notes),
          },
    photoAsk:
      photoAsk === null
        ? blank.photoAsk
        : {
            enabled: enabledFlag(photoAsk, blank.photoAsk.enabled, 'Photo and story ask', notes),
            text: text(photoAsk, 'text', 'Photo and story ask', 'sentence', notes),
            linkText: text(photoAsk, 'linkText', 'Photo and story ask', 'link text', notes),
            url: text(photoAsk, 'url', 'Photo and story ask', 'link address', notes),
          },
    around:
      around === null
        ? blank.around
        : {
            enabled: enabledFlag(around, blank.around.enabled, 'Around the pack', notes),
            intro: text(around, 'intro', 'Around the pack', 'intro line', notes),
            items: aroundItems(own(around, 'items'), notes),
          },
    comingUp:
      comingUp === null
        ? blank.comingUp
        : {
            intro: text(comingUp, 'intro', 'Coming up', 'intro line', notes),
            items: comingItems(own(comingUp, 'items'), notes),
            howToHelp: richText(own(comingUp, 'howToHelp'), 'Coming up', 'how to help line', notes),
            button: buttonField(own(comingUp, 'button'), blank.comingUp.button, 'Coming up', notes),
          },
    horizon:
      horizon === null
        ? blank.horizon
        : {
            enabled: enabledFlag(horizon, blank.horizon.enabled, 'On the horizon', notes),
            items: horizonItems(own(horizon, 'items'), notes),
            yearLinkText: text(horizon, 'yearLinkText', 'On the horizon', 'year link text', notes),
          },
    feedback:
      feedback === null
        ? blank.feedback
        : {
            question: text(feedback, 'question', 'Feedback', 'question', notes),
            linkText: text(feedback, 'linkText', 'Feedback', 'link text', notes),
            subject: text(feedback, 'subject', 'Feedback', 'email subject', notes),
            body: text(feedback, 'body', 'Feedback', 'email text', notes),
            note: text(feedback, 'note', 'Feedback', 'small note', notes),
          },
    signOff: text(raw, 'signOff', 'Letter', 'sign-off', notes),
  };
}

/* ---------- reading ---------- */

/** The exact form `writeDraft` writes. Anything else is dropped, so every device shows it alike. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** The saved time when it is a real time in the form writeDraft writes, else an empty string. */
function savedTime(value: unknown): string {
  if (typeof value !== 'string' || value.length > 30 || !ISO_TIME.test(value)) return '';
  return Number.isFinite(Date.parse(value)) ? value : '';
}

function read(source: string, schema: DraftSchema): DraftReadResult {
  if (typeof source !== 'string') return { ok: false, message: NOT_A_DRAFT };
  if (overSizeLimit(source)) return { ok: false, message: TOO_LARGE };

  let parsed: unknown;
  try {
    // JSON.parse makes plain data only. A "__proto__" key in the text becomes an ordinary field
    // of that one object and does not change any prototype.
    parsed = JSON.parse(source);
  } catch {
    // Bad JSON, or nesting too deep for the engine.
    return { ok: false, message: NOT_READABLE };
  }
  if (!isRecord(parsed) || own(parsed, 'kind') !== DRAFT_KIND) {
    return { ok: false, message: NOT_A_DRAFT };
  }

  const version = own(parsed, 'version');
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, message: NO_VERSION };
  }
  if (version > schema.version) return { ok: false, message: TOO_NEW };

  const migrated = version < schema.version;
  const current = migrated ? migrate(parsed, version, schema) : parsed;
  if (current === null) return { ok: false, message: NOT_MIGRATED };

  const rawLetter = own(current, 'letter');
  if (!isRecord(rawLetter)) return { ok: false, message: NO_LETTER };

  const notes = new Notes();
  const savedAt = savedTime(own(current, 'savedAt'));

  const rawSettings = own(current, 'settings');
  const checked = validateSettings(rawSettings);
  if (rawSettings === undefined) {
    notes.add('Settings: the draft had no settings, so the usual Pack 137 settings are used.');
  } else for (const problem of checked.problems) notes.add(`Settings: ${problem.message}`);

  const letter = letterFrom(rawLetter, checked.settings, savedAt, notes);
  return {
    ok: true,
    draft: {
      kind: DRAFT_KIND,
      version: schema.version,
      savedAt,
      letter,
      settings: checked.settings,
    },
    migrated,
    notes: notes.list(),
  };
}

/**
 * `readDraft` against a given schema version and migration table. The app always goes through
 * `readDraft`; this exists so the migration steps can be tested before a second version exists.
 */
export function readDraftWith(text: string, schema: DraftSchema): DraftReadResult {
  try {
    return read(text, schema);
  } catch {
    // Not expected: every step above checks before it reads. Kept so that opening a file can
    // never take the app down.
    return { ok: false, message: NOT_READABLE };
  }
}

/**
 * Reads draft file text from a file or from device storage. Refuses text over MAX_DRAFT_BYTES
 * (measured as UTF-8, before parsing), text that is not JSON, JSON that is not a Pack 137 draft,
 * and versions newer than DRAFT_VERSION, each with a plain message. Migrates older versions
 * through DRAFT_MIGRATIONS. Builds a fresh letter field by field (replacing bad values with empty
 * ones, removing what cannot be kept, and saying so in `notes`) and checks the settings with
 * validateSettings. Never throws.
 *
 * What it does not do: check link and photo addresses. Those stay as typed, as they do while
 * editing, and the renderer puts every one through the URL allow-list when it writes the HTML.
 */
export function readDraft(text: string): DraftReadResult {
  return readDraftWith(text, { version: DRAFT_VERSION, migrations: DRAFT_MIGRATIONS });
}

/** True when the date falls before the first day of the issue month. */
function isBeforeIssue(date: CalendarDate, issue: MonthOfYear): boolean {
  return date.year < issue.year || (date.year === issue.year && date.month < issue.month);
}

/**
 * Starts this month's issue from last month's (spec 8.1 step 1): a copy of the letter for the given
 * issue month, keeping the structure, standing text and recurring sections, with dated items that
 * are already past removed. The old letter is not changed.
 */
export function nextIssueFrom(letter: LetterForm, issue: MonthOfYear): LetterForm {
  // A deep copy, so editing the new issue can never change last month's letter in memory.
  const next = structuredClone(letter);

  // The masthead shows the new month. A fresh object, so the caller's `issue` is not shared.
  next.issue = { year: issue.year, month: issue.month };

  // The summary line is written for one issue ("Fall camping at Watchung and a big month around
  // the pack."), and it also feeds the preview text, so it starts empty.
  next.summary = '';

  // Coming up and On the horizon: an item dated before the first day of the new issue month has
  // already happened by the time this issue goes out, so it goes. Items in the new month or later
  // stay, because last month's "on the horizon" is often this month's "coming up" and the editor
  // can move or reword them. Order is kept.
  next.comingUp.items = next.comingUp.items.filter((item) => !isBeforeIssue(item.date, issue));
  next.horizon.items = next.horizon.items.filter((item) => !isBeforeIssue(item.date, issue));

  // Everything else is kept as a starting point, on purpose:
  // - greeting, feedback block, sign-off and the Coming up button are standing text that rarely
  //   changes from month to month;
  // - the optional section switches keep the shape the editor chose last time;
  // - the Coming up intro, the "how to help" line and the year link text are standing wording;
  // - the intro, the story blocks, the closing and the Around the pack items are last month's
  //   words. They are kept so the new issue opens with the same structure (which blocks, in which
  //   order, with which contributors) for the editor to write over, instead of a blank page.
  //   Nothing dated lives in them, so there is no rule that could safely thin them out.
  return next;
}
