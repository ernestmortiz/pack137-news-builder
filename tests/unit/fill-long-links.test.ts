/**
 * Long bare links (owner, 2026-11-22): a link whose words are its own address, longer than 30
 * characters, gets a suggestion to show the site's host name instead. The address cannot wrap and
 * stretches the email on a phone. Offered, never applied; the link itself is never changed.
 */
import { describe, expect, it } from 'vitest';
import {
  applySuggestion,
  fillForm,
  suggestionsFor,
  type FillOptions,
  type Suggestion,
} from '../../src/core/fill';
import type {
  AnnouncementForm,
  CallToActionForm,
  DateListForm,
  HelpWantedForm,
  LinkListForm,
  MessageForm,
  RichText,
} from '../../src/core/forms';
import { formFields, getAt, hasPath } from '../../src/core/helpers/paths';
import { lintOutput } from '../../src/core/lint-output';
import type { Layout, TextRun } from '../../src/core/model';
import { parse } from '../../src/core/pipeline';
import { renderAnnouncement } from '../../src/core/render';
import { itemsFor } from '../../src/ui/paths';

const LAYOUTS: Layout[] = ['message', 'call-to-action', 'link-list', 'date-list', 'help-wanted'];
const OPTIONS: FillOptions = {
  today: { year: 2026, month: 11, day: 22 },
  programYearStartMonth: 9,
};
const GENIUS = 'https://www.signupgenius.com/go/4090F4CAEAE2AA4F58-61725464-stmichael';
const MESSAGE =
  'Show this long link as "signupgenius.com"? The full address stays behind the link.';

/** The owner's paste, as it came from TroopTrack. */
const OWNER_PASTE = `<div style="font-family: Arial;"><p style="text-align: left;"><span><strong>The&nbsp;</strong></span><span id="isPasted"><strong>First Presbyterian Church is having Scout Sunday on February 8th, 10am-11am.</strong></span></p><p><span id="isPasted">Even if you are are not members of the First Presbyterian Church, you are encouraged to show up as Scouts in full class A uniform for this event.</span></p><p><span>Please RSVP via the TroopTrack event. If you have questions, please contact Ryan Meier.</span></p><p><span>For the Scouts that attend <strong>St. Michael&#39;s Church</strong>, they are also having a Scout Sunday on <strong>February 1st</strong> at the 9am mass. &nbsp;If you are interested, please signup here: <a target="_blank" rel="noopener noreferrer" data-fr-linked="true" href="${GENIUS}">${GENIUS}</a>. &nbsp;If you have any questions, please contact Andy through the SignUp Genius Link.</span></p><p><br></p></div>`;

/** The long address as the words of a link in the output, alone or after other words. */
const SHOWN_AS_LINK = /<a [^>]*>[^<]*stmichael[^<]*<\/a>/;

const isLink = (s: Suggestion) => s.message.startsWith('Show this long link as ');
const isCase = (s: Suggestion) => s.message.startsWith('Use sentence case: ');
const links = (form: AnnouncementForm) => suggestionsFor(form).filter(isLink);
const where = (list: Suggestion[]) => list.map((s) => s.path.join('.'));
const text = (value: string): TextRun => ({ kind: 'text', text: value, marks: [] });
const link = (value: string, href: string): TextRun => ({ ...text(value), href });
const one = (list: Suggestion[]): Suggestion => {
  expect(list).toHaveLength(1);
  return list[0] as Suggestion;
};

/** Every link in the form's rich text, as [words, address]. */
const richLinks = (form: AnnouncementForm) =>
  formFields(form).flatMap((f) =>
    f.kind === 'rich'
      ? f.value.flatMap((r) =>
          r.kind === 'text' && r.href !== undefined ? [[r.text, r.href]] : [],
        )
      : [],
  );
const urlsOf = (form: AnnouncementForm) =>
  formFields(form).flatMap((f) => (f.kind === 'url' ? [f.value] : []));

