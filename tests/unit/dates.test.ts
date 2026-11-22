import { describe, expect, it } from 'vitest';
import {
  containsDate,
  findDate,
  formatDate,
  formatDateTime,
  formatMonthYear,
  formatRange,
  formatTime,
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

describe('formatTime, formatDateTime and formatMonthYear (monthly letter, spec 6 and 8.2)', () => {
  it('formats times as "9:15 am" and "12:15 pm"', () => {
    expect(formatTime({ hour: 9, minute: 15 })).toBe('9:15 am');
    expect(formatTime({ hour: 12, minute: 15 })).toBe('12:15 pm');
    expect(formatTime({ hour: 0, minute: 5 })).toBe('12:05 am');
    expect(formatTime({ hour: 20, minute: 0 })).toBe('8:00 pm');
  });

  it('formats a date with a time as "Sun Dec 6, 8:00 pm"', () => {
    expect(formatDateTime({ year: 2026, month: 12, day: 6 }, { hour: 20, minute: 0 })).toBe(
      'Sun Dec 6, 8:00 pm',
    );
  });

  it('formats a date with no time as the plain date', () => {
    expect(formatDateTime({ year: 2026, month: 12, day: 6 })).toBe('Sun Dec 6');
  });

  it('formats a month and year as "November 2026"', () => {
    expect(formatMonthYear({ year: 2026, month: 11 })).toBe('November 2026');
    expect(formatMonthYear({ year: 2027, month: 1 })).toBe('January 2027');
  });
});

describe('findDate: a date inside a sentence (Date list from prose, 2026-11-22)', () => {
  const today = { year: 2026, month: 11, day: 22 };
  const find = (text: string) => findDate(text, today, 8);

  it('finds the date after "on" in the owner\'s title', () => {
    const text = 'The First Presbyterian Church is having Scout Sunday on February 8th, 10am-11am.';
    const hit = find(text);
    expect(hit?.start).toEqual({ year: 2027, month: 2, day: 8 });
    expect(hit?.raw).toBe('February 8th');
    expect(text.slice(hit?.index, (hit?.index ?? 0) + (hit?.raw.length ?? 0))).toBe('February 8th');
  });

  it('skips a weekday word that is not part of a date ("Scout Sunday on")', () => {
    const hit = find('they are also having a Scout Sunday on February 1st at the 9am mass.');
    expect(hit?.raw).toBe('February 1st');
    expect(hit?.start).toEqual({ year: 2027, month: 2, day: 1 });
  });

  it('includes a weekday written just before the month', () => {
    expect(find('Join us on Saturday, Dec 5 for the hike.')?.raw).toBe('Saturday, Dec 5');
  });

  it('reads a range', () => {
    const hit = find('Camp is Feb 27-28 this year.');
    expect(hit?.raw).toBe('Feb 27-28');
    expect(hit?.end).toEqual({ year: 2027, month: 2, day: 28 });
  });

  it('finds nothing in text without a date', () => {
    expect(find('Please RSVP via the TroopTrack event.')).toBeNull();
    expect(find('You may 2 or 3 friends bring.')).toBeNull();
    expect(find('Meet at 8:45am at the Alden Street entrance.')).toBeNull();
  });

  it('does not read a month inside a word', () => {
    expect(find('Bring a Decathlon 5 tent.')).toBeNull();
  });

  it('containsDate answers the same question without the year rule', () => {
    expect(containsDate('Scout Sunday on February 8th, 10am-11am.')).toBe(true);
    expect(containsDate('Scout Sunday')).toBe(false);
  });
});
