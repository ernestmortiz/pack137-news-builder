/**
 * Date list dates as a navy pill above the event (owner decision 2026-11-22, spec 6.1 Date row).
 * A calendar tile was tried and dropped: it took too much space.
 */
import { describe, expect, it } from 'vitest';
import type { CalendarDate } from '../../src/core/dates';
import type { DateListForm, DateRow, DateSection } from '../../src/core/forms';
import { lintOutput } from '../../src/core/lint-output';
import { renderAnnouncement } from '../../src/core/render';

const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });

const row = (start: CalendarDate, end?: CalendarDate, struck = false): DateRow => ({
  date: { start, ...(end ? { end } : {}), ...(struck ? { struck } : {}) },
  event: 'Event',
  url: 'https://example.org/e',
  tags: [],
  note: [],
});

function render(rows: DateRow[], style: DateSection['style'] = 'plain'): string {
  const form: DateListForm = {
    layout: 'date-list',
    label: 'L',
    title: 'T',
    sections: [{ name: 'S', style, subtitle: '', rows }],
  };
  const html = renderAnnouncement(form);
  expect(lintOutput(html)).toEqual([]);
  expect(html).not.toContain(String.fromCharCode(0x2014));
  return html;
}

/** The text inside each date pill cell. */
const pills = (html: string): string[] =>
  [...html.matchAll(/letter-spacing:0\.5px;color:#FFFFFF;[^"]*">(.*?)<\/td>/g)].map(
    (m) => m[1] ?? '',
  );

describe('date pill', () => {
  it('shows a single date as a navy pill in capitals that never wraps', () => {
    const html = render([row(d(2027, 2, 1))]);
    expect(pills(html)).toEqual(['MON&nbsp;FEB&nbsp;1']);
    expect(html).toContain('background-color:#151B4D;border-radius:8px;padding:3px 10px;');
    expect(html).toMatch(/color:#FFFFFF;white-space:nowrap;">MON&nbsp;FEB&nbsp;1</);
  });

  it('shows a range with TO, wrapping only between the two dates', () => {
    const html = render([row(d(2027, 2, 27), d(2027, 2, 28)), row(d(2027, 1, 31), d(2027, 2, 1))]);
    expect(pills(html)).toEqual([
      'SAT&nbsp;FEB&nbsp;27 TO SUN&nbsp;FEB&nbsp;28',
      'SUN&nbsp;JAN&nbsp;31 TO MON&nbsp;FEB&nbsp;1',
    ]);
  });

  it('crosses out a rescheduled date', () => {
    expect(pills(render([row(d(2026, 11, 24), undefined, true)]))).toEqual([
      '<s>TUE&nbsp;NOV&nbsp;24</s>',
    ]);
  });

  it('keeps the navy pill on highlight and quiet panels', () => {
    for (const style of ['highlight', 'quiet'] as const)
      expect(pills(render([row(d(2027, 2, 1))], style))).toEqual(['MON&nbsp;FEB&nbsp;1']);
  });

  it('draws no calendar tile', () => {
    expect(render([row(d(2027, 2, 1))])).not.toMatch(/width="(52|64)"/);
  });

  it('leaves a row with no date as a link row, with no pill', () => {
    const html = render([{ event: 'Info', url: 'https://example.org/i', tags: [], note: [] }]);
    expect(pills(html)).toEqual([]);
  });
});
