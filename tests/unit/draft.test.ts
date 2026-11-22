/**
 * Draft files (build spec 8.3; ADR 0004, Settings item 3). A draft file is untrusted: it is parsed
 * as data, checked field by field, migrated when older, and never trusted for paths or keys.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DRAFT_KIND,
  DRAFT_MIGRATIONS,
  DRAFT_VERSION,
  MAX_DRAFT_BYTES,
  nextIssueFrom,
  readDraft,
  readDraftWith,
  writeDraft,
  type DraftMigration,
  type DraftReadResult,
} from '../../src/core/draft';
import { emptyLetter, type LetterForm } from '../../src/core/letter';
import { defaultSettings } from '../../src/core/settings';
import { budget } from './budget';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureText = readFileSync(
  join(here, '..', 'fixtures', 'monthly', '2026-11.draft.json'),
  'utf8',
);
const EM_DASH = String.fromCharCode(0x2014);
const SAVED = new Date('2026-11-22T15:04:05.000Z');

function fixture(): LetterForm {
  return JSON.parse(fixtureText) as LetterForm;
}

type LooseSection = Record<string, unknown>;

/** The letter as loose data, so a test can put a wrong value anywhere. */
interface LooseLetter {
  [key: string]: unknown;
  story: LooseSection;
  closing: LooseSection;
  photoAsk: LooseSection;
  around: LooseSection;
  comingUp: LooseSection;
  horizon: LooseSection;
  feedback: LooseSection;
}

/** A loose copy of the fixture letter, for breaking one field at a time. */
function looseLetter(): LooseLetter {
  return JSON.parse(fixtureText) as LooseLetter;
}

function fileOf(letter: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: DRAFT_KIND,
    version: DRAFT_VERSION,
    savedAt: SAVED.toISOString(),
    letter,
    settings: defaultSettings(),
    ...extra,
  });
}

type Opened = Extract<DraftReadResult, { ok: true }>;

function opened(text: string): Opened {
  const result = readDraft(text);
  if (!result.ok) throw new Error(`expected the draft to open, got: ${result.message}`);
  expectPlainNotes(result.notes);
  return result;
}

function refused(text: string): string {
  const result = readDraft(text);
  if (result.ok) throw new Error('expected the draft to be refused');
  expect(result.message).not.toBe('');
  expect(result.message).not.toContain(EM_DASH);
  return result.message;
}

function expectPlainNotes(notes: string[]): void {
  expect(notes.length).toBeLessThanOrEqual(20);
  for (const note of notes) {
    expect(note).not.toBe('');
    expect(note).not.toContain(EM_DASH);
    expect(note.length).toBeLessThan(300);
  }
}

/** Opens the fixture with one change made by `change`, and returns the result. */
function openedWith(change: (letter: LooseLetter) => void): Opened {
  const letter = looseLetter();
  change(letter);
  return opened(fileOf(letter));
}

describe('readDraft: round trip', () => {
  it('reads back the November 2026 letter and the settings with no notes', () => {
    const result = opened(writeDraft(fixture(), defaultSettings(), SAVED));
    expect(result.notes).toEqual([]);
    expect(result.migrated).toBe(false);
    expect(result.draft.letter).toEqual(fixture());
    expect(result.draft.settings).toEqual(defaultSettings());
    expect(result.draft.kind).toBe(DRAFT_KIND);
    expect(result.draft.version).toBe(DRAFT_VERSION);
    expect(result.draft.savedAt).toBe(SAVED.toISOString());
  });

  it('reads back a blank letter with no notes', () => {
    const blank = emptyLetter({ year: 2026, month: 12 });
    const result = opened(writeDraft(blank, defaultSettings(), SAVED));
    expect(result.notes).toEqual([]);
    expect(result.draft.letter).toEqual(blank);
  });

  it('writes the same text again from what it read', () => {
    const text = writeDraft(fixture(), defaultSettings(), SAVED);
    const { draft } = opened(text);
    expect(writeDraft(draft.letter, draft.settings, new Date(draft.savedAt))).toBe(text);
  });

  it('keeps optional parts: times, photo widths, link addresses in text and line breaks', () => {
    const letter = emptyLetter({ year: 2026, month: 12 });
    letter.intro = [
      { kind: 'text', text: 'Bold link', marks: ['em', 'strong'], href: 'https://example.org/' },
      { kind: 'break' },
      { kind: 'text', text: 'struck', marks: ['strike'] },
    ];
    letter.story.blocks = [
      { kind: 'photo', photo: { src: 'https://example.org/a.jpg', alt: 'A tent', caption: '' } },
      {
        kind: 'photo',
        photo: { src: 'https://example.org/b.jpg', alt: 'A fire', width: 300, caption: 'Fire' },
      },
      {
        kind: 'sidebar',
        title: 'Recipe',
        source: '',
        body: [[{ kind: 'text', text: 'Mix.', marks: [] }]],
      },
      {
        kind: 'sidebar',
        title: 'Recipe',
        source: 'A book',
        body: [],
        photo: { src: 'https://example.org/c.jpg', alt: 'A pot', caption: '' },
      },
      {
        kind: 'stats',
        stats: [
          { value: '73', text: 'campers' },
          { value: '2', text: 'nights' },
        ],
      },
    ];
    letter.comingUp.items = [
      {
        date: { year: 2026, month: 12, day: 6 },
        time: { hour: 0, minute: 0 },
        text: [],
        link: { text: '', url: '' },
      },
      {
        date: { year: 2028, month: 2, day: 29 },
        text: [{ kind: 'text', text: 'Leap day', marks: [] }],
        link: { text: 'Go', url: 'https://example.org/' },
      },
    ];
    const result = opened(writeDraft(letter, defaultSettings(), SAVED));
    expect(result.notes).toEqual([]);
    expect(result.draft.letter).toEqual(letter);
  });
});

