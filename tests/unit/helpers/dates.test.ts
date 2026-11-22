import { describe, expect, it } from 'vitest';
import {
  dateLabel,
  readLeadingDate,
  weekdayMismatchMessage,
  type WeekdayMismatch,
} from '../../../src/core/helpers/dates';
import { textOf } from '../../../src/core/helpers/text';
import type { Inline } from '../../../src/core/model';

const t = (text: string, extra: Partial<Extract<Inline, { kind: 'text' }>> = {}): Inline => ({
  kind: 'text',
  text,
  marks: [],
  ...extra,
});
const NOV21 = { today: { year: 2026, month: 11, day: 21 }, programYearStartMonth: 9 };

describe('dates helper', () => {
  it('reads a leading date and returns the rest of the line', () => {
    const r = readLeadingDate([t('Dec 6 '), t('Planning', { href: 'https://x.test/' })], NOV21);
    expect(r?.date).toEqual({ start: { year: 2026, month: 12, day: 6 } });
    expect(r?.yearAssumed).toBe(true);
    expect(r?.rest).toEqual([t('Planning', { href: 'https://x.test/' })]);
  });

  it('rolls the year over from December to January', () => {
    const dec28 = { today: { year: 2026, month: 12, day: 28 }, programYearStartMonth: 9 };
    expect(readLeadingDate([t('Jan 3 Meeting')], dec28)?.date.start.year).toBe(2027);
    expect(readLeadingDate([t('Dec 30 Meeting')], dec28)?.date.start.year).toBe(2026);
    const jan2 = { today: { year: 2027, month: 1, day: 2 }, programYearStartMonth: 9 };
    expect(readLeadingDate([t('Dec 30 Meeting')], jan2)?.date.start.year).toBe(2026);
    expect(readLeadingDate([t('Jan 3 Meeting')], jan2)?.date.start.year).toBe(2027);
  });

  it('does not mark a written year as assumed', () => {
    const r = readLeadingDate([t('Dec 6, 2027 Meeting')], NOV21);
    expect(r?.yearAssumed).toBe(false);
    expect(r?.date.start.year).toBe(2027);
  });

  it('reads a range and strips a separator after the date', () => {
    const r = readLeadingDate([t('Feb 27-28: Pack Overnight Trip')], NOV21);
    expect(r?.date).toEqual({
      start: { year: 2027, month: 2, day: 27 },
      end: { year: 2027, month: 2, day: 28 },
    });
    expect(textOf(r?.rest ?? [])).toBe('Pack Overnight Trip');
  });

  it('marks a struck date', () => {
    const r = readLeadingDate([t('Nov 24', { marks: ['strike'] }), t(' Webelos Meeting')], NOV21);
    expect(r?.date).toEqual({ start: { year: 2026, month: 11, day: 24 }, struck: true });
    expect(textOf(r?.rest ?? [])).toBe('Webelos Meeting');
  });

  it('does not mark a date struck when only later text is struck', () => {
    const r = readLeadingDate([t('Nov 24 '), t('old', { marks: ['strike'] })], NOV21);
    expect(r?.date.struck).toBeUndefined();
  });

  it('returns null when the line does not start with a date', () => {
    expect(readLeadingDate([t('Pack Meeting on Dec 6')], NOV21)).toBeNull();
  });

  it('labels a date and a range with weekdays', () => {
    expect(dateLabel({ start: { year: 2026, month: 11, day: 21 } })).toBe('Sat Nov 21');
    expect(
      dateLabel({
        start: { year: 2027, month: 2, day: 27 },
        end: { year: 2027, month: 2, day: 28 },
      }),
    ).toBe('Sat Feb 27 to Sun Feb 28');
    expect(dateLabel(undefined)).toBe('');
  });
});

