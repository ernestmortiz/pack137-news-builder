import { describe, expect, it } from 'vitest';
import { packConfig } from '../../src/config/pack.config';
import { defaultSettings } from '../../src/core/settings';
import { emptyLetter, letterWords, readTimeMinutes, readTimeText } from '../../src/core/letter';

describe('read time (spec 8.2)', () => {
  it('is words divided by 230, rounded up', () => {
    expect(readTimeMinutes(230)).toBe(1);
    expect(readTimeMinutes(231)).toBe(2);
    expect(readTimeMinutes(1700)).toBe(8);
  });

  it('is never under one minute', () => {
    expect(readTimeMinutes(0)).toBe(1);
    expect(readTimeMinutes(12)).toBe(1);
  });

  it('is phrased "About an 8 minute read." with the right article', () => {
    expect(readTimeText(1700)).toBe('About an 8 minute read.');
    expect(readTimeText(230 * 11)).toBe('About an 11 minute read.');
    expect(readTimeText(230 * 18)).toBe('About an 18 minute read.');
    expect(readTimeText(230 * 3)).toBe('About a 3 minute read.');
    expect(readTimeText(10)).toBe('About a 1 minute read.');
  });
});

describe('emptyLetter', () => {
  it('starts with the defaults from spec 8.2 and pack.config.ts', () => {
    const letter = emptyLetter({ year: 2026, month: 12 });
    expect(letter.version).toBe(1);
    expect(letter.issue).toEqual({ year: 2026, month: 12 });
    expect(letter.greeting).toBe('Hi Pack 137 families,');
    expect(letter.signOff).toBe('Ernest, for the Pack 137 committee');
    expect(letter.photoAsk.url).toBe(packConfig.photoFormUrl);
    expect(letter.horizon.yearLinkText).toBe('Open the year at a glance');
    expect(letter.comingUp.button.url.startsWith(`mailto:${packConfig.email.volunteer}`)).toBe(
      true,
    );
    expect(letter.story.blocks).toEqual([]);
  });

  it('turns every optional section on and every required one is present', () => {
    const letter = emptyLetter({ year: 2026, month: 12 });
    expect(letter.closing.enabled).toBe(true);
    expect(letter.photoAsk.enabled).toBe(true);
    expect(letter.around.enabled).toBe(true);
    expect(letter.horizon.enabled).toBe(true);
  });
});

describe('letterWords', () => {
  const t = (text: string) => ({ kind: 'text' as const, text, marks: [] });

  it('counts the words a reader sees in the sections that are on', () => {
    const letter = emptyLetter({ year: 2026, month: 12 });
    letter.summary = 'One two three.';
    letter.intro = [t('four five')];
    letter.story.title = 'Six';
    const base = letterWords(letter);
    letter.around.intro = 'seven eight';
    expect(letterWords(letter)).toBe(base + 2);
    letter.around.enabled = false;
    expect(letterWords(letter)).toBeLessThan(base);
  });

  it('counts story blocks, lists and coming up items', () => {
    const letter = emptyLetter({ year: 2026, month: 12 });
    const before = letterWords(letter);
    letter.story.blocks.push({
      kind: 'contributor',
      name: 'Justin Daly',
      role: 'Program Director',
      parts: [
        { kind: 'paragraph', text: [t('a b c')] },
        { kind: 'list', items: [{ lead: 'Camp Crafts:', text: [t('d e')] }] },
      ],
    });
    expect(letterWords(letter)).toBe(before + 2 + 2 + 3 + 2 + 2);
  });
});

describe('emptyLetter with settings (spec 9)', () => {
  it('takes the photo form and volunteer address from the settings given', () => {
    const settings = defaultSettings();
    settings.photoFormUrl = 'https://forms.gle/other';
    settings.email.volunteer = 'helpers@example.org';
    const letter = emptyLetter({ year: 2027, month: 1 }, settings);
    expect(letter.photoAsk.url).toBe('https://forms.gle/other');
    expect(letter.comingUp.button.url).toBe('mailto:helpers@example.org?subject=I%20can%20help');
  });
});

describe('defaultSettings', () => {
  it('copies pack.config.ts and returns a fresh copy every time', () => {
    const a = defaultSettings();
    expect(a.email).toEqual(packConfig.email);
    expect(a.standingLinks).toHaveLength(packConfig.standingLinks.length);
    a.standingLinks.pop();
    a.email.contact = 'changed@example.org';
    expect(defaultSettings().standingLinks).toHaveLength(packConfig.standingLinks.length);
    expect(defaultSettings().email.contact).toBe(packConfig.email.contact);
  });
});
