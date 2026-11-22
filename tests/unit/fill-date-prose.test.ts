/**
 * Date list built from prose (owner request, 2026-11-22). Switching the owner's Scout Sunday paste
 * to Date list used to make one row per paragraph, or one huge linked row from Call to action, with
 * no dates. Now each written date makes a row, the title's date makes a row, dateless text becomes
 * the note of the row before it, and the rows are sorted by date.
 */
import { describe, expect, it } from 'vitest';
import { fillForm, switchLayout, type FillOptions } from '../../src/core/fill';
import { formWarnings } from '../../src/core/form-warnings';
import type { DateListForm, DateRow } from '../../src/core/forms';
import { textOf } from '../../src/core/helpers/text';
import type { Layout } from '../../src/core/model';
import { parse } from '../../src/core/pipeline';

const OPTIONS: FillOptions = {
  today: { year: 2026, month: 11, day: 22 },
  programYearStartMonth: 8,
};
const SIGNUP = 'https://www.signupgenius.com/go/4090F4CAEAE2AA4F58-61725464-stmichael';

const PASTE = `<div style="font-family: Arial;"><div style="font-family: Arial;">
<p style="text-align: left;"><span><strong>The&nbsp;</strong></span><span id="isPasted"><strong>First Presbyterian Church is having Scout Sunday on February 8th, 10am-11am.</strong></span></p>
<p><span id="isPasted"><span id="isPasted">Even if you are are not members of the First Presbyterian Church, you are encouraged to show up as Scouts in full class A uniform for this event. The church is important for Pack 137 as this is our Charter Organization. The Charter Organization provides us not only with a free venue for our events and storage, but they also provide the regulatory and legal framework for our pack to exist.</span></span></p>
<p><span>Please RSVP via the TroopTrack event. If you have questions, please contact Ryan Meier.</span></p>
<p><span>For the Scouts that attend <strong>St. Michael&#39;s Church</strong>, they are also having a Scout Sunday on <strong>February 1st</strong> at the 9am mass. &nbsp;This is being coordinated by Troop 75&#39;s Asst. Scoutmaster Andy Koneski. &nbsp;All scouts attending are to meet at 8:45am before mass at the Alden Street entrance of St. Michael&#39;s Church in full Class A uniform. &nbsp;If you are interested, please signup here: <a target="_blank" rel="noopener noreferrer" data-fr-linked="true" href="${SIGNUP}">${SIGNUP}</a>. &nbsp;If you have any questions, please contact Andy through the SignUp Genius Link.</span></p>
<p><br></p></div></div>`;

const rows = (form: DateListForm): DateRow[] => form.sections.flatMap((s) => s.rows);
const fromLayout = (layout: Layout) =>
  switchLayout(fillForm(parse(PASTE), layout, OPTIONS).form, 'date-list', OPTIONS) as DateListForm;

describe("Date list from the owner's Scout Sunday paste", () => {
  for (const source of ['message', 'call-to-action'] as const) {
    describe(`switched from ${source}`, () => {
      const form = fromLayout(source);
      const [first, second] = rows(form);

      it('makes one row per date, sorted by date, and keeps the title as written', () => {
        expect(rows(form)).toHaveLength(2);
        expect(first?.date?.start).toEqual({ year: 2027, month: 2, day: 1 });
        expect(second?.date?.start).toEqual({ year: 2027, month: 2, day: 8 });
        expect(form.title).toBe(
          'The First Presbyterian Church is having Scout Sunday on February 8th, 10am-11am.',
        );
      });

      it('names each event with its sentence, without the date the row now shows', () => {
        expect(first?.event).toBe(
          "For the Scouts that attend St. Michael's Church, they are also having a Scout Sunday at the 9am mass.",
        );
        expect(second?.event).toBe(
          'The First Presbyterian Church is having Scout Sunday, 10am-11am.',
        );
      });

      it('does not turn a whole sentence into a link; the sign-up link stays in the note', () => {
        expect(first?.url).toBe('');
        expect(second?.url).toBe('');
        const note = first?.note ?? [];
        expect(textOf(note)).toContain('This is being coordinated by Troop 75');
        expect(note.some((r) => r.kind === 'text' && r.href === SIGNUP)).toBe(true);
      });

      it('puts the dateless paragraphs under the event they follow', () => {
        const note = textOf(second?.note ?? []);
        expect(note).toContain('Even if you are are not members of the First Presbyterian Church');
        expect(note).toContain('Please RSVP via the TroopTrack event.');
      });

      it('loses no words: everything but the moved dates is still there', () => {
        const all = rows(form)
          .map((r) => `${r.event} ${textOf(r.note)}`)
          .join(' ');
        for (const phrase of [
          'Charter Organization provides us not only with a free venue',
          'please contact Ryan Meier',
          'meet at 8:45am before mass at the Alden Street entrance',
          'please contact Andy through the SignUp Genius Link',
        ])
          expect(all).toContain(phrase);
      });

      it('nudges the volunteer about the date left in the title', () => {
        const codes = formWarnings(form).map((w) => w.code);
        expect(codes).toContain('title-has-date');
        expect(codes).not.toContain('row-no-date');
      });
    });
  }

  it("without today's date it behaves as before (no prose dates are read)", () => {
    const before = switchLayout(fillForm(parse(PASTE), 'message', OPTIONS).form, 'date-list');
    expect(rows(before as DateListForm).every((r) => r.date === undefined)).toBe(true);
  });
});

describe('Date list from prose without dates', () => {
  const message = {
    layout: 'message' as const,
    label: '',
    title: 'Snack sign-up',
    paragraphs: [
      [
        {
          kind: 'text' as const,
          text: 'Please bring a snack to share with the den. Nut-free snacks only, please. Ask Ms. Rivera if you are not sure.',
          marks: [],
        },
      ],
    ],
  };
  const form = switchLayout(message, 'date-list', OPTIONS) as DateListForm;
  const [row] = rows(form);

  it('keeps a long event name to its first sentence and moves the rest to the note', () => {
    expect(row?.event).toBe('Please bring a snack to share with the den.');
    expect(textOf(row?.note ?? [])).toBe(
      'Nut-free snacks only, please. Ask Ms. Rivera if you are not sure.',
    );
  });

  it('flags a row with no date and no link', () => {
    const warning = formWarnings(form).find((w) => w.code === 'row-no-date');
    expect(warning?.message).toMatch(/no date/i);
  });

  it('does not flag a dateless title', () => {
    expect(formWarnings(form).map((w) => w.code)).not.toContain('title-has-date');
  });
});

describe('Date list remembers the day it was made (owner decision 2026-11-22: past dates show as pills)', () => {
  it('a fresh Date list fill records today', () => {
    const form = fillForm(parse(PASTE), 'date-list', OPTIONS).form as DateListForm;
    expect(form.madeOn).toEqual(OPTIONS.today);
    expect(form.dateStyle ?? 'tile').toBe('tile');
  });

  it('switching to Date list with today\'s date records it', () => {
    expect(fromLayout('message').madeOn).toEqual(OPTIONS.today);
  });
});
