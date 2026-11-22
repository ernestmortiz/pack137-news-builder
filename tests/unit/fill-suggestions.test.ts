/**
 * Sentence case suggestions (build spec, section 6: "Sentence case for headings and buttons") and
 * suggestionsFor, which works the suggestions out from the form as it is now, so they stay right
 * after an edit. Suggestions are offered and never applied by fillForm.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
} from '../../src/core/forms';
import { hasPath, setAt } from '../../src/core/helpers/paths';
import type { Layout } from '../../src/core/model';
import { parse } from '../../src/core/pipeline';

const DIR = join(__dirname, '..', 'fixtures', 'weekly');
const FIXTURES = [
  '1-pack-calendar',
  '2-help-needed',
  '3-year-in-review-photos',
  '4-in-the-news',
  '5-webelos-dens-10-11',
] as const;
const LAYOUTS: Layout[] = ['message', 'call-to-action', 'link-list', 'date-list', 'help-wanted'];
const OPTIONS: FillOptions = {
  today: { year: 2026, month: 11, day: 21 },
  programYearStartMonth: 9,
};

const read = (file: string) => readFileSync(join(DIR, file), 'utf8');
const fill = (name: string, layout?: Layout) => {
  const parsed = parse(read(`${name}.input.html`));
  return fillForm(parsed, layout ?? parsed.suggestion.layout, OPTIONS);
};

const isCase = (s: Suggestion) => s.message.startsWith('Use sentence case: ');
const brief = (list: Suggestion[]) => list.map((s) => `${s.path.join('.')}: ${s.from} -> ${s.to}`);

/** Applies every suggestion that passes `only`, working them out again after each one. */
function applyAll(start: AnnouncementForm, only: (s: Suggestion) => boolean): AnnouncementForm {
  let form = start;
  for (let guard = 0; guard < 100; guard++) {
    const next = suggestionsFor(form).find(only);
    if (next === undefined) return form;
    const applied = applySuggestion(form, next);
    expect(applied, `applying ${next.message}`).not.toEqual(form);
    form = applied;
  }
  throw new Error('the suggestions never ran out');
}

describe('suggestionsFor on the weekly fixtures', () => {
  it.each(FIXTURES)('%s: fillForm offers exactly suggestionsFor(form), in every layout', (name) => {
    for (const layout of LAYOUTS) {
      const result = fill(name, layout);
      expect(result.suggestions).toEqual(suggestionsFor(result.form));
    }
  });

  it.each(FIXTURES)('%s: every suggestion points at a field and changes it', (name) => {
    for (const layout of LAYOUTS) {
      const { form, suggestions } = fill(name, layout);
      for (const s of suggestions) {
        expect(hasPath(form, s.path)).toBe(true);
        expect(applySuggestion(form, s)).not.toEqual(form);
        expect(s.message).toMatch(/^[A-Z][^\n]*[.]$/);
      }
    }
  });

  it('1-pack-calendar: offers sentence case for three section names', () => {
    const { suggestions } = fill('1-pack-calendar');
    expect(brief(suggestions.filter(isCase))).toEqual([
      'sections.0.name: Take Action Now -> Take action now',
      'sections.1.name: Coming Soon -> Coming soon',
      'sections.2.name: Save the Date -> Save the date',
    ]);
    expect(suggestions.find(isCase)?.message).toBe('Use sentence case: "Take action now".');
  });

  it('1-pack-calendar: fillForm does not apply the suggestions', () => {
    const { form } = fill('1-pack-calendar');
    expect((form as DateListForm).sections.map((s) => s.name)).toEqual([
      'Take Action Now',
      'Coming Soon',
      'Save the Date',
      'On going',
      'References',
    ]);
  });

  it('1-pack-calendar: applying the sentence case suggestions fixes the section names', () => {
    const { form } = fill('1-pack-calendar');
    const cased = applyAll(form, isCase) as DateListForm;
    // "On going" is already sentence case. Its fix is the small fix "Ongoing", offered as before.
    expect(cased.sections.map((s) => s.name)).toEqual([
      'Take action now',
      'Coming soon',
      'Save the date',
      'On going',
      'References',
    ]);
    const done = applyAll(form, (s) => s.path[s.path.length - 1] === 'name') as DateListForm;
    expect(done.sections.map((s) => s.name)).toEqual([
      'Take action now',
      'Coming soon',
      'Save the date',
      'Ongoing',
      'References',
    ]);
    // Event names are not touched: the names of events are the owner's to word.
    expect(done.sections.map((s) => s.rows)).toEqual(
      (form as DateListForm).sections.map((s) => s.rows),
    );
  });

  it('2-help-needed: offers sentence case for the ask title and the second button', () => {
    const { suggestions } = fill('2-help-needed');
    expect(brief(suggestions.filter(isCase))).toEqual([
      'ask.title: Legal & Finance Help -> Legal & finance help',
      'secondary.text: Additional Help Needed -> Additional help needed',
    ]);
  });

  it('2-help-needed: after "&" becomes "and", a fresh sentence case suggestion appears', () => {
    const { form, suggestions } = fill('2-help-needed');
    const and = suggestions.find((s) => s.path.join('.') === 'ask.title' && s.from === ' & ');
    if (and === undefined) throw new Error('no "and" suggestion');
    const next = applySuggestion(form, and);
    expect((next as HelpWantedForm).ask.title).toBe('Legal and Finance Help');
    const fresh = suggestionsFor(next).filter((s) => s.path.join('.') === 'ask.title');
    expect(fresh).toEqual([
      {
        path: ['ask', 'title'],
        message: 'Use sentence case: "Legal and finance help".',
        from: 'Legal and Finance Help',
        to: 'Legal and finance help',
      },
    ]);
    const last = applySuggestion(next, fresh[0] as Suggestion) as HelpWantedForm;
    expect(last.ask.title).toBe('Legal and finance help');
    expect(suggestionsFor(last).filter((s) => s.path.join('.') === 'ask.title')).toEqual([]);
    // The suggestion made before the edit no longer fits and changes nothing.
    const stale = suggestions.find((s) => s.path.join('.') === 'ask.title' && isCase(s));
    expect(applySuggestion(next, stale as Suggestion)).toEqual(next);
  });

  it('3 and 4: nothing to offer, the wording is already sentence case', () => {
    expect(fill('3-year-in-review-photos').suggestions.filter(isCase)).toEqual([]);
    expect(fill('4-in-the-news').suggestions.filter(isCase)).toEqual([]);
  });

  it('5-webelos-dens-10-11: offers sentence case for the title, keeping Webelos and Den', () => {
    const { suggestions } = fill('5-webelos-dens-10-11');
    expect(brief(suggestions.filter(isCase))).toEqual([
      'title: Webelos Den 10 & Den 11 Upcoming Events -> Webelos Den 10 & Den 11 upcoming events',
    ]);
  });
});

