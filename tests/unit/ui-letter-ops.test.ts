import { describe, expect, it } from 'vitest';
import { emptyLetter, type LetterForm } from '../../src/core/letter';
import {
  BLOCK_KINDS,
  OPTIONAL_SECTIONS,
  blockName,
  defaultItemDate,
  letterWarnings,
  newBlock,
  newPart,
  nextMonth,
  parseTime,
  parseYear,
  sectionName,
  setSectionEnabled,
  toTimeValue,
  whenText,
} from '../../src/ui/letter-ops';
import { moveItem, removeAt } from '../../src/ui/paths';

const blank = (): LetterForm => emptyLetter({ year: 2026, month: 12 });

describe('next month', () => {
  it('adds one month and rolls December into January', () => {
    expect(nextMonth({ year: 2026, month: 11, day: 22 })).toEqual({ year: 2026, month: 12 });
    expect(nextMonth({ year: 2026, month: 12, day: 31 })).toEqual({ year: 2027, month: 1 });
  });
});

describe('story blocks', () => {
  it('makes each kind with the right shape', () => {
    expect(BLOCK_KINDS.map((b) => b.kind)).toEqual(['contributor', 'photo', 'stats', 'sidebar']);
    expect(newBlock('contributor')).toMatchObject({ kind: 'contributor', name: '', role: '' });
    expect(newBlock('photo')).toEqual({ kind: 'photo', photo: { src: '', alt: '', caption: '' } });
    const stats = newBlock('stats');
    expect(stats.kind === 'stats' && stats.stats).toHaveLength(2);
    expect(newBlock('sidebar')).toMatchObject({ kind: 'sidebar', body: [[]] });
    expect(blockName('stats')).toBe('Stat band');
  });

  it('gives each new block its own objects', () => {
    const a = newBlock('stats');
    const b = newBlock('stats');
    if (a.kind === 'stats') a.stats[0].value = '48';
    expect(b.kind === 'stats' && b.stats[0].value).toBe('');
  });

  it('adds, moves and removes blocks on a letter', () => {
    const letter = blank();
    letter.story.blocks.push(newBlock('contributor'), newBlock('photo'), newBlock('stats'));
    expect(moveItem(letter.story.blocks, 2, 0)).toBe(true);
    expect(letter.story.blocks.map((b) => b.kind)).toEqual(['stats', 'contributor', 'photo']);
    expect(moveItem(letter.story.blocks, 0, 1)).toBe(true);
    expect(letter.story.blocks.map((b) => b.kind)).toEqual(['contributor', 'stats', 'photo']);
    expect(removeAt(letter.story.blocks, 1)).toBe(true);
    expect(letter.story.blocks.map((b) => b.kind)).toEqual(['contributor', 'photo']);
  });

  it('refuses moves and removals outside the list', () => {
    const list = [1, 2, 3];
    expect(moveItem(list, 0, 3)).toBe(false);
    expect(moveItem(list, -1, 1)).toBe(false);
    expect(moveItem(list, 1, 1)).toBe(false);
    expect(removeAt(list, 3)).toBe(false);
    expect(list).toEqual([1, 2, 3]);
  });

  it('makes paragraph and bullet list parts, which can be reordered', () => {
    const block = newBlock('contributor');
    if (block.kind !== 'contributor') throw new Error('expected a contributor');
    block.parts.push(newPart('list'));
    expect(block.parts.map((p) => p.kind)).toEqual(['paragraph', 'list']);
    const list = block.parts[1];
    expect(list?.kind === 'list' && list.items).toEqual([{ lead: '', text: [] }]);
    moveItem(block.parts, 1, 0);
    expect(block.parts.map((p) => p.kind)).toEqual(['list', 'paragraph']);
  });
});

describe('optional sections', () => {
  it('lists the four switches in letter order, with plain names', () => {
    expect(OPTIONAL_SECTIONS).toEqual(['closing', 'photoAsk', 'around', 'horizon']);
    expect(OPTIONAL_SECTIONS.map(sectionName)).toEqual([
      'Closing and high fives',
      'Photo and story ask',
      'Around the pack',
      'On the horizon',
    ]);
  });

  it('turns a section off and on without losing what was typed', () => {
    const letter = blank();
    letter.around.items.push({ lead: 'Bake sale', text: [], link: { text: '', url: '' } });
    setSectionEnabled(letter, 'around', false);
    expect(letter.around.enabled).toBe(false);
    expect(letter.around.items).toHaveLength(1);
    setSectionEnabled(letter, 'around', true);
    expect(letter.around.enabled).toBe(true);
    expect(letter.closing.enabled).toBe(true);
  });
});

