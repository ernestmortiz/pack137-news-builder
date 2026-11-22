import { describe, expect, it } from 'vitest';
import type { CheckMe } from '../../src/core/fill';
import type { Issue } from '../../src/core/model';
import {
  capIssues,
  dateWithYear,
  fromIsoDate,
  isWithin,
  itemsAt,
  itemsFor,
  mailtoDetails,
  mailtoSummary,
  remapAfterRemove,
  remapAfterSwap,
  samePath,
  shorten,
  toIsoDate,
  warningPath,
} from '../../src/ui/paths';

const check = (path: (string | number)[]): CheckMe => ({ path, kind: 'unsure', message: 'm' });

describe('path matching', () => {
  it('compares paths part by part', () => {
    expect(samePath(['a', 1], ['a', 1])).toBe(true);
    expect(samePath(['a', 1], ['a', '1'])).toBe(false);
    expect(samePath(['a'], ['a', 0])).toBe(false);
    expect(
      isWithin(['sections', 0, 'rows', 1, 'date', 'start'], ['sections', 0, 'rows', 1, 'date']),
    ).toBe(true);
    expect(isWithin(['sections', 0], ['sections', 0, 'rows'])).toBe(false);
  });

  it('puts a marker beside its field, or beside the field that holds the marked part', () => {
    const marks = [
      check(['title']),
      check(['sections', 1, 'rows', 2, 'date', 'start']),
      check(['paragraphs', 0]),
    ];
    expect(itemsFor(marks, ['title'])).toHaveLength(1);
    expect(itemsFor(marks, ['sections', 1, 'rows', 2, 'date'])).toHaveLength(1);
    expect(itemsFor(marks, ['sections', 1, 'rows', 3, 'date'])).toHaveLength(0);
    expect(itemsFor(marks, ['paragraphs', 1])).toHaveLength(0);
  });

  it('matches a whole row only on its exact path', () => {
    const marks = [check(['sections', 0, 'rows', 1]), check(['sections', 0, 'rows', 1, 'event'])];
    expect(itemsAt(marks, ['sections', 0, 'rows', 1])).toHaveLength(1);
  });

  it('finds the field for form warnings that name one', () => {
    expect(warningPath({ code: 'image-no-alt', where: 'Image', message: '' })).toEqual([
      'image',
      'alt',
    ]);
    expect(warningPath({ code: 'image-alt', where: 'Image', message: '' })).toEqual([
      'image',
      'alt',
    ]);
    expect(warningPath({ code: 'button-no-link', where: 'Help button', message: '' })).toEqual([
      'ask',
      'button',
    ]);
    expect(warningPath({ code: 'empty-section', where: 'x', message: '' })).toBeUndefined();
  });
});

describe('issues', () => {
  it('shortens long details', () => {
    expect(shorten('a'.repeat(200))).toHaveLength(200);
    const long = shorten('a'.repeat(1_000_000));
    expect(long.length).toBeLessThan(260);
    expect(long).toContain('999800 more characters');
  });

  it('lists at most 20 issues and counts the rest', () => {
    const issues: Issue[] = Array.from({ length: 35 }, (_, i) => ({
      code: 'insecure-url',
      message: `Issue ${i}`,
      detail: 'x'.repeat(5000),
    }));
    const { shown, hidden } = capIssues(issues);
    expect(shown).toHaveLength(20);
    expect(hidden).toBe(15);
    expect(shown[0]?.detail.length).toBeLessThan(260);
  });
});

describe('mailtoSummary', () => {
  it('shows the whole value, including a hidden bcc', () => {
    const url = 'mailto:a@b.org?subject=Hi&bcc=spy@evil.example';
    expect(mailtoSummary(url)).toContain(url);
  });
  it('is null for other links', () => {
    expect(mailtoSummary('https://example.org')).toBeNull();
    expect(mailtoSummary('')).toBeNull();
  });
});