describe("long links: the owner's Scout Sunday paste", () => {
  const parsed = parse(OWNER_PASTE);
  const filled = (layout: Layout) => fillForm(parsed, layout, OPTIONS);

  it('Message: no sentence case suggestion, one long link suggestion', () => {
    const { form, suggestions } = filled('message');
    expect(suggestions.filter(isCase)).toEqual([]);
    const s = one(suggestions.filter(isLink));
    expect(s.message).toBe(MESSAGE);
    expect(s.from).toBe(GENIUS);
    expect(s.to).toBe('signupgenius.com');
    expect(hasPath(form, s.path)).toBe(true);
    expect(getAt(form, s.path)).toBe(GENIUS);
  });

  it('Message: applying it changes the words of that one run and nothing else', () => {
    const { form } = filled('message');
    const before = structuredClone(form);
    const s = one(links(form));
    const next = applySuggestion(form, s);
    // The form passed in is untouched, which is what undo relies on.
    expect(form).toEqual(before);

    const runPath = s.path.slice(0, -1);
    const fieldPath = s.path.slice(0, -2);
    expect(getAt(next, runPath)).toEqual({ ...(getAt(form, runPath) as TextRun), text: s.to });
    expect((getAt(next, runPath) as TextRun).href).toBe(GENIUS);

    const was = getAt(form, fieldPath) as RichText;
    const now = getAt(next, fieldPath) as RichText;
    const at = s.path[s.path.length - 2] as number;
    expect(now).toHaveLength(was.length);
    now.forEach((run, i) => {
      if (i !== at) expect(run).toEqual(was[i]);
    });
    // Everything outside that paragraph is as it was.
    const expected = structuredClone(form);
    (getAt(expected, runPath) as TextRun).text = 'signupgenius.com';
    expect(next).toEqual(expected);

    expect(links(next)).toEqual([]);
    // A second tap on the same suggestion changes nothing.
    expect(applySuggestion(next, s)).toEqual(next);
  });

  it('Message: the output passes lintOutput before and after, and keeps the address', () => {
    const { form } = filled('message');
    const next = applySuggestion(form, one(links(form)));
    for (const f of [form, next]) expect(lintOutput(renderAnnouncement(f))).toEqual([]);
    const html = renderAnnouncement(next);
    expect(html).toContain(`href="${GENIUS}"`);
    expect(html).toContain('>signupgenius.com</a>');
    expect(html).not.toContain(`>${GENIUS}</a>`);
  });

  it.each(LAYOUTS)('%s: every long link is offered, applies, and keeps its address', (layout) => {
    const { form, suggestions } = filled(layout);
    expect(suggestions).toEqual(suggestionsFor(form));
    const offered = suggestions.filter(isLink);
    expect(offered.length).toBeGreaterThan(0);
    for (const s of offered) {
      expect(s.message).toBe(MESSAGE);
      expect(hasPath(form, s.path)).toBe(true);
      expect(applySuggestion(form, s)).not.toEqual(form);
    }
    let next = form;
    for (let guard = 0; guard < 20; guard++) {
      const s = links(next)[0];
      if (s === undefined) break;
      next = applySuggestion(next, s);
    }
    expect(links(next)).toEqual([]);
    // No link shows the long address any more, and no address changed.
    expect(renderAnnouncement(form)).toMatch(SHOWN_AS_LINK);
    expect(renderAnnouncement(next)).not.toMatch(SHOWN_AS_LINK);
    expect(richLinks(next).map(([, href]) => href)).toEqual(
      richLinks(form).map(([, href]) => href),
    );
    expect(urlsOf(next)).toEqual(urlsOf(form));
    expect(lintOutput(renderAnnouncement(next))).toEqual([]);
    // Applying the link fix never brings up a sentence case suggestion for the host name.
    expect(suggestionsFor(next).filter(isCase)).toEqual(suggestions.filter(isCase));
  });
});