describe('time field', () => {
  it('reads a time input value', () => {
    expect(parseTime('20:00')).toEqual({ hour: 20, minute: 0 });
    expect(parseTime('00:05')).toEqual({ hour: 0, minute: 5 });
    expect(parseTime('09:30:15')).toEqual({ hour: 9, minute: 30 });
  });

  it('reads typed times with am or pm', () => {
    expect(parseTime('8:00 pm')).toEqual({ hour: 20, minute: 0 });
    expect(parseTime('12:15 am')).toEqual({ hour: 0, minute: 15 });
    expect(parseTime('12:15 PM')).toEqual({ hour: 12, minute: 15 });
    expect(parseTime('7 p.m.')).toEqual({ hour: 19, minute: 0 });
  });

  it('refuses what is not a time', () => {
    for (const bad of ['', 'noon', '24:00', '8:60', '13:00 pm', '0:30 am', '8', '8:0']) {
      expect(parseTime(bad)).toBeUndefined();
    }
  });

  it('formats back for the input and for the letter', () => {
    expect(toTimeValue({ hour: 8, minute: 5 })).toBe('08:05');
    expect(parseTime(toTimeValue({ hour: 23, minute: 59 }))).toEqual({ hour: 23, minute: 59 });
    const date = { year: 2026, month: 12, day: 6 };
    expect(whenText(date, { hour: 20, minute: 0 })).toBe('Sun Dec 6, 8:00 pm');
    expect(whenText(date)).toBe('Sun Dec 6');
  });
});

describe('year and default date', () => {
  it('accepts only four digit years in range', () => {
    expect(parseYear('2027')).toBe(2027);
    expect(parseYear(' 2027 ')).toBe(2027);
    expect(parseYear('202')).toBeUndefined();
    expect(parseYear('20277')).toBeUndefined();
    expect(parseYear('1999')).toBeUndefined();
  });

  it('starts a new item on the first of the issue month', () => {
    expect(defaultItemDate({ year: 2026, month: 12 })).toEqual({ year: 2026, month: 12, day: 1 });
  });
});

describe('things to look at', () => {
  it('flags a blank letter and a photo with no description', () => {
    const letter = blank();
    letter.story.blocks.push(newBlock('photo'));
    const list = letterWarnings(letter);
    expect(list).toContain('The summary line is empty.');
    expect(list).toContain(
      'Photo 1: Add a short description of the photo, so people using screen readers know what it shows.',
    );
    expect(list).toContain('Photo 1: the photo has no address yet.');
  });

  it('is quiet once filled in, and ignores sections that are off', () => {
    const letter = blank();
    letter.summary = 'Camp, crafts and a cold snap.';
    letter.story.title = 'A good month';
    letter.intro = [{ kind: 'text', text: 'Welcome back.', marks: [] }];
    letter.comingUp.items.push({
      date: { year: 2026, month: 12, day: 6 },
      text: [],
      link: { text: '', url: '' },
    });
    letter.story.blocks.push({
      kind: 'photo',
      photo: { src: 'https://example.org/a.jpg', alt: 'Scouts at camp', caption: '' },
    });
    expect(letterWarnings(letter)).toEqual([]);
    letter.around.items.push({ lead: 'x', text: [], link: { text: 'More', url: '' } });
    expect(letterWarnings(letter)).toHaveLength(1);
    setSectionEnabled(letter, 'around', false);
    expect(letterWarnings(letter)).toEqual([]);
  });
});

