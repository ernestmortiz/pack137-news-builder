import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatRange,
  inferYear,
  matchLeadingDate,
  type CalendarDate,
} from '../../src/core/dates';

const nov21: CalendarDate = { year: 2026, month: 11, day: 21 };
const sept = 9;

describe('formatDate and formatRange', () => {
  it('adds the weekday in the house format', () => {
    expect(formatDate({ year: 2026, month: 11, day: 21 })).toBe('Sat Nov 21');
    expect(formatDate({ year: 2026, month: 12, day: 6 })).toBe('Sun Dec 6');
    expect(formatDate({ year: 2027, month: 1, day: 3 })).toBe('Sun Jan 3');
  });

  it('joins a range with "to"', () => {
    expect(formatRange({ year: 2027, month: 2, day: 27 }, { year: 2027, month: 2, day: 28 })).toBe(
      'Sat Feb 27 to Sun Feb 28',
    );
  });
});

describe('inferYear', () => {
  it('keeps a later date this calendar year', () => {
    expect(inferYear(12, 6, nov21, sept)).toBe(2026);
  });

  it('rolls January forward over the December to January boundary', () => {
    expect(inferYear(1, 9, nov21, sept)).toBe(2027);
    expect(inferYear(1, 9, { year: 2026, month: 12, day: 31 }, sept)).toBe(2027);
  });

  it('reads a recent December date in January as last year', () => {
    expect(inferYear(12, 18, { year: 2027, month: 1, day: 5 }, sept)).toBe(2026);
  });

  it('keeps a date from the last 90 days of the current program year in the past', () => {
    // The approved "In the news" output dates an article Fri Nov 13, eight days before the edit.
    expect(inferYear(11, 13, nov21, sept)).toBe(2026);
    expect(inferYear(9, 2, nov21, sept)).toBe(2026);
  });

  it('does not reach back across the program year start', () => {
    // Aug 30 2026 is in the previous program year, so the next occurrence wins.
    expect(inferYear(8, 30, nov21, sept)).toBe(2027);
  });

  it('looks ahead to the next program year late in the summer', () => {
    expect(inferYear(9, 12, { year: 2027, month: 8, day: 20 }, sept)).toBe(2027);
  });

  it('treats today as upcoming', () => {
    expect(inferYear(11, 21, nov21, sept)).toBe(2026);
  });
});

describe('matchLeadingDate', () => {
  const match = (text: string) => matchLeadingDate(text, nov21, sept);

  it.each([
    ['Dec 6 Parent Planning Meeting', { year: 2026, month: 12, day: 6 }, 'Dec 6'],
    ['March 6: Blue and Gold', { year: 2027, month: 3, day: 6 }, 'March 6'],
    ['Sept. 12 Hike', { year: 2026, month: 9, day: 12 }, 'Sept. 12'],
    ['12/6 Pack Meeting', { year: 2026, month: 12, day: 6 }, '12/6'],
    ['Jan 3rd Den meeting', { year: 2027, month: 1, day: 3 }, 'Jan 3rd'],
    ['Sun, Dec 6 - Meeting', { year: 2026, month: 12, day: 6 }, 'Sun, Dec 6'],
    ['Sunday December 6 Meeting', { year: 2026, month: 12, day: 6 }, 'Sunday December 6'],
  ])('reads %s', (text, start, raw) => {
    const m = match(text);
    expect(m?.start).toEqual(start);
    expect(m?.end).toBeUndefined();
    expect(m?.raw).toBe(raw);
    expect(m?.yearAssumed).toBe(true);
  });

  it('reads a day range within a month', () => {
    const m = match('Feb 27-28 Winter Campout');
    expect(m?.start).toEqual({ year: 2027, month: 2, day: 27 });
    expect(m?.end).toEqual({ year: 2027, month: 2, day: 28 });
    expect(m?.raw).toBe('Feb 27-28');
  });

  it('reads a range across months', () => {
    const m = match('Feb 28 to Mar 1 Campout');
    expect(m?.end).toEqual({ year: 2027, month: 3, day: 1 });
    expect(m?.raw).toBe('Feb 28 to Mar 1');
  });

  it('reads a range that crosses the year end', () => {
    const m = match('Dec 31 - Jan 2 Break');
    expect(m?.start).toEqual({ year: 2026, month: 12, day: 31 });
    expect(m?.end).toEqual({ year: 2027, month: 1, day: 2 });
  });

  it('keeps an explicit year and does not flag it', () => {
    const m = match('Dec 6, 2027 Meeting');
    expect(m?.start).toEqual({ year: 2027, month: 12, day: 6 });
    expect(m?.yearAssumed).toBe(false);
    expect(match('12/6/27 Meeting')?.start.year).toBe(2027);
  });

  it.each([
    'Meeting on Dec 6',
    'Feb 30 Nothing',
    '13/1 Nope',
    'Decorations',
    'May the force',
    '6 Dec',
  ])('does not read %s as a leading date', (text) => {
    expect(match(text)).toBeNull();
  });

  it('ignores leading whitespace', () => {
    expect(match('  Dec 6')?.start.day).toBe(6);
  });
});
