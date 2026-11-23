/**
 * Owner report of 2026-11-23, from the Den 15 paste:
 * "1. Den Meeting - Dec 16th 6:15pm - [Fun On The Run](event link)".
 * 1. The "add a label" and "add a title" notes are their own kind, so the form can hide them once
 *    the field has text.
 * 2. Call to action: when the button is the paragraph's only link, the paragraph keeps the words
 *    but not the link, so the email does not carry the same link twice.
 * 3. A lone "1." in front of the only numbered line is dropped.
 * 4. Date list: a date written inside a line, not only at its start, becomes the row's date.
 */
import { describe, expect, it } from 'vitest';
import { fillForm, switchLayout, type FillOptions } from '../../src/core/fill';
import type { CallToActionForm, DateListForm, MessageForm } from '../../src/core/forms';
import { textOf } from '../../src/core/helpers/text';
import { parse } from '../../src/core/pipeline';

const OPTIONS: FillOptions = {
  today: { year: 2026, month: 11, day: 23 },
  programYearStartMonth: 9,
};
const URL = 'https://pack137.trooptrack.com/plan/events/1847519';
const DEN15 = `<div style="font-family: Arial;"><div style="font-family: Arial;"><p>1. Den Meeting - Dec 16th 6:15pm - <a href="${URL}" target="_blank" rel="noopener noreferrer">Fun On The Run</a></p></div></div>`;

describe('empty label and title notes', () => {
  it('marks them as missing, a kind the form hides once the field has text', () => {
    const { checks } = fillForm(parse(DEN15), 'message', OPTIONS);
    expect(checks).toContainEqual(expect.objectContaining({ kind: 'missing', path: ['label'] }));
    expect(checks).toContainEqual(expect.objectContaining({ kind: 'missing', path: ['title'] }));
  });
});

describe('call to action with the link inside the sentence', () => {
  it('keeps the words in the paragraph without the link the button already carries', () => {
    const form = fillForm(parse(DEN15), 'call-to-action', OPTIONS).form as CallToActionForm;
    expect(form.button).toEqual({ text: 'Fun On The Run', url: URL });
    expect(textOf(form.paragraph)).toBe('Den Meeting - Dec 16th 6:15pm - Fun On The Run');
    expect(form.paragraph.some((r) => r.kind === 'text' && r.href !== undefined)).toBe(false);
  });

  it('leaves the paragraph alone when it links somewhere the button does not go', () => {
    const paste = `<p>Read <a href="https://example.org/a">this</a> and <a href="https://example.org/b">that</a>.</p>`;
    const form = fillForm(parse(paste), 'call-to-action', OPTIONS).form as CallToActionForm;
    expect(form.paragraph.filter((r) => r.kind === 'text' && r.href !== undefined)).toHaveLength(2);
  });
});

describe('a lone "1." in front of the only numbered line', () => {
  it('is dropped', () => {
    const form = fillForm(parse(DEN15), 'message', OPTIONS).form as MessageForm;
    expect(textOf(form.paragraphs[0] ?? [])).toBe('Den Meeting - Dec 16th 6:15pm - Fun On The Run');
  });

  it('is kept when a "2." follows, because then it is a real list', () => {
    const paste = '<p>1. Bring a water bottle<br>2. Wear the uniform</p>';
    const form = fillForm(parse(paste), 'message', OPTIONS).form as MessageForm;
    // The short first line becomes the title, as for any paste; it keeps its number.
    expect(form.title).toBe('1. Bring a water bottle');
    expect(textOf(form.paragraphs[0] ?? [])).toBe('2. Wear the uniform');
  });

  it('leaves other numbers alone', () => {
    const paste = '<p>10 scouts went camping.</p>';
    const form = fillForm(parse(paste), 'message', OPTIONS).form as MessageForm;
    expect(textOf(form.paragraphs[0] ?? [])).toBe('10 scouts went camping.');
  });
});

describe('Date list rows with the date inside the line', () => {
  it('takes the date out of the line and shows it as the row date', () => {
    const form = fillForm(parse(DEN15), 'date-list', OPTIONS).form as DateListForm;
    const row = form.sections[0]?.rows[0];
    expect(row?.date).toEqual({ start: { year: 2026, month: 12, day: 16 } });
    expect(row?.event).toBe('Den Meeting - 6:15pm - Fun On The Run');
    expect(row?.url).toBe(URL);
  });

  it('still reads a date at the start of the line as before', () => {
    const paste = `<p>Dec 16 - <a href="${URL}">Den Meeting</a></p>`;
    const form = fillForm(parse(paste), 'date-list', OPTIONS).form as DateListForm;
    const row = form.sections[0]?.rows[0];
    expect(row?.date).toEqual({ start: { year: 2026, month: 12, day: 16 } });
    expect(row?.event).toBe('Den Meeting');
  });
});

describe('switching Call to action to Date list (held fix from 1.1.1, 2026-11-23)', () => {
  it('does not repeat the button words at the end of the event', () => {
    const cta = fillForm(parse(DEN15), 'call-to-action', OPTIONS).form;
    const form = switchLayout(cta, 'date-list', OPTIONS) as DateListForm;
    const row = form.sections[0]?.rows[0];
    expect(row?.date).toEqual({ start: { year: 2026, month: 12, day: 16 } });
    expect(row?.event).toBe('Den Meeting - 6:15pm');
    expect(row?.note).toEqual([{ kind: 'text', text: 'Fun On The Run', marks: [], href: URL }]);
  });

  it('keeps the event whole when the button words are not at its end', () => {
    const paste = `<p>Den Meeting on Dec 16th at the school.</p><p><a href="${URL}">Sign up</a></p>`;
    const cta = fillForm(parse(paste), 'call-to-action', OPTIONS).form;
    const form = switchLayout(cta, 'date-list', OPTIONS) as DateListForm;
    const row = form.sections[0]?.rows[0];
    expect(row?.event).toBe('Den Meeting at the school.');
    expect(textOf(row?.note ?? [])).toBe('Sign up');
  });
});