describe('things to look at: required sections', () => {
  it('flags an empty intro, no story blocks and no Coming up items', () => {
    const list = letterWarnings(blank());
    expect(list).toContain('The intro paragraph is empty.');
    expect(list).toContain('The feature story has no blocks yet.');
    expect(list).toContain('Coming up has no events yet.');
  });

  it('clears each one when the section has content', () => {
    const letter = blank();
    letter.intro = [{ kind: 'text', text: 'Welcome back.', marks: [] }];
    letter.story.blocks.push(newBlock('stats'));
    letter.comingUp.items.push({
      date: { year: 2026, month: 12, day: 6 },
      text: [],
      link: { text: '', url: '' },
    });
    const list = letterWarnings(letter);
    expect(list.filter((m) => /intro|blocks yet|events yet/.test(m))).toEqual([]);
  });

  it('treats a blank intro of spaces as empty', () => {
    const letter = blank();
    letter.intro = [{ kind: 'text', text: '   ', marks: [] }];
    expect(letterWarnings(letter)).toContain('The intro paragraph is empty.');
  });

  it('says nothing about optional sections that are on but empty', () => {
    const list = letterWarnings(blank());
    expect(list.some((m) => /closing|around|horizon|photo and story/i.test(m))).toBe(false);
  });
});

describe('things to look at: photo descriptions', () => {
  const photoLetter = (alt: string, caption = '') => {
    const letter = blank();
    letter.story.blocks.push(newBlock('stats'), {
      kind: 'photo',
      photo: { src: 'https://example.org/a.jpg', alt, caption },
    });
    return letter;
  };
  const altWarnings = (letter: LetterForm) =>
    letterWarnings(letter).filter((m) => m.startsWith('Photo 2'));

  it('gives one warning per problem, named by block number', () => {
    expect(altWarnings(photoLetter('Scouts at camp'))).toEqual([]);
    expect(altWarnings(photoLetter(''))).toHaveLength(1);
    expect(altWarnings(photoLetter('Photo of scouts'))[0]).toMatch(/^Photo 2: .*Photo of/);
    expect(altWarnings(photoLetter('IMG_1234.jpg'))[0]).toMatch(/file name/);
    expect(altWarnings(photoLetter('Scouts at camp', 'scouts at camp.'))[0]).toMatch(
      /repeats the caption/,
    );
    expect(altWarnings(photoLetter('x'.repeat(126)))[0]).toMatch(/125 characters/);
    expect(altWarnings(photoLetter('Photo of IMG_1.jpg'))).toHaveLength(2);
  });

  it('never gives two warnings for a missing description', () => {
    const list = altWarnings(photoLetter(''));
    expect(list.filter((m) => /description|describe/i.test(m))).toHaveLength(1);
  });

  it('covers sidebar photos', () => {
    const letter = blank();
    letter.story.blocks.push(newBlock('contributor'), newBlock('contributor'), {
      kind: 'sidebar',
      title: '',
      source: '',
      body: [],
      photo: { src: 'https://example.org/a.jpg', alt: 'A picture of soup', caption: '' },
    });
    expect(
      letterWarnings(letter).filter((m) => m.startsWith('Sidebar photo in block 3: ')),
    ).toHaveLength(1);
  });
});

describe('warnings for addresses that would be left out', () => {
  it('names the button when its link is not a full address', () => {
    const l = blank();
    l.comingUp.button.url = 'www.example.org';
    expect(letterWarnings(l)).toContain(
      "The I can help button's link is not a full web or email address, so the button is left out.",
    );
  });
  it('stays quiet for a good button link', () => {
    expect(letterWarnings(blank()).some((w) => w.includes('button'))).toBe(false);
  });
  it('warns about a link that would be left out', () => {
    const l = blank();
    l.photoAsk.url = 'javascript:alert(1)';
    expect(
      letterWarnings(l).some(
        (w) => w.startsWith('Photo and story ask: ') && w.includes('left out'),
      ),
    ).toBe(true);
  });
  it('warns about a photo address that is unusable or not secure', () => {
    const l = blank();
    l.story.blocks = [
      { kind: 'photo', photo: { src: 'ftp://x.example/a.jpg', alt: 'A tent', caption: '' } },
      { kind: 'photo', photo: { src: 'http://x.example/a.jpg', alt: 'A tent', caption: '' } },
    ];
    const warnings = letterWarnings(l);
    expect(warnings.some((w) => w.startsWith('Photo 1: ') && w.includes('left out'))).toBe(true);
    expect(warnings).toContain(
      "Photo 2: This photo's address is not secure (http). Use the https address from TroopTrack.",
    );
  });
});