describe('readDraft: refusals', () => {
  it('refuses a file over the size limit before parsing it', () => {
    const big = fileOf(fixture(), { padding: 'x'.repeat(6 * 1024 * 1024) });
    const start = performance.now();
    const message = refused(big);
    expect(performance.now() - start).toBeLessThan(budget(200));
    expect(message).toMatch(/too large/i);
  });

  it('measures bytes, not characters', () => {
    // Each of these characters is three bytes in UTF-8, so the text is under the limit in
    // characters and over it in bytes.
    const count = Math.floor(MAX_DRAFT_BYTES / 3);
    const wide = fileOf(fixture(), { padding: '€'.repeat(count) });
    expect(wide.length).toBeLessThan(MAX_DRAFT_BYTES);
    expect(refused(wide)).toMatch(/too large/i);
  });

  it('opens a file just under the limit', () => {
    const base = fileOf(fixture(), { padding: '' });
    const text = fileOf(fixture(), { padding: 'x'.repeat(MAX_DRAFT_BYTES - base.length) });
    expect(text.length).toBe(MAX_DRAFT_BYTES);
    expect(readDraft(text).ok).toBe(true);
    expect(readDraft(text + ' ').ok).toBe(false);
  });

  it.each([
    ['empty text', ''],
    ['plain words', 'Dear families, here is the news.'],
    ['HTML', '<!doctype html><html><body><script>alert(1)</script></body></html>'],
    ['truncated JSON', writeDraft(fixture(), defaultSettings(), SAVED).slice(0, 9000)],
    ['JSON with a trailing comma', '{"kind":"pack137-letter-draft","version":1,}'],
  ])('refuses %s as unreadable', (_name, text) => {
    expect(refused(text)).toBe(
      'This file could not be read. It may be damaged or it may not be a draft file.',
    );
  });

  it.each([
    ['null', 'null'],
    ['a number', '42'],
    ['a string', '"pack137-letter-draft"'],
    ['an array', '[{"kind":"pack137-letter-draft","version":1}]'],
    ['an empty object', '{}'],
    ['another kind', '{"kind":"something-else","version":1,"letter":{}}'],
    ['a kind that is not text', '{"kind":["pack137-letter-draft"],"version":1,"letter":{}}'],
    ['a bare letter', fixtureText],
  ])('refuses %s as not a draft', (_name, text) => {
    expect(refused(text)).toBe('This file is not a Pack 137 letter draft.');
  });

  it.each([
    ['missing', undefined],
    ['text', '1'],
    ['a fraction', 1.5],
    ['zero', 0],
    ['negative', -1],
    ['null', null],
    ['a list', [1]],
  ])('refuses a version that is %s', (_name, version) => {
    expect(refused(fileOf(fixture(), { version }))).toBe(
      'This draft does not say which version it is, so it cannot be opened.',
    );
  });

  it('refuses a newer version', () => {
    expect(refused(`{"kind":"${DRAFT_KIND}","version":2}`)).toBe(
      'This draft was made by a newer version of the tool. Update the tool to open it.',
    );
    expect(refused(fileOf(fixture(), { version: DRAFT_VERSION + 1 }))).toMatch(/newer version/);
    expect(refused(fileOf(fixture(), { version: 1e308 }))).toMatch(/newer version/);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['text', 'letter'],
    ['a list', [fixture()]],
  ])('refuses a draft whose letter is %s', (_name, letter) => {
    expect(refused(fileOf(letter))).toBe('This draft has no letter in it.');
  });

  it('refuses text that is not a string without throwing', () => {
    const notText = 42 as unknown as string;
    expect(readDraft(notText).ok).toBe(false);
  });
});