describe('long links: which links', () => {
  const message = (...paragraphs: RichText[]): MessageForm => ({
    layout: 'message',
    label: 'News',
    title: 'Scout Sunday',
    paragraphs,
  });

  it('offers nothing for a link of exactly 30 characters', () => {
    const thirty = 'https://example.org/abcdefghij';
    expect(thirty).toHaveLength(30);
    expect(links(message([text('Go to '), link(thirty, thirty)]))).toEqual([]);
    const longer = `${thirty}k`;
    expect(where(links(message([text('Go to '), link(longer, longer)])))).toEqual([
      'paragraphs.0.1.text',
    ]);
  });

  it('offers nothing when the link already has words', () => {
    expect(
      links(message([link('Sign up for the Scout Sunday mass at St. Michael', GENIUS)])),
    ).toEqual([]);
    expect(links(message([link('Click here', GENIUS)]))).toEqual([]);
  });

  it('offers nothing for an email link', () => {
    const mail = 'mailto:cubmaster.of.pack.137@example.org';
    const form = message([link(mail, mail)], [link('cubmaster.of.pack.137@example.org', mail)]);
    form.button = { text: mail, url: mail };
    expect(links(form)).toEqual([]);
  });

  it('offers nothing for a long address that is not a link', () => {
    expect(links(message([text(`Go to ${GENIUS} today`)]))).toEqual([]);
  });

  it('takes the address without its scheme as the address', () => {
    const bare = GENIUS.replace('https://', '');
    const s = one(links(message([link(bare, GENIUS)])));
    expect(s).toEqual({
      path: ['paragraphs', 0, 0, 'text'],
      message: MESSAGE,
      from: bare,
      to: 'signupgenius.com',
    });
  });

  it('gives each place the link appears its own suggestion', () => {
    const form = message(
      [text('Sign up: '), link(GENIUS, GENIUS), text(' or '), link(GENIUS, GENIUS)],
      [text(`The address is ${GENIUS} in full. `), link(GENIUS, GENIUS)],
    );
    const offered = links(form);
    expect(where(offered)).toEqual([
      'paragraphs.0.1.text',
      'paragraphs.0.3.text',
      'paragraphs.1.1.text',
    ]);
    const next = applySuggestion(form, offered[1] as Suggestion) as MessageForm;
    expect(next.paragraphs[0]).toEqual([
      text('Sign up: '),
      link(GENIUS, GENIUS),
      text(' or '),
      link('signupgenius.com', GENIUS),
    ]);
    expect(next.paragraphs[1]).toEqual(form.paragraphs[1]);
    expect(where(links(next))).toEqual(['paragraphs.0.1.text', 'paragraphs.1.1.text']);
    // The address written out as plain words is the writer's and stays.
    const last = applySuggestion(next, links(next)[1] as Suggestion) as MessageForm;
    expect(last.paragraphs[1]).toEqual([
      text(`The address is ${GENIUS} in full. `),
      link('signupgenius.com', GENIUS),
    ]);
  });

  it('keeps the spaces and the marks of the run', () => {
    const run: TextRun = { kind: 'text', text: ` ${GENIUS} `, marks: ['strong'], href: GENIUS };
    const form = message([text('Here:'), run]);
    const next = applySuggestion(form, one(links(form))) as MessageForm;
    expect(next.paragraphs[0]?.[1]).toEqual({ ...run, text: ' signupgenius.com ' });
  });

  it('shows beside the field that holds the link', () => {
    const form = message([text('One')], [text('Sign up: '), link(GENIUS, GENIUS)]);
    const list = suggestionsFor(form);
    expect(itemsFor(list, ['paragraphs', 1]).filter(isLink)).toHaveLength(1);
    expect(itemsFor(list, ['paragraphs', 0]).filter(isLink)).toEqual([]);
  });

  it('comes after the small fixes and sentence case', () => {
    const form = message([text('Cubs & Webelos: '), link(GENIUS, GENIUS)]);
    form.title = 'Scout Sunday Mass';
    expect(suggestionsFor(form).map((s) => s.to)).toEqual([
      ' and ',
      'Scout Sunday mass',
      'signupgenius.com',
    ]);
  });
});

