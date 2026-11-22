/**
 * Owner decisions on the fill stage: a pasted weekday that does not match its date is flagged,
 * copy is kept whole, and only odd characters (invisible ones, and bullets or ornaments that
 * stand alone or lead a line) are cleaned, each time with a "check me" on the field.
 */
import { describe, expect, it } from 'vitest';
import { fillForm, type CheckMe, type FillOptions, type FillResult } from '../../src/core/fill';
import type {
  CallToActionForm,
  DateListForm,
  HelpWantedForm,
  LinkListForm,
  MessageForm,
} from '../../src/core/forms';
import { dateLabel } from '../../src/core/helpers/dates';
import { hasPath } from '../../src/core/helpers/paths';
import { lintOutput } from '../../src/core/lint-output';
import type { Layout } from '../../src/core/model';
import { parse } from '../../src/core/pipeline';
import { renderAnnouncement } from '../../src/core/render';

const OPTIONS: FillOptions = {
  today: { year: 2026, month: 11, day: 21 },
  programYearStartMonth: 9,
};
const LAYOUTS: Layout[] = ['message', 'call-to-action', 'link-list', 'date-list', 'help-wanted'];
const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const ZWSP = cp(0x200b);
const SHY = cp(0xad);
const BULLET = cp(0x2022);
const STAR = cp(0x2605);
const ARROW = cp(0x2192);
const CHECK = cp(0x2713);
const PARTY = cp(0x1f389);

const fillHtml = (html: string, layout: Layout): FillResult =>
  fillForm(parse(html), layout, OPTIONS);
const rowsOf = (result: FillResult) =>
  (result.form as DateListForm).sections.flatMap((s) => s.rows);
const ofKind = (result: FillResult, kind: CheckMe['kind']) =>
  result.checks.filter((c) => c.kind === kind).map((c) => `${c.path.join('.')}: ${c.message}`);
const text = (runs: { kind: string; text?: string }[]) =>
  runs.map((r) => (r.kind === 'text' ? r.text : '\n')).join('');