describe('readDraft: migration', () => {
  it('has no migrations yet, since version 1 is the first', () => {
    expect(Object.keys(DRAFT_MIGRATIONS)).toEqual([]);
    expect(DRAFT_VERSION).toBe(1);
  });

  // A pretend future: the tool is at version 3. Version 1 called the summary "tagline" and
  // version 2 kept the sign-off outside the letter.
  const migrations: Record<number, DraftMigration> = {
    1: (draft) => {
      const letter = draft.letter as Record<string, unknown>;
      const { tagline, ...rest } = letter;
      return { ...draft, letter: { ...rest, summary: tagline } };
    },
    2: (draft) => {
      const letter = draft.letter as Record<string, unknown>;
      return { ...draft, letter: { ...letter, signOff: draft.signOff } };
    },
  };
  const future = { version: 3, migrations };

  function oldFile(version: number): string {
    const { summary, signOff, ...rest } = fixture();
    const letter = version === 1 ? { ...rest, tagline: summary } : { ...rest, summary };
    return fileOf(letter, { version, signOff });
  }

  it('upgrades a version 1 file through every step', () => {
    const result = readDraftWith(oldFile(1), future);
    if (!result.ok) throw new Error(result.message);
    expect(result.migrated).toBe(true);
    expect(result.notes).toEqual([]);
    expect(result.draft.version).toBe(3);
    expect(result.draft.letter).toEqual(fixture());
  });

  it('upgrades a version 2 file through the last step only', () => {
    const result = readDraftWith(oldFile(2), future);
    if (!result.ok) throw new Error(result.message);
    expect(result.migrated).toBe(true);
    expect(result.draft.letter).toEqual(fixture());
  });

  it('does not migrate a current file', () => {
    const result = readDraftWith(fileOf(fixture(), { version: 3 }), future);
    if (!result.ok) throw new Error(result.message);
    expect(result.migrated).toBe(false);
    expect(result.draft.version).toBe(3);
  });

  it('still refuses a newer file', () => {
    const result = readDraftWith(fileOf(fixture(), { version: 4 }), future);
    expect(result).toEqual({
      ok: false,
      message: 'This draft was made by a newer version of the tool. Update the tool to open it.',
    });
  });

  it('refuses plainly when a step is missing, throws, or returns something odd', () => {
    const message = 'This older draft could not be brought up to date, so it cannot be opened.';
    const broken: Record<number, DraftMigration>[] = [
      { 2: migrations[2] as DraftMigration },
      {
        1: () => {
          throw new Error('boom');
        },
        2: migrations[2] as DraftMigration,
      },
      { 1: () => null as unknown as Record<string, unknown>, 2: migrations[2] as DraftMigration },
    ];
    for (const table of broken) {
      expect(readDraftWith(oldFile(1), { version: 3, migrations: table })).toEqual({
        ok: false,
        message,
      });
    }
  });

  it('validates what a migration returns like any other input', () => {
    const table: Record<number, DraftMigration> = {
      1: (draft) => ({ ...draft, letter: { ...(draft.letter as object), summary: 12 } }),
      2: (draft) => draft,
    };
    const result = readDraftWith(oldFile(2), { version: 3, migrations: table });
    if (!result.ok) throw new Error(result.message);
    expect(result.draft.letter.signOff).toBe('');
    expect(result.notes.length).toBeGreaterThan(0);
  });
});