describe('long links: every field that can hold a link', () => {
  it('Message and Call to action: paragraphs and the button', () => {
    const message: MessageForm = {
      layout: 'message',
      label: '',
      title: '',
      paragraphs: [[link(GENIUS, GENIUS)]],
      button: { text: GENIUS, url: GENIUS },
    };
    expect(where(links(message))).toEqual(['paragraphs.0.0.text', 'button.text']);
    const done = applySuggestion(message, links(message)[1] as Suggestion) as MessageForm;
    expect(done.button).toEqual({ text: 'signupgenius.com', url: GENIUS });
    expect(done.paragraphs).toEqual(message.paragraphs);

    const action: CallToActionForm = {
      layout: 'call-to-action',
      label: '',
      title: '',
      paragraph: [text('Go: '), link(GENIUS, GENIUS)],
      button: { text: GENIUS, url: GENIUS },
    };
    expect(where(links(action))).toEqual(['paragraph.1.text', 'button.text']);
  });

  it('Link list: the intro and each link', () => {
    const form: LinkListForm = {
      layout: 'link-list',
      label: '',
      title: '',
      intro: [link(GENIUS, GENIUS)],
      items: [
        { text: 'Scouts collect food', url: GENIUS, note: '' },
        { text: GENIUS, url: GENIUS, note: GENIUS },
        { text: GENIUS, url: '', note: '' },
      ],
    };
    expect(where(links(form))).toEqual(['intro.0.text', 'items.1.text']);
    const done = applySuggestion(form, links(form)[1] as Suggestion) as LinkListForm;
    expect(done.items[1]).toEqual({ text: 'signupgenius.com', url: GENIUS, note: GENIUS });
    expect(lintOutput(renderAnnouncement(done))).toEqual([]);
  });

  it('Date list: the event of a row and a link in its note', () => {
    const form: DateListForm = {
      layout: 'date-list',
      label: '',
      title: '',
      sections: [
        {
          name: 'Coming soon',
          style: 'plain',
          subtitle: '',
          rows: [
            {
              date: { start: { year: 2027, month: 2, day: 1 } },
              event: 'Scout Sunday',
              url: GENIUS,
              tags: [],
              note: [text('Sign up: '), link(GENIUS, GENIUS)],
            },
            { event: GENIUS, url: GENIUS, tags: [], note: [] },
          ],
        },
      ],
    };
    expect(where(links(form))).toEqual([
      'sections.0.rows.0.note.1.text',
      'sections.0.rows.1.event',
    ]);
    let done = form as AnnouncementForm;
    for (const s of links(form)) done = applySuggestion(done, s);
    const rows = (done as DateListForm).sections[0]?.rows ?? [];
    expect(rows[0]?.note).toEqual([text('Sign up: '), link('signupgenius.com', GENIUS)]);
    expect(rows[0]?.url).toBe(GENIUS);
    expect(rows[1]).toEqual({ event: 'signupgenius.com', url: GENIUS, tags: [], note: [] });
    expect(links(done)).toEqual([]);
    expect(lintOutput(renderAnnouncement(done))).toEqual([]);
  });

  it('a row or a link item whose words end with the address: only the address is replaced', () => {
    const form: DateListForm = {
      layout: 'date-list',
      label: '',
      title: '',
      sections: [
        {
          name: '',
          style: 'plain',
          subtitle: '',
          rows: [
            { event: `Please sign up here: ${GENIUS}.`, url: GENIUS, tags: [], note: [] },
            { event: 'Sign up for Scout Sunday', url: GENIUS, tags: [], note: [] },
          ],
        },
      ],
    };
    const s = one(links(form));
    expect(s).toEqual({
      path: ['sections', 0, 'rows', 0, 'event'],
      message: MESSAGE,
      from: GENIUS,
      to: 'signupgenius.com',
    });
    const done = applySuggestion(form, s) as DateListForm;
    expect(done.sections[0]?.rows[0]).toEqual({
      event: 'Please sign up here: signupgenius.com.',
      url: GENIUS,
      tags: [],
      note: [],
    });
    expect(links(done)).toEqual([]);
  });

  it('Help wanted: the intro, the ask paragraphs, the outro and both buttons', () => {
    const form: HelpWantedForm = {
      layout: 'help-wanted',
      label: '',
      title: '',
      intro: [link(GENIUS, GENIUS)],
      ask: {
        badge: 'Highest need',
        title: 'Scout Sunday helpers',
        paragraphs: [[text('One')], [text('Two: '), link(GENIUS, GENIUS)]],
        button: { text: GENIUS, url: GENIUS },
      },
      outro: [link(GENIUS, GENIUS)],
      secondary: { text: GENIUS, url: GENIUS },
    };
    expect(where(links(form)).sort()).toEqual(
      [
        'intro.0.text',
        'ask.paragraphs.1.1.text',
        'ask.button.text',
        'outro.0.text',
        'secondary.text',
      ].sort(),
    );
    let done = form as AnnouncementForm;
    for (const s of links(form)) done = applySuggestion(done, s);
    expect(links(done)).toEqual([]);
    expect(urlsOf(done)).toEqual(urlsOf(form));
    expect(lintOutput(renderAnnouncement(done))).toEqual([]);
  });

  it('a link in a pasted list and in a pasted date row', () => {
    const html = `<p><strong>Scout Sunday</strong></p><ul><li>Feb 1: 9am mass, sign up at <a href="${GENIUS}">${GENIUS}</a></li><li>Feb 8: <a href="${GENIUS}">${GENIUS}</a></li></ul>`;
    const parsed = parse(html);
    for (const layout of LAYOUTS) {
      const { form } = fillForm(parsed, layout, OPTIONS);
      const offered = links(form);
      expect(offered.length, layout).toBeGreaterThan(0);
      let next = form;
      for (const s of offered) next = applySuggestion(next, s);
      expect(links(next), layout).toEqual([]);
      expect(renderAnnouncement(next), layout).not.toMatch(SHOWN_AS_LINK);
      expect(urlsOf(next)).toEqual(urlsOf(form));
      expect(lintOutput(renderAnnouncement(next)), layout).toEqual([]);
    }
  });
});