describe('mailtoDetails', () => {
  const texts = (url: string) => mailtoDetails(url)?.map((l) => l.text);
  const alerts = (url: string) =>
    mailtoDetails(url)
      ?.filter((l) => l.alert)
      .map((l) => l.text);

  it('is null for other links', () => {
    expect(mailtoDetails('https://example.org')).toBeNull();
  });
  it('handles a plain address with no query', () => {
    expect(texts('mailto:pack@example.org')).toEqual([
      'Email link, full value: mailto:pack@example.org',
      'Sends to: pack@example.org',
    ]);
    expect(alerts('mailto:pack@example.org')).toEqual([]);
  });
  it('shows a percent-encoded bcc name', () => {
    const url = 'mailto:pack@example.org?%62cc=someone@evil.example';
    expect(texts(url)).toContain(`Email link, full value: ${url}`);
    expect(texts(url)).toContain('Hidden copy (bcc): someone@evil.example');
    expect(alerts(url)).toEqual(['Hidden copy (bcc): someone@evil.example']);
  });
  it('reads header names in any case', () => {
    expect(alerts('mailto:a@b.org?BCC=x@y.org&Cc=z@y.org')).toEqual([
      'Copy (cc): z@y.org',
      'Hidden copy (bcc): x@y.org',
    ]);
  });
  it('adds to= headers and comma lists to the recipients', () => {
    expect(texts('mailto:a@b.org,c@d.org?to=e@f.org')).toContain(
      'Sends to: a@b.org, c@d.org, e@f.org',
    );
  });
  it('decodes the subject and body', () => {
    const t = texts('mailto:a@b.org?subject=Hello%20there&body=Hi%0Afriend');
    expect(t).toContain('Subject: Hello there');
    expect(t).toContain('Body: Hi\nfriend');
  });
  it('survives a malformed escape and says so', () => {
    const url = 'mailto:a@b.org?subject=%E0%A4&bcc=x@y.org';
    expect(texts(url)).toContain('Subject: %E0%A4');
    expect(texts(url)).toContain('Hidden copy (bcc): x@y.org');
    expect(alerts(url)?.some((t) => t.includes('could not be decoded'))).toBe(true);
  });
});

describe('dates', () => {
  it('shows the weekday and the year', () => {
    expect(dateWithYear({ year: 2026, month: 11, day: 21 })).toBe('Sat Nov 21, 2026');
    expect(dateWithYear({ year: 2026, month: 2, day: 31 })).toBe('Not a real date');
  });
  it('converts to and from a date input value', () => {
    expect(toIsoDate({ year: 2026, month: 2, day: 7 })).toBe('2026-02-07');
    expect(fromIsoDate('2026-02-07')).toEqual({ year: 2026, month: 2, day: 7 });
    expect(fromIsoDate('')).toBeUndefined();
    expect(fromIsoDate('2026-02-30')).toBeUndefined();
  });
});

describe('keeping markers on the right row', () => {
  const rows = ['sections', 0, 'rows'];
  it('moves markers with their rows when two rows swap', () => {
    const a = check([...rows, 1, 'date']);
    const b = check([...rows, 2, 'event']);
    const other = check(['sections', 1, 'rows', 1, 'date']);
    remapAfterSwap([a, b, other], rows, 1, 2);
    expect(a.path).toEqual([...rows, 2, 'date']);
    expect(b.path).toEqual([...rows, 1, 'event']);
    expect(other.path).toEqual(['sections', 1, 'rows', 1, 'date']);
  });
  it('drops the markers of a removed row and closes the gap', () => {
    const a = check([...rows, 0, 'date']);
    const b = check([...rows, 1, 'date']);
    const c = check([...rows, 2, 'date']);
    const t = check(['title']);
    const kept = remapAfterRemove([a, b, c, t], rows, 1);
    expect(kept).toEqual([a, c, t]);
    expect(c.path).toEqual([...rows, 1, 'date']);
    expect(t.path).toEqual(['title']);
  });
});
