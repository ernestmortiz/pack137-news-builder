import { describe, expect, it } from 'vitest';
import {
  CHECKS_TITLE,
  checksLine,
  createNotesPanel,
  fillChecksBox,
  NOTES_SHOWN,
  type CardNote,
} from '../../src/ui/card-parts';

const box = () => document.createElement('div');

describe('one name for the checks list', () => {
  it('is "Things to check"', () => {
    expect(CHECKS_TITLE).toBe('Things to check');
  });
  it('says the number in one line, with plain singular and plural', () => {
    expect(checksLine(3)).toBe('3 things to check, listed above the card.');
    expect(checksLine(1)).toBe('1 thing to check, listed above the card.');
  });
});

describe('the right-hand check list', () => {
  it('in the form shows the full list under the one name', () => {
    const b = box();
    fillChecksBox(b, { list: ['A one.', 'A two.'], problems: [] });
    expect(b.querySelector('.label')?.textContent).toBe('Things to check');
    expect([...b.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['A one.', 'A two.']);
  });
  it('in the form with nothing to fix says it is ready', () => {
    const b = box();
    fillChecksBox(b, { list: [], problems: [] });
    expect(b.textContent).toBe('Nothing to fix. This is ready to copy.');
  });
  it('on the card says the number and does not repeat the list', () => {
    const b = box();
    fillChecksBox(b, { list: ['A one.', 'A two.'], problems: [], count: 3 });
    expect(b.textContent).toBe('3 things to check, listed above the card.');
    expect(b.querySelector('li')).toBeNull();
  });
  it('on the card with nothing listed says it is ready', () => {
    const b = box();
    fillChecksBox(b, { list: [], problems: [], count: 0 });
    expect(b.textContent).toBe('Nothing to fix. This is ready to copy.');
  });
  it('on the card still shows a problem with the HTML itself, after the line', () => {
    const b = box();
    fillChecksBox(b, { list: [], problems: ['Problem X'], count: 2 });
    expect(b.querySelector('.label')?.textContent).toBe(
      '2 things to check, listed above the card.',
    );
    expect([...b.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Problem X']);
    const only = box();
    fillChecksBox(only, { list: [], problems: ['Problem X'], count: 0 });
    expect(only.textContent).toBe('Problem X');
  });
});

describe('the notes above the card (a long calendar has many)', () => {
  const notes = (n: number): CardNote[] =>
    Array.from({ length: n }, (_, i) => ({ key: `k${i}`, message: `Note ${i}.`, path: ['title'] }));
  const visible = (el: HTMLElement) =>
    [...el.querySelectorAll('li')].filter((li) => !li.hidden).length;

  it('shows the first few and a "Show all" button that shows the rest and back', () => {
    const panel = createNotesPanel({
      title: CHECKS_TITLE,
      notes: () => notes(24),
      openInForm: () => {},
    });
    const more = panel.element.querySelector<HTMLButtonElement>('.ec-notes-more');
    expect(panel.element.querySelector('h3')?.textContent).toBe('Things to check (24)');
    expect(visible(panel.element)).toBe(NOTES_SHOWN);
    expect(more?.hidden).toBe(false);
    expect(more?.textContent).toBe('Show all 24');
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    more?.click();
    expect(visible(panel.element)).toBe(24);
    expect(more?.textContent).toBe('Show fewer');
    expect(more?.getAttribute('aria-expanded')).toBe('true');
    more?.click();
    expect(visible(panel.element)).toBe(NOTES_SHOWN);
  });

  it('has no button when the list is short', () => {
    const panel = createNotesPanel({
      title: CHECKS_TITLE,
      notes: () => notes(3),
      openInForm: () => {},
    });
    expect(visible(panel.element)).toBe(3);
    expect(panel.element.querySelector<HTMLButtonElement>('.ec-notes-more')?.hidden).toBe(true);
  });

  it('keeps the list open after a refresh with new notes', () => {
    let count = 10;
    const panel = createNotesPanel({
      title: CHECKS_TITLE,
      notes: () => notes(count),
      openInForm: () => {},
    });
    panel.element.querySelector<HTMLButtonElement>('.ec-notes-more')?.click();
    count = 9;
    panel.refresh();
    expect(visible(panel.element)).toBe(9);
  });
});
