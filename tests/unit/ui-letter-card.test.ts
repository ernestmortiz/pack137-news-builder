import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyLetter, type LetterForm } from '../../src/core/letter';
import type { FormContext } from '../../src/ui/form-kit';
import { buildLetterCard } from '../../src/ui/letter-card';
import { letterNotes, letterWarnings } from '../../src/ui/letter-ops';
import { buildLetterForm } from '../../src/ui/letter-view';

const ctx: FormContext = {
  checks: () => [],
  suggestions: () => [],
  warnings: () => [],
  typed() {},
  begin() {},
  step() {},
  history() {},
  swapped() {},
  removed() {},
  apply() {},
};
const jumps: (string | number)[][] = [];
const options = (letter: LetterForm) => ({
  openInForm: (path: (string | number)[]) => void jumps.push(path),
  width: 600,
  onWidth() {},
  notes: () => letterNotes(letter),
});

const reference = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/monthly/2026-11.draft.json'), 'utf8'),
) as LetterForm;
const empty = (): LetterForm => emptyLetter({ year: 2026, month: 12 });

afterEach(() => {
  document.body.replaceChildren();
  jumps.length = 0;
});

function check(letter: LetterForm) {
  const before = JSON.stringify(letter);
  const view = buildLetterCard(letter, ctx, options(letter));
  document.body.append(view.element);
  const editable = [...view.element.querySelectorAll('textarea, [role=textbox]')];
  for (const node of editable) {
    expect(node.getAttribute('aria-label') ?? '').not.toBe('');
  }
  // Building the card does not touch the letter, so placeholders cannot reach it.
  expect(JSON.stringify(letter)).toBe(before);
  expect(view.element.querySelector('.form')).toBeNull();
  expect(view.element.querySelector('a, img, script, style')).toBeNull();
  return { view, editable };
}

describe('letter card', () => {
  it('builds for an empty letter, with placeholders that are not values', () => {
    const letter = empty();
    const { view, editable } = check(letter);
    expect(editable.length).toBeGreaterThan(8);
    const summary = view.element.querySelector<HTMLTextAreaElement>('[aria-label="Summary line"]');
    expect(summary?.placeholder).toBe('Add a summary line');
    expect(summary?.value).toBe('');
    const greeting = view.element.querySelector<HTMLTextAreaElement>('[aria-label="Greeting"]');
    expect(greeting?.value).toBe('Hi Pack 137 families,');
    expect(view.fieldText(['summary'])).toBe('');
    expect(view.fieldControl(['story', 'title'])).not.toBeNull();
  });

  it('builds for the November reference letter with its words in place', () => {
    const letter = structuredClone(reference);
    const { view, editable } = check(letter);
    expect(editable.length).toBeGreaterThan(40);
    expect(view.fieldText(['summary'])).toBe(letter.summary);
    expect(view.fieldText(['story', 'title'])).toBe(letter.story.title);
    const groups = [...view.element.querySelectorAll('[role=group]')].map((g) =>
      g.getAttribute('aria-label'),
    );
    expect(groups).toContain('Block 1: Contributor');
    expect(groups).toContain('Event 1');
    expect(groups).toContain('Feedback');
    // These photos have an address, so the card says Photo rather than Insert photo here.
    expect(view.element.textContent).toContain('Photo:');
  });

  it('draws a photo spot as the dashed "Insert photo here" box with its description', () => {
    const letter = empty();
    letter.story.blocks.push({
      kind: 'photo',
      photo: { src: '', alt: 'Scouts at the fire', caption: 'Friday night' },
    });
    const { view } = check(letter);
    expect(view.element.textContent).toContain('Insert photo here:');
    expect(view.fieldText(['story', 'blocks', 0, 'photo', 'alt'])).toBe('Scouts at the fire');
    expect(view.fieldText(['story', 'blocks', 0, 'photo', 'caption'])).toBe('Friday night');
  });

  it('typing on the card edits the letter, and undo can write back without a redraw', () => {
    const letter = empty();
    const view = buildLetterCard(letter, ctx, options(letter));
    document.body.append(view.element);
    const title = view.fieldControl(['story', 'title']) as HTMLTextAreaElement;
    title.value = 'Fall camp';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    expect(letter.story.title).toBe('Fall camp');
    view.setField(['story', 'title'], '', [0, 0]);
    expect(title.value).toBe('');
    expect(letter.story.title).toBe('');
    expect(view.focusPath(['story', 'title'])).toBe(true);
  });

  it('its "Change in the form" buttons name where they go', () => {
    const letter = structuredClone(reference);
    const view = buildLetterCard(letter, ctx, options(letter));
    document.body.append(view.element);
    const button = [...view.element.querySelectorAll('button')].find(
      (b) =>
        b.getAttribute('aria-label') ===
        'Change in the form: date, time and link address of event 1',
    );
    expect(button).toBeDefined();
    button?.click();
    expect(jumps).toEqual([['comingUp', 'items', 0, 'date']]);
  });

  it('lists the things to look at, each with a button that jumps to its field', () => {
    const letter = empty();
    const view = buildLetterCard(letter, ctx, options(letter));
    document.body.append(view.element);
    const heading = view.element.querySelector('.ec-notes-title');
    expect(heading?.textContent).toBe(`Things to look at (${letterNotes(letter).length})`);
    const show = view.element.querySelector<HTMLButtonElement>(
      'button[aria-label="Show in the form: The summary line is empty."]',
    );
    show?.click();
    expect(jumps).toEqual([['summary']]);
  });

  it('shows a section that is switched off as a short note with a way to turn it on', () => {
    const letter = empty();
    letter.around.enabled = false;
    const { view } = check(letter);
    expect(view.element.textContent).toContain('Around the pack is off');
    expect(view.fieldControl(['around', 'intro'])).toBeNull();
  });
});

describe('the form still reaches the same places', () => {
  it('registers dates and section switches for "Change in the form"', () => {
    const letter = structuredClone(reference);
    const view = buildLetterForm(letter, ctx);
    document.body.append(view.element);
    expect(view.focusPath(['comingUp', 'items', 1, 'date'])).toBe(true);
    const focused = document.activeElement as HTMLInputElement;
    expect(focused.type).toBe('date');
    const dates = [...view.element.querySelectorAll<HTMLInputElement>('input[type=date]')];
    // The second Coming up event, not the first date on the screen.
    expect(focused).toBe(dates[dates.indexOf(focused)]);
    expect(focused).not.toBe(
      dates.find((d) => d.closest('section')?.querySelector('h3')?.textContent === 'Coming up'),
    );
    expect(view.focusPath(['closing', 'enabled'])).toBe(true);
    expect((document.activeElement as HTMLInputElement).getAttribute('role')).toBe('switch');
  });

  it('letterWarnings gives the same sentences as letterNotes', () => {
    const letter = empty();
    expect(letterWarnings(letter)).toEqual(letterNotes(letter).map((n) => n.message));
    for (const note of letterNotes(letter)) expect(note.path.length).toBeGreaterThan(0);
  });
});