describe('sentence case suggestions: which fields', () => {
  const run = (text: string) => [{ kind: 'text' as const, text, marks: [] }];
  const paths = (form: AnnouncementForm) =>
    suggestionsFor(form)
      .filter(isCase)
      .map((s) => s.path.join('.'));

  it('Message: the title and the button, not the label or the paragraphs', () => {
    const form: MessageForm = {
      layout: 'message',
      label: 'Big News',
      title: 'Big News Today',
      paragraphs: [run('Read This Now')],
      button: { text: 'Sign Up Here', url: 'https://example.org/' },
    };
    expect(paths(form)).toEqual(['title', 'button.text']);
  });

  it('Call to action: the title and the button', () => {
    const form: CallToActionForm = {
      layout: 'call-to-action',
      label: 'Big News',
      title: 'Big News Today',
      paragraph: run('Read This Now'),
      button: { text: 'Sign Up Here', url: 'https://example.org/' },
    };
    expect(paths(form)).toEqual(['title', 'button.text']);
  });

  it('Date list: the title and every section name, not subtitles, events, tags or notes', () => {
    const form: DateListForm = {
      layout: 'date-list',
      label: 'Big News',
      title: 'Big News Today',
      sections: [
        {
          name: 'Take Action Now',
          style: 'quiet',
          subtitle: 'Details To Come',
          rows: [
            {
              event: 'Den Meeting Night',
              url: '',
              tags: [{ text: 'In Person', strength: 'quiet' }],
              note: run('Bring Water'),
            },
          ],
        },
        { name: 'Coming soon', style: 'plain', subtitle: '', rows: [] },
        { name: 'Save The Date', style: 'plain', subtitle: '', rows: [] },
      ],
    };
    expect(paths(form)).toEqual(['title', 'sections.0.name', 'sections.2.name']);
  });

  it('Link list: the title only, not the link text or notes', () => {
    const form: LinkListForm = {
      layout: 'link-list',
      label: 'Big News',
      title: 'Big News Today',
      intro: run('Read This Now'),
      items: [{ text: 'Scouts Collect Bags Of Food', url: 'https://example.org/', note: 'A Note' }],
    };
    expect(paths(form)).toEqual(['title']);
  });

  it('Help wanted: the title, the ask title and both buttons, not the pill', () => {
    const form: HelpWantedForm = {
      layout: 'help-wanted',
      label: 'Big News',
      title: 'Big News Today',
      intro: run('Read This Now'),
      ask: {
        badge: 'Highest Need',
        title: 'Legal And Finance Help',
        paragraphs: [run('Read This Now')],
        button: { text: 'Email Us Now', url: 'mailto:a@example.org' },
      },
      outro: run('Read This Now'),
      secondary: { text: 'More Help Needed', url: 'https://example.org/' },
    };
    expect(paths(form)).toEqual(['title', 'ask.title', 'ask.button.text', 'secondary.text']);
  });

  it('offers nothing for an empty or blank field', () => {
    const form: MessageForm = {
      layout: 'message',
      label: '',
      title: ' ',
      paragraphs: [],
      button: { text: '', url: '' },
    };
    expect(suggestionsFor(form)).toEqual([]);
  });

  it('keeps the small fixes, and lists them first', () => {
    const form: MessageForm = {
      layout: 'message',
      label: '',
      title: 'Legal & Finance Help',
      paragraphs: [],
    };
    expect(suggestionsFor(form)).toEqual([
      { path: ['title'], message: 'Change "&" to "and".', from: ' & ', to: ' and ' },
      {
        path: ['title'],
        message: 'Use sentence case: "Legal & finance help".',
        from: 'Legal & Finance Help',
        to: 'Legal & finance help',
      },
    ]);
  });

  it('never changes the form it reads', () => {
    const { form } = fill('1-pack-calendar');
    const before = JSON.stringify(form);
    suggestionsFor(form);
    expect(JSON.stringify(form)).toBe(before);
  });

  it('follows an edit made by hand', () => {
    const { form } = fill('1-pack-calendar');
    const edited = setAt(form, ['sections', 4, 'name'], 'More Links Here');
    expect(brief(suggestionsFor(edited).filter(isCase))).toContain(
      'sections.4.name: More Links Here -> More links here',
    );
  });
});