describe('readDraft: field by field', () => {
  it('replaces a string that is not a string with an empty one and says so', () => {
    const result = openedWith((l) => {
      l.summary = 12 as never;
      l.greeting = null as never;
      l.feedback.subject = { text: 'x' };
      l.closing.signer = ['x'];
      delete l.photoAsk.linkText;
    });
    const { letter } = result.draft;
    expect(letter.summary).toBe('');
    expect(letter.greeting).toBe('');
    expect(letter.feedback.subject).toBe('');
    expect(letter.closing.signer).toBe('');
    expect(letter.photoAsk.linkText).toBe('');
    expect(result.notes).toHaveLength(5);
    expect(letter.signOff).toBe(fixture().signOff);
    expect(letter.story).toEqual(fixture().story);
  });

  it('always sets the letter version to 1', () => {
    const result = openedWith((l) => {
      l.version = 'x' as never;
    });
    expect(result.draft.letter.version).toBe(1);
  });

  it('checks rich text run by run', () => {
    const result = openedWith((l) => {
      l.intro = [
        { kind: 'text', text: 'kept', marks: ['strong'] },
        { kind: 'text', text: 'marks cleaned', marks: ['strong', 'blink', 'em', 'strong', 7] },
        { kind: 'text', text: 'href dropped', marks: [], href: 12 },
        { kind: 'text', text: 'href kept', marks: [], href: 'https://example.org/' },
        { kind: 'text', text: 'no marks' },
        { kind: 'break', extra: 'gone' },
        { kind: 'text', text: 99, marks: [] },
        { kind: 'script', text: 'alert(1)' },
        'loose text',
        null,
        [{ kind: 'text', text: 'nested', marks: [] }],
      ] as never;
    });
    expect(result.draft.letter.intro).toEqual([
      { kind: 'text', text: 'kept', marks: ['strong'] },
      { kind: 'text', text: 'marks cleaned', marks: ['em', 'strong'] },
      { kind: 'text', text: 'href dropped', marks: [] },
      { kind: 'text', text: 'href kept', marks: [], href: 'https://example.org/' },
      { kind: 'text', text: 'no marks', marks: [] },
      { kind: 'break' },
    ]);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it('empties rich text that is not a list', () => {
    const result = openedWith((l) => {
      l.intro = 'Hello' as never;
      l.comingUp.howToHelp = { kind: 'text', text: 'x', marks: [] };
      l.closing.paragraphs = 'x';
      l.closing.thanks = [[{ kind: 'break' }], 'x', [{ kind: 'text', text: 'ok', marks: [] }]];
    });
    const { letter } = result.draft;
    expect(letter.intro).toEqual([]);
    expect(letter.comingUp.howToHelp).toEqual([]);
    expect(letter.closing.paragraphs).toEqual([]);
    expect(letter.closing.thanks).toEqual([
      [{ kind: 'break' }],
      [{ kind: 'text', text: 'ok', marks: [] }],
    ]);
    expect(result.notes.length).toBeGreaterThanOrEqual(4);
  });

  it.each([
    ['Feb 30', { year: 2027, month: 2, day: 30 }],
    ['Feb 29 in a common year', { year: 2027, month: 2, day: 29 }],
    ['month 13', { year: 2027, month: 13, day: 1 }],
    ['day 0', { year: 2027, month: 1, day: 0 }],
    ['a fraction', { year: 2027, month: 1, day: 1.5 }],
    ['text parts', { year: '2027', month: '1', day: '9' }],
    ['a two digit year', { year: 27, month: 1, day: 9 }],
    ['a far year', { year: 275761, month: 1, day: 9 }],
    ['a string', '2027-01-09'],
    ['null', null],
    ['missing', undefined],
  ])('removes dated items whose date is %s', (_name, date) => {
    const result = openedWith((l) => {
      const coming = l.comingUp.items as Record<string, unknown>[];
      const horizon = l.horizon.items as Record<string, unknown>[];
      (coming[1] as Record<string, unknown>).date = date;
      (horizon[0] as Record<string, unknown>).date = date;
    });
    const { letter } = result.draft;
    expect(letter.comingUp.items).toEqual([
      fixture().comingUp.items[0],
      fixture().comingUp.items[2],
    ]);
    expect(letter.horizon.items).toEqual(fixture().horizon.items.slice(1));
    expect(result.notes).toHaveLength(2);
  });

  it.each([
    ['hour 24', { hour: 24, minute: 0 }],
    ['minute 60', { hour: 8, minute: 60 }],
    ['negative', { hour: -1, minute: 0 }],
    ['a fraction', { hour: 8.5, minute: 0 }],
    ['text', '8:00 pm'],
    ['null', null],
  ])('drops a time that is %s but keeps the item', (_name, time) => {
    const result = openedWith((l) => {
      ((l.comingUp.items as Record<string, unknown>[])[0] as Record<string, unknown>).time = time;
    });
    const first = result.draft.letter.comingUp.items[0];
    expect(first).toEqual({ ...fixture().comingUp.items[0], time: undefined });
    expect(first !== undefined && 'time' in first).toBe(false);
    expect(result.notes).toHaveLength(1);
  });

  it('accepts the edges of a time', () => {
    const result = openedWith((l) => {
      const items = l.comingUp.items as Record<string, unknown>[];
      (items[0] as Record<string, unknown>).time = { hour: 23, minute: 59 };
      (items[1] as Record<string, unknown>).time = { hour: 0, minute: 0 };
    });
    expect(result.notes).toEqual([]);
    expect(result.draft.letter.comingUp.items[0]?.time).toEqual({ hour: 23, minute: 59 });
    expect(result.draft.letter.comingUp.items[1]?.time).toEqual({ hour: 0, minute: 0 });
  });

  it.each([
    ['month 0', { year: 2026, month: 0 }],
    ['month 13', { year: 2026, month: 13 }],
    ['year 1999', { year: 1999, month: 11 }],
    ['year 2101', { year: 2101, month: 11 }],
    ['fractions', { year: 2026.5, month: 11.5 }],
    ['text', 'November 2026'],
    ['missing', undefined],
  ])('falls back to the month the draft was saved when the issue is %s', (_name, issue) => {
    const result = openedWith((l) => {
      l.issue = issue as never;
    });
    expect(result.draft.letter.issue).toEqual({ year: 2026, month: 11 });
    expect(result.notes).toHaveLength(1);
  });

  it('accepts the edges of the issue month', () => {
    for (const issue of [
      { year: 2000, month: 1 },
      { year: 2100, month: 12 },
    ]) {
      const result = openedWith((l) => {
        l.issue = issue as never;
      });
      expect(result.notes).toEqual([]);
      expect(result.draft.letter.issue).toEqual(issue);
    }
  });

  it('uses the default switch position when an enabled flag is not true or false', () => {
    const result = openedWith((l) => {
      l.closing.enabled = 'false';
      l.photoAsk.enabled = 0;
      l.around.enabled = null;
      delete l.horizon.enabled;
    });
    const { letter } = result.draft;
    expect(letter.closing.enabled).toBe(true);
    expect(letter.photoAsk.enabled).toBe(true);
    expect(letter.around.enabled).toBe(true);
    expect(letter.horizon.enabled).toBe(true);
    expect(result.notes).toHaveLength(4);
  });

  it('keeps switches that are off', () => {
    const result = openedWith((l) => {
      l.closing.enabled = false;
      l.photoAsk.enabled = false;
      l.around.enabled = false;
      l.horizon.enabled = false;
    });
    expect(result.notes).toEqual([]);
    const { letter } = result.draft;
    expect([
      letter.closing.enabled,
      letter.photoAsk.enabled,
      letter.around.enabled,
      letter.horizon.enabled,
    ]).toEqual([false, false, false, false]);
  });

  it('resets a whole section that is missing or not an object, with one note each', () => {
    const result = openedWith((l) => {
      delete (l as Record<string, unknown>).closing;
      (l as Record<string, unknown>).feedback = 'x';
      (l as Record<string, unknown>).comingUp = [1, 2];
    });
    const blank = emptyLetter({ year: 2026, month: 11 });
    const { letter } = result.draft;
    expect(letter.closing).toEqual(blank.closing);
    expect(letter.feedback).toEqual(blank.feedback);
    expect(letter.comingUp).toEqual(blank.comingUp);
    expect(letter.story).toEqual(fixture().story);
    expect(result.notes).toHaveLength(3);
  });

  it('opens a letter that is an empty object as a blank letter', () => {
    const result = opened(fileOf({}));
    const blank = emptyLetter({ year: 2026, month: 11 });
    expect(result.draft.letter).toEqual({ ...blank, summary: '', greeting: '', signOff: '' });
    expect(result.notes.length).toBeGreaterThan(5);
  });
});

describe('readDraft: story blocks', () => {
  function withBlocks(blocks: unknown): Opened {
    return openedWith((l) => {
      l.story.blocks = blocks;
    });
  }

  it('drops unknown block kinds with a note and keeps the rest in order', () => {
    const good = fixture().story.blocks;
    const result = withBlocks([
      good[0],
      { kind: 'video', src: 'https://example.org/v.mp4' },
      { kind: 'script', text: 'alert(1)' },
      good[1],
      { noKind: true },
      'photo',
      null,
      [good[2]],
      good[2],
    ]);
    expect(result.draft.letter.story.blocks).toEqual([good[0], good[1], good[2]]);
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.notes.join(' ')).toMatch(/Story block 2/);
  });

  it('gives a stat band exactly two stats', () => {
    const result = withBlocks([
      { kind: 'stats', stats: [{ value: '1', text: 'one' }] },
      {
        kind: 'stats',
        stats: [
          { value: '1', text: 'one' },
          { value: '2', text: 'two' },
          { value: '3', text: 'three' },
        ],
      },
      { kind: 'stats', stats: 'many' },
      { kind: 'stats', stats: [{ value: 7, text: null }, 'x'] },
      { kind: 'stats' },
    ]);
    const empty = { value: '', text: '' };
    expect(result.draft.letter.story.blocks).toEqual([
      { kind: 'stats', stats: [{ value: '1', text: 'one' }, empty] },
      {
        kind: 'stats',
        stats: [
          { value: '1', text: 'one' },
          { value: '2', text: 'two' },
        ],
      },
      { kind: 'stats', stats: [empty, empty] },
      { kind: 'stats', stats: [empty, empty] },
      { kind: 'stats', stats: [empty, empty] },
    ]);
    expect(result.notes.length).toBeGreaterThanOrEqual(5);
  });

  it('checks a photo block', () => {
    const result = withBlocks([
      { kind: 'photo', photo: { src: 1, alt: 2, caption: 3, width: 'wide', onload: 'x' } },
      { kind: 'photo', photo: 'https://example.org/a.jpg' },
      { kind: 'photo' },
      {
        kind: 'photo',
        photo: { src: 'https://example.org/a.jpg', alt: 'A', caption: '', width: 0 },
      },
      {
        kind: 'photo',
        photo: { src: 'https://example.org/a.jpg', alt: 'A', caption: '', width: 553 },
      },
      {
        kind: 'photo',
        photo: { src: 'https://example.org/a.jpg', alt: 'A', caption: '', width: 552 },
      },
    ]);
    const blank = { src: '', alt: '', caption: '' };
    const plain = { src: 'https://example.org/a.jpg', alt: 'A', caption: '' };
    expect(result.draft.letter.story.blocks).toEqual([
      { kind: 'photo', photo: blank },
      { kind: 'photo', photo: blank },
      { kind: 'photo', photo: blank },
      { kind: 'photo', photo: plain },
      { kind: 'photo', photo: plain },
      { kind: 'photo', photo: { ...plain, width: 552 } },
    ]);
    for (const block of result.draft.letter.story.blocks) {
      if (block.kind === 'photo') expect('width' in block.photo).toBe(block.photo.width === 552);
    }
  });

  it('checks a contributor block and its parts', () => {
    const run = { kind: 'text', text: 'Hello', marks: [] };
    const result = withBlocks([
      {
        kind: 'contributor',
        name: 5,
        role: 'Chair',
        parts: [
          { kind: 'paragraph', text: [run] },
          { kind: 'paragraph', text: 'loose' },
          { kind: 'table', rows: [] },
          { kind: 'list', items: [{ lead: 'A:', text: [run] }, { lead: 3 }, 'x'] },
          { kind: 'list', items: 'none' },
          null,
        ],
      },
      { kind: 'contributor', name: 'A', role: 'B', parts: 'none' },
    ]);
    expect(result.draft.letter.story.blocks).toEqual([
      {
        kind: 'contributor',
        name: '',
        role: 'Chair',
        parts: [
          { kind: 'paragraph', text: [run] },
          { kind: 'paragraph', text: [] },
          {
            kind: 'list',
            items: [
              { lead: 'A:', text: [run] },
              { lead: '', text: [] },
            ],
          },
          { kind: 'list', items: [] },
        ],
      },
      { kind: 'contributor', name: 'A', role: 'B', parts: [] },
    ]);
  });

  it('checks a sidebar block', () => {
    const run = { kind: 'text', text: 'Mix.', marks: [] };
    const result = withBlocks([
      { kind: 'sidebar', title: 'T', source: 4, body: [[run], 'x'], photo: 'x' },
      {
        kind: 'sidebar',
        title: 'T',
        source: 'S',
        body: 'x',
        photo: { src: 's', alt: 'a', caption: 'c' },
      },
    ]);
    const blocks = result.draft.letter.story.blocks;
    expect(blocks).toEqual([
      { kind: 'sidebar', title: 'T', source: '', body: [[run]] },
      {
        kind: 'sidebar',
        title: 'T',
        source: 'S',
        body: [],
        photo: { src: 's', alt: 'a', caption: 'c' },
      },
    ]);
    expect(blocks[0] !== undefined && 'photo' in blocks[0]).toBe(false);
  });

  it('resets the story when it is not an object and empties blocks that are not a list', () => {
    expect(
      openedWith((l) => {
        (l as Record<string, unknown>).story = 'x';
      }).draft.letter.story,
    ).toEqual({ title: '', blocks: [] });
    const result = withBlocks({ 0: fixture().story.blocks[0], length: 1 });
    expect(result.draft.letter.story).toEqual({ title: fixture().story.title, blocks: [] });
    expect(result.notes).toHaveLength(1);
  });
});

describe('readDraft: limits', () => {
  const run = { kind: 'text', text: 'x', marks: [] };

  it('keeps at most 100 story blocks and says it cut the rest', () => {
    const blocks = Array.from({ length: 150 }, (_, i) => ({
      kind: 'contributor',
      name: `Name ${i}`,
      role: '',
      parts: [],
    }));
    const result = openedWith((l) => {
      l.story.blocks = blocks;
    });
    expect(result.draft.letter.story.blocks).toHaveLength(100);
    expect(result.draft.letter.story.blocks[99]).toEqual(blocks[99]);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatch(/100/);
  });

  it('keeps exactly 100 blocks and 200 items without a note', () => {
    const result = openedWith((l) => {
      l.story.blocks = Array.from({ length: 100 }, () => ({
        kind: 'contributor',
        name: 'N',
        role: '',
        parts: [],
      }));
      l.horizon.items = Array.from({ length: 200 }, () => ({
        date: { year: 2027, month: 1, day: 9 },
        text: 'x',
      }));
    });
    expect(result.notes).toEqual([]);
    expect(result.draft.letter.story.blocks).toHaveLength(100);
    expect(result.draft.letter.horizon.items).toHaveLength(200);
  });

  it('keeps at most 200 items in every list and says so', () => {
    const many = <T>(item: T): T[] => Array.from({ length: 250 }, () => item);
    const result = openedWith((l) => {
      l.closing.paragraphs = many([run]);
      l.closing.thanks = many([run]);
      l.around.items = many({ lead: 'L', text: [run], link: { text: '', url: '' } });
      l.comingUp.items = many({
        date: { year: 2026, month: 12, day: 6 },
        text: [run],
        link: { text: '', url: '' },
      });
      l.horizon.items = many({ date: { year: 2027, month: 1, day: 9 }, text: 'x' });
      l.story.blocks = [
        {
          kind: 'contributor',
          name: 'N',
          role: '',
          parts: [...many({ kind: 'paragraph', text: [run] })],
        },
        {
          kind: 'contributor',
          name: 'N',
          role: '',
          parts: [{ kind: 'list', items: many({ lead: 'L', text: [run] }) }],
        },
        { kind: 'sidebar', title: 'T', source: '', body: many([run]) },
      ];
    });
    const { letter } = result.draft;
    expect(letter.closing.paragraphs).toHaveLength(200);
    expect(letter.closing.thanks).toHaveLength(200);
    expect(letter.around.items).toHaveLength(200);
    expect(letter.comingUp.items).toHaveLength(200);
    expect(letter.horizon.items).toHaveLength(200);
    const [first, second, third] = letter.story.blocks;
    expect(first?.kind === 'contributor' && first.parts.length).toBe(200);
    const part = second?.kind === 'contributor' ? second.parts[0] : undefined;
    expect(part?.kind === 'list' && part.items.length).toBe(200);
    expect(third?.kind === 'sidebar' && third.body.length).toBe(200);
    expect(result.notes).toHaveLength(8);
  });

  it('caps the pieces of one line of text', () => {
    const result = openedWith((l) => {
      l.intro = Array.from({ length: 5000 }, () => run);
    });
    expect(result.draft.letter.intro.length).toBeLessThan(5000);
    expect(result.draft.letter.intro.length).toBeGreaterThanOrEqual(200);
    expect(result.notes).toHaveLength(1);
  });

  it('gives at most 20 notes, the last one counting the rest', () => {
    const result = openedWith((l) => {
      l.story.blocks = Array.from({ length: 90 }, (_, i) => ({ kind: `mystery-${i}` }));
    });
    expect(result.draft.letter.story.blocks).toEqual([]);
    expect(result.notes).toHaveLength(20);
    expect(result.notes[19]).toMatch(/71 more/);
  });
});

describe('readDraft: settings and saved time', () => {
  it('passes settings through validateSettings and adds its problems to the notes', () => {
    const settings = {
      ...defaultSettings(),
      logoUrl: 'javascript:alert(1)',
      email: { ...defaultSettings().email, feedback: 'pack@x.org?bcc=evil@x.org' },
      extra: 'gone',
    };
    const result = opened(fileOf(fixture(), { settings }));
    expect(result.draft.settings).toEqual(defaultSettings());
    expect(result.notes).toHaveLength(2);
    expect(result.draft.letter).toEqual(fixture());
  });

  it('keeps valid custom settings', () => {
    const settings = {
      ...defaultSettings(),
      photoFormUrl: 'https://example.org/photos',
      programYearStartMonth: 1,
    };
    const result = opened(fileOf(fixture(), { settings }));
    expect(result.notes).toEqual([]);
    expect(result.draft.settings).toEqual(settings);
  });

  it('uses the default settings, with a note, when there are none', () => {
    const result = opened(fileOf(fixture(), { settings: undefined }));
    expect(result.draft.settings).toEqual(defaultSettings());
    expect(result.notes).toHaveLength(1);
  });

  it('fills a reset section from the settings in the file', () => {
    const settings = { ...defaultSettings(), photoFormUrl: 'https://example.org/photos' };
    const letter = looseLetter() as Record<string, unknown>;
    delete letter.photoAsk;
    const result = opened(fileOf(letter, { settings }));
    expect(result.draft.letter.photoAsk.url).toBe('https://example.org/photos');
  });

  it.each([
    ['missing', undefined],
    ['not a date', 'yesterday'],
    ['a number', 1763823845000],
    ['an object', { iso: '2026-11-22T15:04:05.000Z' }],
    ['very long', `2026-11-22T15:04:05.000Z${' '.repeat(5000)}`],
  ])('drops a saved time that is %s, without a note', (_name, savedAt) => {
    const result = opened(fileOf(fixture(), { savedAt }));
    expect(result.draft.savedAt).toBe('');
    expect(result.notes).toEqual([]);
  });

  it('keeps no extra fields at the top', () => {
    const result = opened(fileOf(fixture(), { extra: 'x', path: '../../etc/passwd' }));
    expect(Object.keys(result.draft).sort()).toEqual(
      ['kind', 'letter', 'savedAt', 'settings', 'version'].sort(),
    );
  });
});

describe('readDraft: hostile drafts', () => {
  it('ignores prototype keys at every level and leaves Object.prototype alone', () => {
    const poison =
      '"__proto__":{"polluted":"yes","enabled":false,"kind":"photo"},"constructor":{"prototype":{"polluted":"yes"}},"prototype":{"polluted":"yes"},';
    // Put the poison keys at the start of every object in the file.
    const text = writeDraft(fixture(), defaultSettings(), SAVED).replace(
      /\{(?=\s*")/g,
      `{${poison}`,
    );
    expect(text.split('__proto__').length).toBeGreaterThan(100);
    const result = opened(text);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(result.notes).toEqual([]);
    expect(result.draft.letter).toEqual(fixture());
    expect(result.draft.settings).toEqual(defaultSettings());
    expect(JSON.stringify(result.draft)).not.toContain('polluted');
    expect(Object.getPrototypeOf(result.draft.letter)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.draft.letter.closing)).toBe(Object.prototype);
  });

  it('does not take values from a __proto__ key in place of real fields', () => {
    const text = `{"kind":"${DRAFT_KIND}","version":1,"__proto__":{"letter":${fixtureText}},"letter":{"__proto__":{"summary":"from proto","closing":{"enabled":false}}}}`;
    const result = opened(text);
    expect(result.draft.letter.summary).toBe('');
    expect(result.draft.letter.closing.enabled).toBe(true);
    expect(refused(`{"__proto__":{"kind":"${DRAFT_KIND}","version":1,"letter":{}}}`)).toBe(
      'This file is not a Pack 137 letter draft.',
    );
  });

  it('keeps no extra fields anywhere in the letter', () => {
    const text = writeDraft(fixture(), defaultSettings(), SAVED).replace(
      /\{(?=\s*")/g,
      '{"onload":"alert(1)",',
    );
    const result = opened(text);
    expect(result.draft.letter).toEqual(fixture());
    expect(JSON.stringify(result.draft)).not.toContain('onload');
  });

  it('survives wrong types everywhere', () => {
    const values: unknown[] = [
      null,
      0,
      -1,
      1e308,
      '',
      'x',
      true,
      [],
      {},
      [[]],
      [null],
      { kind: 1 },
    ];
    const keys = Object.keys(fixture());
    for (const value of values) {
      const all: Record<string, unknown> = {};
      for (const key of keys) all[key] = value;
      const result = opened(fileOf(all, { settings: value, savedAt: value }));
      expect(result.draft.letter.version).toBe(1);
      expect(Array.isArray(result.draft.letter.story.blocks)).toBe(true);
      expect(result.draft.settings).toEqual(defaultSettings());
      // Whatever came back is itself a clean draft.
      const again = opened(writeDraft(result.draft.letter, result.draft.settings, SAVED));
      expect(again.notes).toEqual([]);
      expect(again.draft.letter).toEqual(result.draft.letter);
    }
  });

  it('survives wrong types inside every section', () => {
    const values: unknown[] = [null, 7, 'x', true, [], {}, [[]], [null], [{}], [{ kind: 'text' }]];
    for (const value of values) {
      const letter = looseLetter();
      for (const section of Object.values(letter)) {
        if (typeof section !== 'object' || section === null) continue;
        const loose = section as LooseSection;
        for (const key of Object.keys(loose)) loose[key] = value;
      }
      const result = opened(fileOf(letter));
      const again = opened(writeDraft(result.draft.letter, result.draft.settings, SAVED));
      expect(again.notes).toEqual([]);
      expect(again.draft.letter).toEqual(result.draft.letter);
    }
  });

  it('does not throw or hang on JSON nested 100000 levels deep', () => {
    const depth = 100_000;
    const texts = [
      '['.repeat(depth) + ']'.repeat(depth),
      '{"a":'.repeat(depth) + '1' + '}'.repeat(depth),
      `{"kind":"${DRAFT_KIND}","version":1,"letter":${'{"story":'.repeat(depth)}1${'}'.repeat(depth)}}`,
      `{"kind":"${DRAFT_KIND}","version":1,"letter":{"intro":${'['.repeat(depth)}${']'.repeat(depth)}}}`,
      `{"kind":"${DRAFT_KIND}","version":1,"letter":{},"settings":${'{"email":'.repeat(depth)}1${'}'.repeat(depth)}}`,
    ];
    const start = performance.now();
    for (const text of texts) {
      const result = readDraft(text);
      if (result.ok) expectPlainNotes(result.notes);
      else expect(result.message).not.toBe('');
    }
    expect(performance.now() - start).toBeLessThan(budget(2000));
  });

  it('does not let a long odd saved time or huge numbers through', () => {
    const result = opened(
      fileOf(
        { ...fixture(), issue: { year: 1e21, month: -0 } },
        { savedAt: '2026-11-22T15:04:05.000Z<script>' },
      ),
    );
    expect(result.draft.savedAt).toBe('');
    expect(result.draft.letter.issue.month).toBeGreaterThanOrEqual(1);
    expect(result.draft.letter.issue.year).toBeGreaterThanOrEqual(2000);
  });
});

describe('readDraft: speed', () => {
  it('reads a valid draft of 5 MB in under a second', () => {
    const letter = fixture();
    const paragraph = (i: number) => ({
      kind: 'paragraph' as const,
      text: [
        { kind: 'text' as const, text: `Paragraph ${i} `.repeat(40), marks: [] },
        { kind: 'text' as const, text: 'bold words', marks: ['strong' as const] },
        { kind: 'break' as const },
        {
          kind: 'text' as const,
          text: 'a link',
          marks: ['em' as const, 'strong' as const],
          href: 'https://example.org/page',
        },
      ],
    });
    letter.story.blocks = Array.from({ length: 100 }, (_, b) => ({
      kind: 'contributor' as const,
      name: `Contributor ${b}`,
      role: 'Den leader',
      parts: Array.from({ length: 60 }, (_, p) => paragraph(b * 100 + p)),
    }));
    let text = JSON.stringify({
      kind: DRAFT_KIND,
      version: DRAFT_VERSION,
      savedAt: SAVED.toISOString(),
      letter,
      settings: defaultSettings(),
    });
    expect(text.length).toBeLessThan(MAX_DRAFT_BYTES);
    // Fill up to the limit with spaces, which JSON allows at the end.
    text += ' '.repeat(MAX_DRAFT_BYTES - text.length);
    expect(text.length).toBe(MAX_DRAFT_BYTES);
    expect(JSON.stringify(letter).length).toBeGreaterThan(3 * 1024 * 1024);

    const start = performance.now();
    const result = readDraft(text);
    const took = performance.now() - start;
    if (!result.ok) throw new Error(result.message);
    expect(result.notes).toEqual([]);
    expect(result.draft.letter).toEqual(letter);
    expect(took).toBeLessThan(budget(1000));
  });
});

describe('nextIssueFrom', () => {
  const december = { year: 2026, month: 12 };
  const january = { year: 2027, month: 1 };

  it('sets the new issue month and clears the summary', () => {
    const next = nextIssueFrom(fixture(), december);
    expect(next.issue).toEqual(december);
    expect(next.summary).toBe('');
    expect(next.version).toBe(1);
  });

  it('keeps the greeting, structure, story, switches, feedback, sign-off and button', () => {
    const last = fixture();
    last.closing.enabled = false;
    last.horizon.enabled = false;
    const next = nextIssueFrom(last, december);
    expect(next.greeting).toBe(last.greeting);
    expect(next.intro).toEqual(last.intro);
    expect(next.story).toEqual(last.story);
    expect(next.closing).toEqual(last.closing);
    expect(next.photoAsk).toEqual(last.photoAsk);
    expect(next.around).toEqual(last.around);
    expect(next.feedback).toEqual(last.feedback);
    expect(next.signOff).toBe(last.signOff);
    expect(next.comingUp.button).toEqual(last.comingUp.button);
    expect(next.comingUp.intro).toBe(last.comingUp.intro);
    expect(next.comingUp.howToHelp).toEqual(last.comingUp.howToHelp);
    expect(next.horizon.yearLinkText).toBe(last.horizon.yearLinkText);
    expect(next.horizon.enabled).toBe(false);
  });

  it('keeps dated items on or after the first day of the new month', () => {
    const next = nextIssueFrom(fixture(), december);
    expect(next.comingUp.items).toEqual(fixture().comingUp.items);
    expect(next.horizon.items).toEqual(fixture().horizon.items);
  });

  it('removes dated items before the first day of the new month', () => {
    const next = nextIssueFrom(fixture(), january);
    expect(next.comingUp.items).toEqual([]);
    expect(next.horizon.items).toEqual(fixture().horizon.items);
    const february = nextIssueFrom(fixture(), { year: 2027, month: 2 });
    expect(february.horizon.items).toEqual([
      { date: { year: 2027, month: 2, day: 20 }, text: 'Blue and Gold Banquet' },
    ]);
    expect(nextIssueFrom(fixture(), { year: 2027, month: 3 }).horizon.items).toEqual([]);
  });

  it('draws the line at the first day of the month, across a year end', () => {
    const last = emptyLetter({ year: 2026, month: 12 });
    const item = (year: number, month: number, day: number) => ({
      date: { year, month, day },
      text: `${year}-${month}-${day}`,
    });
    last.horizon.items = [
      item(2026, 12, 31),
      item(2027, 1, 1),
      item(2026, 1, 15),
      item(2027, 1, 31),
      item(2028, 1, 1),
      item(2025, 12, 31),
    ];
    const next = nextIssueFrom(last, january);
    expect(next.horizon.items.map((i) => i.text)).toEqual(['2027-1-1', '2027-1-31', '2028-1-1']);
  });

  it('is a deep copy: changing the new letter leaves the old one alone', () => {
    const last = fixture();
    const issue = { year: 2026, month: 12 };
    const next = nextIssueFrom(last, issue);
    next.story.blocks.length = 0;
    next.closing.thanks.push([]);
    next.comingUp.items[0]?.text.push({ kind: 'break' });
    next.comingUp.button.text = 'changed';
    next.issue.month = 5;
    expect(last).toEqual(fixture());
    expect(issue).toEqual({ year: 2026, month: 12 });
  });

  it('gives a letter that opens as a clean draft', () => {
    const next = nextIssueFrom(fixture(), december);
    const result = opened(writeDraft(next, defaultSettings(), SAVED));
    expect(result.notes).toEqual([]);
    expect(result.draft.letter).toEqual(next);
  });
});
