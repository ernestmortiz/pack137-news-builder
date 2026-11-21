import { describe, expect, it } from 'vitest';
import { dateLabel, readLeadingDate } from '../../../src/core/helpers/dates';
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