describe('dates helper: a pasted weekday that does not match the date', () => {
  const mismatches = (text: string): WeekdayMismatch[] =>
    readLeadingDate([t(text)], NOV21)?.weekdayMismatches ?? [];
  const JAN16 = { year: 2027, month: 1, day: 16 }; // a Saturday

  it('reports the weekday as it was pasted, in full and short forms', () => {
    for (const said of ['Monday', 'Mon', 'Tues', 'Tuesday', 'Thurs', 'Thur', 'Thu', 'WED', 'fri'])
      expect(mismatches(`${said} 1/16/2027 Hike`), said).toEqual([{ said, date: JAN16 }]);
    expect(mismatches('Mon. 1/16/2027 Hike')).toEqual([{ said: 'Mon', date: JAN16 }]);
    expect(mismatches('Monday, January 16, 2027 Hike')).toEqual([{ said: 'Monday', date: JAN16 }]);
    expect(mismatches('Sun., Jan 16th, 2027: Hike')).toEqual([{ said: 'Sun', date: JAN16 }]);
  });

  it('reports nothing when the weekday matches or is absent', () => {
    for (const text of [
      'Sat 1/16/2027 Hike',
      'Saturday, January 16, 2027 Hike',
      'Sat. Jan 16, 2027 Hike',
      '1/16/2027 Hike',
      'Jan 16, 2027 Hike',
      'Sat Feb 27 - Sun Feb 28 Trip',
      'Feb 27-28 Trip',
      'Dec 6 Monday night hike',
    ])
      expect(mismatches(text), text).toEqual([]);
    // The line still reads as a date in every case.
    expect(readLeadingDate([t('Sat 1/16/2027 Hike')], NOV21)?.weekdayMismatches).toEqual([]);
  });

  it('checks each end of a range that carries a weekday', () => {
    const feb27 = { year: 2027, month: 2, day: 27 }; // a Saturday
    const feb28 = { year: 2027, month: 2, day: 28 }; // a Sunday
    expect(mismatches('Fri Feb 27 - Sun Feb 28 Trip')).toEqual([{ said: 'Fri', date: feb27 }]);
    expect(mismatches('Sat Feb 27 to Monday Feb 28 Trip')).toEqual([
      { said: 'Monday', date: feb28 },
    ]);
    expect(mismatches('Feb 27 through Mon. Feb 28 Trip')).toEqual([{ said: 'Mon', date: feb28 }]);
    expect(mismatches('Fri Feb 27 - Mon Feb 28 Trip')).toEqual([
      { said: 'Fri', date: feb27 },
      { said: 'Mon', date: feb28 },
    ]);
    // One weekday in front of a range speaks for the first day only.
    expect(mismatches('Fri Feb 27-28 Trip')).toEqual([{ said: 'Fri', date: feb27 }]);
    expect(mismatches('Sat Feb 27-28 Trip')).toEqual([]);
  });

  it('compares against the year that was chosen when none was written', () => {
    // Today is Nov 21, 2026. Dec 6 is read as 2026, a Sunday. Jan 16 is read as 2027, a Saturday.
    expect(mismatches('Sat Dec 6 Hike')).toEqual([
      { said: 'Sat', date: { year: 2026, month: 12, day: 6 } },
    ]);
    expect(mismatches('Sun Dec 6 Hike')).toEqual([]);
    expect(mismatches('Sat Jan 16 Hike')).toEqual([]);
    // Nov 13 stays in 2026 (a Friday), in the past.
    expect(mismatches('Fri Nov 13 Hike')).toEqual([]);
    // A range that runs over the new year: the end is in the next year.
    expect(mismatches('Thu Dec 31 - Fri Jan 1 Party')).toEqual([]);
    expect(mismatches('Thu Dec 31 - Sat Jan 1 Party')).toEqual([
      { said: 'Sat', date: { year: 2027, month: 1, day: 1 } },
    ]);
  });

  it('writes one plain sentence', () => {
    expect(weekdayMismatchMessage({ said: 'Mon', date: JAN16 })).toBe(
      'The paste said Mon, but Jan 16, 2027 is a Saturday. Check the date.',
    );
    expect(weekdayMismatchMessage({ said: 'Thurs', date: { year: 2026, month: 12, day: 6 } })).toBe(
      'The paste said Thurs, but Dec 6, 2026 is a Sunday. Check the date.',
    );
  });
});
