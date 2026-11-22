import { describe, expect, it } from 'vitest';
import { DRAFT_KIND, DRAFT_VERSION, type DraftFile } from '../../src/core/draft';
import { emptyLetter } from '../../src/core/letter';
import { defaultSettings } from '../../src/core/settings';
import {
  clockText,
  draftFileName,
  emailLinks,
  monthAfter,
  moveLink,
  otherProblems,
  problemsAt,
  startChoices,
} from '../../src/ui/settings-logic';

const draft = (year: number, month: number): DraftFile => ({
  kind: DRAFT_KIND,
  version: DRAFT_VERSION,
  savedAt: '2026-11-22T20:41:00.000Z',
  letter: emptyLetter({ year, month }),
  settings: defaultSettings(),
});

describe('draft file name', () => {
  it('is pack137-letter-YYYY-MM.json with a padded month', () => {
    expect(draftFileName({ year: 2026, month: 12 })).toBe('pack137-letter-2026-12.json');
    expect(draftFileName({ year: 2027, month: 3 })).toBe('pack137-letter-2027-03.json');
  });
});

describe('the three start choices', () => {
  it('names the saved month, the next month and a blank letter', () => {
    const choices = startChoices(draft(2026, 11));
    expect(choices.map((c) => c.label)).toEqual([
      'Keep working on the November 2026 letter',
      'Start December 2026 from it',
      'Start a blank letter',
    ]);
    expect(choices[0]?.issue).toEqual({ year: 2026, month: 11 });
    expect(choices[1]?.issue).toEqual({ year: 2026, month: 12 });
  });

  it('rolls December into January of the next year', () => {
    expect(monthAfter({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 });
    expect(startChoices(draft(2026, 12))[1]?.label).toBe('Start January 2027 from it');
  });

  it('has no em dashes in its words', () => {
    for (const c of startChoices(draft(2026, 5)))
      expect(c.label).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('settings problems', () => {
  const problems = [
    { path: ['email', 'feedback'], message: 'Use the address only.' },
    { path: ['standingLinks', 2, 'url'], message: 'Needs https.' },
    { path: ['mystery'], message: 'Something else.' },
  ];
  it('finds messages by exact path', () => {
    expect(problemsAt(problems, ['email', 'feedback'])).toEqual(['Use the address only.']);
    expect(problemsAt(problems, ['email'])).toEqual([]);
    expect(problemsAt(problems, ['standingLinks', 2, 'url'])).toEqual(['Needs https.']);
  });
  it('keeps unplaced problems visible', () => {
    expect(otherProblems(problems)).toEqual(['Something else.']);
  });
});

describe('email links shown on the settings screen', () => {
  it('shows the full mailto each address makes', () => {
    const s = defaultSettings();
    s.email.feedback = 'a@example.org';
    const links = emailLinks(s);
    expect(links.map((l) => l.key)).toEqual(['contact', 'volunteer', 'feedback']);
    expect(links[0]?.text).toContain('mailto:' + s.email.contact);
    expect(links[1]?.text).toContain('mailto:' + s.email.volunteer + '?subject=I%20can%20help');
    expect(links[2]?.text).toContain('mailto:a@example.org?subject=');
    expect(links[2]?.text).toContain('&body=');
  });
});

describe('moving standing links', () => {
  const links = [
    { label: 'a', url: 'https://a.example/' },
    { label: 'b', url: 'https://b.example/' },
    { label: 'c', url: 'https://c.example/' },
  ];
  it('moves one link and leaves the original alone', () => {
    expect(moveLink(links, 0, 1).map((l) => l.label)).toEqual(['b', 'a', 'c']);
    expect(moveLink(links, 2, 0).map((l) => l.label)).toEqual(['c', 'a', 'b']);
    expect(links.map((l) => l.label)).toEqual(['a', 'b', 'c']);
  });
  it('ignores moves off either end', () => {
    expect(moveLink(links, 0, -1).map((l) => l.label)).toEqual(['a', 'b', 'c']);
    expect(moveLink(links, 2, 3).map((l) => l.label)).toEqual(['a', 'b', 'c']);
  });
});

describe('clock text', () => {
  it('uses the 12 hour form', () => {
    expect(clockText(new Date(2026, 10, 22, 20, 41))).toBe('8:41 pm');
    expect(clockText(new Date(2026, 10, 22, 0, 5))).toBe('12:05 am');
    expect(clockText(new Date(2026, 10, 22, 12, 0))).toBe('12:00 pm');
  });
});