function expectSound(result: FillResult): void {
  for (const check of result.checks) {
    expect(hasPath(result.form, check.path), `check ${check.path.join('.')}`).toBe(true);
    expect(check.message).toMatch(/^[A-Z"][^\n]*[.]$/);
  }
  expect(lintOutput(renderAnnouncement(result.form))).toEqual([]);
}

describe('fillForm: weekday mismatch', () => {
  it('shows the right weekday and adds a check on the date', () => {
    const result = fillHtml('<ul><li>Mon 1/16/2027 Hike</li><li>Dec 8 Swim</li></ul>', 'date-list');
    const [row] = rowsOf(result);
    expect(row?.date).toEqual({ start: { year: 2027, month: 1, day: 16 } });
    expect(dateLabel(row?.date)).toBe('Sat Jan 16');
    expect(row?.event).toBe('Hike');
    expect(ofKind(result, 'weekday-mismatch')).toEqual([
      'sections.0.rows.0.date: The paste said Mon, but Jan 16, 2027 is a Saturday. Check the date.',
    ]);
    expectSound(result);
  });

  it('reads full and short weekday names', () => {
    for (const said of ['Monday', 'Mon', 'Mon.', 'Tues', 'Thurs']) {
      const result = fillHtml(`<ul><li>${said} 1/16/2027 Hike</li></ul>`, 'date-list');
      expect(ofKind(result, 'weekday-mismatch'), said).toEqual([
        `sections.0.rows.0.date: The paste said ${said.replace('.', '')}, but Jan 16, 2027 is a Saturday. Check the date.`,
      ]);
    }
  });

  it('adds no check when the weekday matches or is absent', () => {
    const result = fillHtml(
      '<ul><li>Sat 1/16/2027 Hike</li><li>1/17/2027 Swim</li><li>Saturday, January 16, 2027 Bike</li>' +
        '<li>Sat Feb 27 - Sun Feb 28, 2027 Trip</li><li>Feb 27-28 Trip</li></ul>',
      'date-list',
    );
    expect(rowsOf(result).map((r) => dateLabel(r.date))).toEqual([
      'Sat Jan 16',
      'Sun Jan 17',
      'Sat Jan 16',
      'Sat Feb 27 to Sun Feb 28',
      'Sat Feb 27 to Sun Feb 28',
    ]);
    expect(ofKind(result, 'weekday-mismatch')).toEqual([]);
  });

  it('checks each end of a range that carries a weekday', () => {
    const result = fillHtml(
      '<ul><li>Fri Feb 27 - Mon Feb 28, 2027 Trip</li><li>Sat Feb 27 to Mon Feb 28, 2027 Camp</li></ul>',
      'date-list',
    );
    expect(ofKind(result, 'weekday-mismatch')).toEqual([
      'sections.0.rows.0.date: The paste said Fri, but Feb 27, 2027 is a Saturday. Check the date.',
      'sections.0.rows.0.date: The paste said Mon, but Feb 28, 2027 is a Sunday. Check the date.',
      'sections.0.rows.1.date: The paste said Mon, but Feb 28, 2027 is a Sunday. Check the date.',
    ]);
    expectSound(result);
  });

  it('compares against the year that was assumed', () => {
    // Dec 6 is read as 2026, a Sunday. Jan 16 is read as 2027, a Saturday.
    const result = fillHtml(
      '<ul><li>Sat Dec 6 Hike</li><li>Sun Dec 6 Swim</li><li>Sat Jan 16 Bike</li></ul>',
      'date-list',
    );
    expect(ofKind(result, 'weekday-mismatch')).toEqual([
      'sections.0.rows.0.date: The paste said Sat, but Dec 6, 2026 is a Sunday. Check the date.',
    ]);
    expect(ofKind(result, 'year-assumed')).toHaveLength(3);
  });
});

describe('fillForm: copy is kept whole', () => {
  it('keeps a trailing " | Site Name" on a Date list event name', () => {
    const result = fillHtml(
      '<ul><li>Dec 6 <a href="https://example.org/a">Den Meeting | Scouting America</a></li>' +
        '<li>Dec 8 Den Meeting | Scouting America</li>' +
        '<li><a href="https://example.org/b">Den Meeting | Scouting America</a></li></ul>',
      'date-list',
    );
    expect(rowsOf(result).map((r) => r.event)).toEqual([
      'Den Meeting | Scouting America',
      'Den Meeting | Scouting America',
      'Den Meeting | Scouting America',
    ]);
    expect(ofKind(result, 'title-cleanup')).toEqual([]);
    expect(ofKind(result, 'odd-characters')).toEqual([]);
  });

  it('keeps every word of names, notes, paragraphs, titles and button text in every layout', () => {
    const html =
      '<h3>Den Meeting | Scouting America</h3>' +
      `<p>Come along - it is fun | free &amp; open (bring #1 fan @ 50% off) ${PARTY} see you there</p>` +
      '<h3>Coming Soon | This Month</h3>' +
      '<ul><li>Dec 6 Hike | Trail Club - meet at the gate</li></ul>' +
      '<p><a href="https://example.org/go">Sign up | Scouting America</a></p>';
    const wordsOf = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const pasted = wordsOf(html.replace(/<[^>]+>/g, ' ').replace('&amp;', '&'));
    for (const layout of LAYOUTS) {
      const result = fillHtml(html, layout);
      const have = new Set(
        wordsOf(JSON.stringify(result.form) + ' ' + JSON.stringify(result.checks)),
      );
      for (const word of pasted) {
        if (layout === 'date-list' && (word === 'dec' || word === '6')) continue;
        expect(have.has(word), `${layout}: ${word}`).toBe(true);
      }
      expect(JSON.stringify(result.form)).toContain(PARTY);
      expect(ofKind(result, 'odd-characters')).toEqual([]);
      expectSound(result);
    }
    const message = fillHtml(html, 'message').form as MessageForm;
    expect(message.title).toBe('Den Meeting | Scouting America');
    expect(message.button?.text).toBe('Sign up | Scouting America');
    const dates = fillHtml(html, 'date-list').form as DateListForm;
    expect(dates.sections.map((s) => s.name)).toContain('Coming Soon | This Month');
  });
});

describe('fillForm: odd characters', () => {
  it('reads the date behind a pasted bullet and says what was removed', () => {
    const result = fillHtml(
      `<p>${BULLET} Dec 6 Pack Meeting</p><p>${CHECK} 12/8 Hike TBD</p><p>${BULLET}${ZWSP} Dec 9 ${ARROW} Swim ${STAR}</p>`,
      'date-list',
    );
    const rows = rowsOf(result);
    expect(rows.map((r) => [dateLabel(r.date), r.event])).toEqual([
      ['Sun Dec 6', 'Pack Meeting'],
      ['Tue Dec 8', 'Hike'],
      ['Wed Dec 9', 'Swim'],
    ]);
    expect(ofKind(result, 'odd-characters')).toEqual([
      `sections.0.rows.0.event: Removed odd characters: ${BULLET}.`,
      `sections.0.rows.1.event: Removed odd characters: ${CHECK}.`,
      `sections.0.rows.2.event: Removed odd characters: ${BULLET} ${ARROW} ${STAR}, an invisible space.`,
    ]);
    expectSound(result);
  });

  it('cleans a Date list: title, section name, event, note and the line under a row', () => {
    const result = fillHtml(
      `<h3>${STAR} Pack Calendar ${STAR}</h3><h3>${BULLET} Coming Soon</h3>` +
        `<ul><li>Dec 6 Pack Mee${SHY}ting: bring wa${ZWSP}ter<br>${ARROW} at the gate</li>` +
        `<li><a href="https://example.org/a">${BULLET} Sign up</a> ${STAR}</li></ul>`,
      'date-list',
    );
    const form = result.form as DateListForm;
    expect(form.title).toBe('Pack Calendar');
    expect(form.sections[0]?.name).toBe('Coming Soon');
    const [first, second] = rowsOf(result);
    expect(first?.event).toBe('Pack Meeting: bring water');
    expect(text(first?.note ?? [])).toBe('at the gate');
    expect(second?.event).toBe('Sign up');
    expect(second?.note).toEqual([]);
    expect(ofKind(result, 'odd-characters')).toEqual([
      `title: Removed odd characters: ${STAR}.`,
      `sections.0.name: Removed odd characters: ${BULLET}.`,
      'sections.0.rows.0.event: Removed odd characters: a soft hyphen, an invisible space.',
      `sections.0.rows.0.note: Removed odd characters: ${ARROW}.`,
      `sections.0.rows.1.event: Removed odd characters: ${BULLET}.`,
    ]);
    expect(JSON.stringify(form)).not.toMatch(new RegExp(`[${STAR}${BULLET}${ARROW}${ZWSP}${SHY}]`));
    expectSound(result);
  });

  it('cleans a Message: title, paragraphs and button', () => {
    const result = fillHtml(
      `<h3>${PARTY} Big News</h3><p>${BULLET} First thing ${PARTY} is fun<br>${BULLET} Second${ZWSP} thing</p>` +
        `<p>${STAR}${STAR}${STAR}</p><p>Camping ${STAR} Hiking</p>` +
        `<p><a href="https://example.org/go">Sign up ${ARROW}</a></p>`,
      'message',
    );
    const form = result.form as MessageForm;
    expect(form.title).toBe('Big News');
    expect(form.paragraphs.map(text)).toEqual([
      `First thing ${PARTY} is fun\nSecond thing`,
      '',
      `Camping ${STAR} Hiking`,
    ]);
    expect(form.button).toEqual({ text: 'Sign up', url: 'https://example.org/go' });
    expect(ofKind(result, 'odd-characters')).toEqual([
      `title: Removed odd characters: ${PARTY}.`,
      `paragraphs.0: Removed odd characters: ${BULLET}, an invisible space.`,
      `paragraphs.1: Removed odd characters: ${STAR}.`,
      `button.text: Removed odd characters: ${ARROW}.`,
    ]);
    expectSound(result);
  });

  it('cleans a Call to action, a Link list and Help wanted', () => {
    const cta = fillHtml(
      `<h3>${BULLET} Join us</h3><p>${CHECK} Free for all</p><p><a href="https://example.org/go">${ARROW} Sign up</a></p>`,
      'call-to-action',
    );
    const ctaForm = cta.form as CallToActionForm;
    expect([ctaForm.title, text(ctaForm.paragraph), ctaForm.button.text]).toEqual([
      'Join us',
      'Free for all',
      'Sign up',
    ]);
    expect(ofKind(cta, 'odd-characters').map((c) => c.split(':')[0])).toEqual([
      'title',
      'paragraph',
      'button.text',
    ]);
    expectSound(cta);

    const links = fillHtml(
      `<h3>In the news ${STAR}</h3><p>${BULLET} Read these.</p>` +
        `<ul><li><a href="https://example.org/a">${ARROW} Scouts collect food</a> ${STAR} from the Tri${SHY}bune</li></ul>`,
      'link-list',
    );
    const linkForm = links.form as LinkListForm;
    expect(linkForm.title).toBe('In the news');
    expect(text(linkForm.intro)).toBe('Read these.');
    expect(linkForm.items).toEqual([
      { text: 'Scouts collect food', url: 'https://example.org/a', note: 'from the Tribune' },
    ]);
    expect(ofKind(links, 'odd-characters').map((c) => c.split(':')[0])).toEqual([
      'title',
      'intro',
      'items.0.text',
      'items.0.note',
    ]);
    expectSound(links);

    const help = fillHtml(
      `<h3>${BULLET} Help needed</h3><p>${STAR} We need you</p><h3>${CHECK} Treasurer</h3>` +
        `<p>${BULLET} Keeps the books</p><p><a href="mailto:a@example.org">${ARROW} I can help</a></p>`,
      'help-wanted',
    );
    const helpForm = help.form as HelpWantedForm;
    expect([
      helpForm.title,
      text(helpForm.intro),
      helpForm.ask.title,
      helpForm.ask.paragraphs.map(text).join('|'),
      helpForm.ask.button.text,
    ]).toEqual(['Help needed', 'We need you', 'Treasurer', 'Keeps the books', 'I can help']);
    expect(ofKind(help, 'odd-characters')).toHaveLength(5);
    expectSound(help);
  });

  it('adds one check for a field, and none for a clean paste', () => {
    const odd = fillHtml(
      `<h3>Join us</h3><p>${BULLET} One ${STAR}<br>${BULLET} Two${ZWSP}</p>`,
      'call-to-action',
    );
    expect(ofKind(odd, 'odd-characters')).toEqual([
      `paragraph: Removed odd characters: ${BULLET} ${STAR}, an invisible space.`,
    ]);
    const clean = fillHtml('<p>One | two - three &amp; four</p>', 'call-to-action');
    expect(ofKind(clean, 'odd-characters')).toEqual([]);
  });

  it('leaves links alone', () => {
    const result = fillHtml(
      `<p>Read <a href="https://example.org/a${ZWSP}b">this</a> now</p>`,
      'message',
    );
    const urls = JSON.stringify(result.form).match(/https:[^"]*/g) ?? [];
    expect(ofKind(result, 'odd-characters')).toEqual([]);
    expect(urls.length).toBeGreaterThan(0);
  });
});