describe('sentence case suggestions: only for text that looks like Title Case', () => {
  const OWNER_TITLE =
    'The First Presbyterian Church is having Scout Sunday on February 8th, 10am-11am.';
  const message = (title: string, button?: string): MessageForm => ({
    layout: 'message',
    label: '',
    title,
    paragraphs: [],
    ...(button === undefined ? {} : { button: { text: button, url: 'https://example.org/' } }),
  });
  const cased = (form: AnnouncementForm) => brief(suggestionsFor(form).filter(isCase));

  it('offers nothing for a sentence with names in it (owner, Scout Sunday)', () => {
    expect(cased(message(OWNER_TITLE))).toEqual([]);
  });

  it('offers nothing when one word of four or more letters is in lower case', () => {
    expect(cased(message('Join us for the Pinewood Derby'))).toEqual([]);
    expect(cased(message('Thanks to Ryan Meier for the photos'))).toEqual([]);
  });

  it('still offers it when only short words are in lower case', () => {
    expect(cased(message('Join Us at the Fair'))).toEqual([
      'title: Join Us at the Fair -> Join us at the fair',
    ]);
    expect(cased(message('Pack Calendar Update For December'))).toEqual([
      'title: Pack Calendar Update For December -> Pack calendar update for December',
    ]);
    expect(cased(message('Take Action Now'))).toEqual([
      'title: Take Action Now -> Take action now',
    ]);
  });

  it('follows the same rule for buttons, section names and the ask title', () => {
    expect(cased(message('', 'Sign Up Here'))).toEqual([
      'button.text: Sign Up Here -> Sign up here',
    ]);
    expect(cased(message('', 'Email Ryan about the Derby'))).toEqual([]);
    const dates: DateListForm = {
      layout: 'date-list',
      label: '',
      title: '',
      sections: [
        { name: 'Save The Date', style: 'plain', subtitle: '', rows: [] },
        { name: 'Events with Troop 80 this month', style: 'plain', subtitle: '', rows: [] },
      ],
    };
    expect(cased(dates)).toEqual(['sections.0.name: Save The Date -> Save the date']);
    const help: HelpWantedForm = {
      layout: 'help-wanted',
      label: '',
      title: '',
      intro: [],
      ask: {
        badge: '',
        title: 'Help Ryan with the Scout Sunday setup',
        paragraphs: [],
        button: { text: '', url: '' },
      },
      outro: [],
    };
    expect(cased(help)).toEqual([]);
  });

  it('offers nothing for a host name used as button text', () => {
    expect(cased(message('', 'signupgenius.com'))).toEqual([]);
  });
});
