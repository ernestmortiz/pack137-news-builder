/**
 * Fill stage (build spec, sections 7.2 to 7.4): fillForm, switchLayout and applySuggestion.
 * The weekly fixtures are the five real pastes. Their form.json files hold the owner's final
 * wording, so only what the tool can work out by itself is asserted here (see SOURCES.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applySuggestion,
  emptyForm,
  fillForm,
  switchLayout,
  type FillOptions,
  type FillResult,
} from '../../src/core/fill';
import type {
  AnnouncementForm,
  DateListForm,
  HelpWantedForm,
  LinkListForm,
  MessageForm,
} from '../../src/core/forms';
import { dateLabel } from '../../src/core/helpers/dates';
import { formFields, getAt, hasPath } from '../../src/core/helpers/paths';
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
const EM_DASH = String.fromCharCode(0x2014);

const input = (name: string) => readFileSync(join(DIR, `${name}.input.html`), 'utf8');
const golden = (name: string) =>
  JSON.parse(readFileSync(join(DIR, `${name}.form.json`), 'utf8')) as AnnouncementForm;
const fill = (name: string, layout?: Layout): FillResult => {
  const parsed = parse(input(name));
  return fillForm(parsed, layout ?? parsed.suggestion.layout, OPTIONS);
};
const fillHtml = (html: string, layout: Layout) => fillForm(parse(html), layout, OPTIONS);
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Every piece of text a form shows, and every link. Dates read as "Sat Nov 21". */
function formText(form: AnnouncementForm): { texts: string[]; urls: string[] } {
  const texts: string[] = [];
  const urls: string[] = [];
  for (const f of formFields(form)) {
    if (f.kind === 'text') texts.push(f.value);
    else if (f.kind === 'url') urls.push(f.value);
    else
      for (const run of f.value)
        if (run.kind === 'text') {
          texts.push(run.text);
          if (run.href !== undefined) urls.push(run.href);
        }
  }
  if (form.layout === 'date-list')
    for (const s of form.sections) for (const r of s.rows) texts.push(dateLabel(r.date));
  return {
    texts: texts.map(squash).filter((t) => t !== ''),
    urls: urls.filter((u) => u.trim() !== ''),
  };
}

function expectSound(result: FillResult): void {
  for (const check of result.checks) {
    expect(hasPath(result.form, check.path), `check ${check.path.join('.')}`).toBe(true);
    expect(check.message).not.toContain(EM_DASH);
    expect(check.message).toMatch(/^[A-Z"][^\n]*[.]$/);
  }
  for (const s of result.suggestions) {
    expect(hasPath(result.form, s.path), `suggestion ${s.path.join('.')}`).toBe(true);
    expect(s.message).not.toContain(EM_DASH);
    const applied = applySuggestion(result.form, s);
    expect(applied).not.toEqual(result.form);
  }
}

describe('fillForm on the weekly fixtures', () => {
  it.each(FIXTURES)('%s: fills the suggested layout and every path resolves', (name) => {
    const result = fill(name);
    expect(result.form.layout).toBe(golden(name).layout);
    expectSound(result);
  });

  it.each(FIXTURES)('%s: fills every layout without losing pasted words', (name) => {
    const parsed = parse(input(name));
    const words = (text: string) =>
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
    const pasted = words(formText(fillForm(parsed, 'message', OPTIONS).form).texts.join(' '));
    expect(pasted.length).toBeGreaterThan(5);
    for (const layout of LAYOUTS) {
      const result = fillForm(parsed, layout, OPTIONS);
      expect(result.form.layout).toBe(layout);
      expectSound(result);
      if (layout === 'date-list') continue; // dates become date fields there, checked below
      // Words the tool removed on purpose (a site name) are named in the check beside the field.
      const told = result.checks.filter((c) => c.kind === 'title-cleanup').map((c) => c.message);
      const have = new Set(words([...formText(result.form).texts, ...told].join(' ')));
      for (const word of pasted) expect(have.has(word), `${layout}: ${word}`).toBe(true);
    }
  });

  it('does not change the parsed model', () => {
    const parsed = parse(input('1-pack-calendar'));
    const before = JSON.stringify(parsed);
    for (const layout of LAYOUTS) fillForm(parsed, layout, OPTIONS);
    expect(JSON.stringify(parsed)).toBe(before);
  });

  describe('1 pack calendar', () => {
    const result = fill('1-pack-calendar');
    const form = result.form as DateListForm;
    const want = golden('1-pack-calendar') as DateListForm;

    it('builds the five sections', () => {
      expect(form.sections.map((s) => s.name)).toEqual([
        'Take Action Now',
        'Coming Soon',
        'Save the Date',
        'On going',
        'References',
      ]);
      expect(form.sections[2]).toMatchObject({ style: 'quiet', subtitle: 'Details to come.' });
      expect(form.sections.map((s) => s.rows.length)).toEqual(
        want.sections.map((s) => s.rows.length),
      );
    });

    it('gets every date, link and tag right', () => {
      form.sections.forEach((section, si) => {
        section.rows.forEach((row, ri) => {
          const wanted = want.sections[si]?.rows[ri];
          expect(row.date, `${si}.${ri}`).toEqual(wanted?.date);
          expect(row.url, `${si}.${ri}`).toBe(wanted?.url);
          expect(row.tags, `${si}.${ri}`).toEqual(wanted?.tags);
        });
      });
    });

    it('gets the event names right, hand edits aside', () => {
      const events = form.sections.flatMap((s) => s.rows.map((r) => r.event));
      const wanted = want.sections.flatMap((s) => s.rows.map((r) => r.event));
      const handEdits: Record<string, string> = {
        'Pinewood Derby First-Time Racer Overview': 'Pinewood Derby First Time Racer Overview',
        'Pinewood Derby Weigh-In': 'Pinewood Derby Weigh In',
        'Blue and Gold Banquet': 'Blue & Gold Banquet',
        'Popcorn Storefront Sales': 'Popcorn Store Front Sales',
      };
      expect(events).toEqual(wanted.map((e) => handEdits[e] ?? e));
    });

    it('turns contacts into notes and marks them', () => {
      expect(form.sections[3]?.rows.map((r) => r.note)).toEqual(
        want.sections[3]?.rows.map((r) => r.note),
      );
      expect(result.checks.filter((c) => c.kind === 'contact').map((c) => c.path)).toEqual([
        ['sections', 3, 'rows', 0, 'note'],
        ['sections', 3, 'rows', 1, 'note'],
      ]);
    });

    it('offers the shouted text as a note in sentence case', () => {
      expect(form.sections[0]?.rows[2]?.note).toEqual([
        { kind: 'text', text: 'Last chance for donations to toys for tots', marks: [] },
      ]);
      expect(result.checks).toContainEqual(
        expect.objectContaining({ kind: 'shouting', path: ['sections', 0, 'rows', 2, 'note'] }),
      );
    });

    it('marks every assumed year', () => {
      const assumed = result.checks.filter((c) => c.kind === 'year-assumed');
      expect(assumed).toHaveLength(14);
      expect(assumed[0]?.path).toEqual(['sections', 0, 'rows', 0, 'date']);
      expect(assumed[3]?.message).toContain('2027');
    });

    it('asks for a label and a title', () => {
      expect(form.label).toBe('');
      expect(form.title).toBe('');
      expect(result.checks).toContainEqual(
        expect.objectContaining({ kind: 'unsure', path: ['label'] }),
      );
      expect(result.checks).toContainEqual(
        expect.objectContaining({ kind: 'unsure', path: ['title'] }),
      );
    });

    it('offers the small fixes without applying them', () => {
      expect(result.suggestions).toContainEqual(
        expect.objectContaining({ path: ['sections', 3, 'name'], from: 'On going', to: 'Ongoing' }),
      );
      expect(result.suggestions).toContainEqual(
        expect.objectContaining({
          path: ['sections', 2, 'rows', 2, 'event'],
          from: ' & ',
          to: ' and ',
        }),
      );
    });
  });

  describe('2 help needed', () => {
    const result = fill('2-help-needed');
    const form = result.form as HelpWantedForm;
    const want = golden('2-help-needed') as HelpWantedForm;

    it('finds the ask, its button and the secondary button', () => {
      expect(form.ask.badge).toBe('Highest need');
      expect(form.ask.title).toBe('Legal & Finance Help');
      expect(form.ask.paragraphs).toHaveLength(2);
      expect(form.ask.button).toEqual({
        text: "I'm interested",
        url: 'mailto:cranfordpack137@gmail.com?subject=HelpWithNonProfitFormation',
      });
      expect(form.secondary?.url).toBe(want.secondary?.url);
      expect(form.secondary?.text).toBe('Additional Help Needed');
    });

    it('keeps the intro with its links and warns about the manage link', () => {
      expect(formText(form).urls).toContain(
        'https://pack137.trooptrack.com/manage/troops/23117?tab=leadership',
      );
      expect(result.checks).toContainEqual(
        expect.objectContaining({ kind: 'manage-link', path: ['intro'] }),
      );
    });

    it('offers "and" for the ask title', () => {
      const s = result.suggestions.find((x) => x.path.join('.') === 'ask.title');
      expect(s).toBeDefined();
      if (s)
        expect((applySuggestion(form, s) as HelpWantedForm).ask.title).toBe(
          'Legal and Finance Help',
        );
    });
  });

  it('3 year in review: the paragraph and the link as the button', () => {
    const { form } = fill('3-year-in-review-photos');
    if (form.layout !== 'call-to-action') throw new Error('layout');
    expect(form.button).toEqual({
      text: 'Upload your submissions here',
      url: 'https://forms.gle/PvVux1W4764mSD6T7',
    });
    const text = form.paragraph.map((r) => (r.kind === 'text' ? r.text : ' ')).join('');
    expect(text).toBe(
      "It's never to soon to share your favorite photo memories for our pack Year-In-Review Poster Board.",
    );
  });

  describe('4 in the news', () => {
    const result = fill('4-in-the-news');
    const form = result.form as LinkListForm;
    const want = golden('4-in-the-news') as LinkListForm;

    it('gets the title, the image and the links right', () => {
      expect(form.title).toBe(want.title);
      expect(form.image).toEqual({ src: want.image?.src, alt: '' });
      expect(form.items.map((i) => i.url)).toEqual(want.items.map((i) => i.url));
      expect(form.items.map((i) => i.text)).toEqual([
        'Cranford Scouts Combine Tradition and Technology to Collect 1,098 Bags of Food',
        'Pack 137 Scouting For Food Thank You Letter',
        'A short history of Scouting for Food generosity in Cranford',
      ]);
    });

    it('adds a source note for well-known sites', () => {
      expect(form.items.map((i) => i.note)).toEqual([
        'TAPinto',
        'On Google Drive',
        'On Google Drive',
      ]);
    });

    it('marks the cleaned title and the missing picture description', () => {
      expect(result.checks).toContainEqual(
        expect.objectContaining({ kind: 'title-cleanup', path: ['items', 0, 'text'] }),
      );
      expect(result.checks).toContainEqual(
        expect.objectContaining({ kind: 'pasted-problem', path: ['image', 'alt'] }),
      );
    });
  });

  describe('5 webelos dens', () => {
    const result = fill('5-webelos-dens-10-11');
    const form = result.form as DateListForm;
    const rows = form.sections.flatMap((s) => s.rows);
    const want = (golden('5-webelos-dens-10-11') as DateListForm).sections.flatMap((s) => s.rows);

    it('uses the only heading as the title', () => {
      expect(form.title).toBe('Webelos Den 10 & Den 11 Upcoming Events');
      expect(form.sections.map((s) => s.name)).toEqual(['']);
    });

    it('gets the dates, events, links and tags right', () => {
      expect(rows.map((r) => ({ date: r.date, event: r.event, url: r.url, tags: r.tags }))).toEqual(
        want.map((r) => ({ date: r.date, event: r.event, url: r.url, tags: r.tags })),
      );
    });

    it('marks the struck date and the service with no link', () => {
      expect(rows[0]?.note).toEqual([
        { kind: 'text', text: 'Please read and see SignUpGenius.', marks: [] },
      ]);
      const at = ['sections', 0, 'rows', 0];
      expect(result.checks).toContainEqual(
        expect.objectContaining({ kind: 'rescheduled', path: [...at, 'date'] }),
      );
      expect(result.checks).toContainEqual(
        expect.objectContaining({ kind: 'service-no-link', path: [...at, 'note'] }),
      );
    });
  });
});

describe('fillForm rules', () => {
  it('reads paragraphs as rows when there is no list', () => {
    const { form } = fillHtml('<p>Dec 6 Pack Meeting</p><p>12/8 Hike TBD</p>', 'date-list');
    const rows = (form as DateListForm).sections.flatMap((s) => s.rows);
    expect(rows.map((r) => r.event)).toEqual(['Pack Meeting', 'Hike']);
    expect(rows[1]?.date?.start).toEqual({ year: 2026, month: 12, day: 8 });
    expect(rows[1]?.tags).toEqual([{ text: 'TBD', strength: 'quiet' }]);
  });

  it('does not mark a date whose year was written', () => {
    const { checks } = fillHtml(
      '<ul><li>Dec 6, 2026 Pack Meeting</li><li>Dec 8 Hike</li></ul>',
      'date-list',
    );
    expect(checks.filter((c) => c.kind === 'year-assumed').map((c) => c.path)).toEqual([
      ['sections', 0, 'rows', 1, 'date'],
    ]);
  });

  it('splits shouting off an event with no link', () => {
    const { form, checks } = fillHtml(
      '<ul><li>Dec 6 Pack Meeting BRING YOUR OWN CHAIR</li><li>Dec 8 Hike</li></ul>',
      'date-list',
    );
    const row = (form as DateListForm).sections[0]?.rows[0];
    expect(row?.event).toBe('Pack Meeting');
    expect(row?.note).toEqual([{ kind: 'text', text: 'Bring your own chair', marks: [] }]);
    expect(checks.some((c) => c.kind === 'shouting')).toBe(true);
  });

  it('keeps a line under a row as its note', () => {
    const { form } = fillHtml(
      '<ul><li>Dec 6 Pack Meeting<br>Bring a chair.</li></ul>',
      'date-list',
    );
    const row = (form as DateListForm).sections[0]?.rows[0];
    expect(row?.event).toBe('Pack Meeting');
    expect(row?.note).toEqual([{ kind: 'text', text: 'Bring a chair.', marks: [] }]);
  });

  it('warns about a manage link on a row', () => {
    const { checks } = fillHtml(
      '<ul><li>Dec 6 <a href="https://pack137.trooptrack.com/manage/events/1">Meeting</a></li><li>Dec 8 Hike</li></ul>',
      'date-list',
    );
    expect(checks).toContainEqual(
      expect.objectContaining({ kind: 'manage-link', path: ['sections', 0, 'rows', 0, 'url'] }),
    );
  });

  it('reports a pasted link with no destination', () => {
    const result = fillHtml('<p>Please <a>sign up here</a> by Friday.</p>', 'message');
    expect(result.checks).toContainEqual(
      expect.objectContaining({ kind: 'pasted-problem', path: ['paragraphs'] }),
    );
    expectSound(result);
  });

  it('makes a single standalone link the Message button', () => {
    const { form } = fillHtml(
      '<h2>Hello</h2><p>See you there.</p><p><a href="https://x.test/a">Sign up</a></p>',
      'message',
    );
    expect(form).toEqual({
      layout: 'message',
      label: '',
      title: 'Hello',
      paragraphs: [[{ kind: 'text', text: 'See you there.', marks: [] }]],
      button: { text: 'Sign up', url: 'https://x.test/a' },
    });
  });

  it('keeps a link inside a sentence where it is', () => {
    const { form } = fillHtml(
      '<p>Please <a href="https://x.test/a">sign up</a> by Friday.</p>',
      'message',
    );
    expect((form as MessageForm).button).toBeUndefined();
    expect(formText(form).urls).toEqual(['https://x.test/a']);
  });

  it('uses a short first line as the title', () => {
    const { form } = fillHtml(
      '<p>Thank you, families</p><p>The food drive was a success.</p>',
      'message',
    );
    expect(form.title).toBe('Thank you, families');
    expect((form as MessageForm).paragraphs).toHaveLength(1);
  });
});

describe('applySuggestion', () => {
  const { form, suggestions } = fill('1-pack-calendar');

  it('replaces the text and returns a new form', () => {
    const s = suggestions.find((x) => x.from === 'On going');
    if (!s) throw new Error('no suggestion');
    const before = JSON.stringify(form);
    const next = applySuggestion(form, s);
    expect(getAt(next, s.path)).toBe('Ongoing');
    expect(JSON.stringify(form)).toBe(before);
    expect(applySuggestion(next, s)).toEqual(next);
  });

  it('replaces inside rich text', () => {
    const message: MessageForm = {
      layout: 'message',
      label: '',
      title: '',
      paragraphs: [[{ kind: 'text', text: 'Blue & Gold', marks: ['strong'] }]],
    };
    const next = applySuggestion(message, {
      path: ['paragraphs', 0],
      message: 'Change "&" to "and".',
      from: ' & ',
      to: ' and ',
    });
    expect((next as MessageForm).paragraphs[0]).toEqual([
      { kind: 'text', text: 'Blue and Gold', marks: ['strong'] },
    ]);
  });

  it('is a no-op for a path that does not exist or is not text', () => {
    const s = { message: 'x', from: 'a', to: 'b' };
    expect(applySuggestion(form, { ...s, path: ['nope', 3] })).toEqual(form);
    expect(applySuggestion(form, { ...s, path: ['sections'] })).toEqual(form);
    expect(applySuggestion(form, { ...s, from: '', path: ['title'] })).toEqual(form);
  });
});

describe('switchLayout', () => {
  const message: MessageForm = {
    layout: 'message',
    label: 'Den news',
    title: 'A short note',
    paragraphs: [
      [
        { kind: 'text', text: 'Thank you for coming. See the ', marks: [] },
        { kind: 'text', text: 'photos', marks: ['strong'], href: 'https://x.test/photos' },
        { kind: 'text', text: ' and the ', marks: [] },
        { kind: 'text', text: 'sign-up sheet', marks: [], href: 'https://x.test/sheet' },
        { kind: 'text', text: '.', marks: [] },
      ],
      [{ kind: 'text', text: 'See you next month.', marks: ['em'] }],
    ],
    button: { text: 'Open the calendar', url: 'https://x.test/calendar' },
  };
  const sources: [string, AnnouncementForm][] = [
    ['message', message],
    ...FIXTURES.map((name): [string, AnnouncementForm] => [name, golden(name)]),
  ];

  for (const [name, source] of sources) {
    for (const target of LAYOUTS.filter((l) => l !== source.layout)) {
      it(`${name} (${source.layout}) to ${target} keeps every text run and link`, () => {
        const before = JSON.stringify(source);
        const next = switchLayout(source, target);
        expect(JSON.stringify(source)).toBe(before);
        expect(next.layout).toBe(target);
        expect(next.label).toBe(source.label);
        expect(next.title).toBe(source.title);

        const have = formText(next);
        const all = squash(have.texts.join(' '));
        // The default pill text of Help wanted and an image description have no field elsewhere.
        const skip = new Set<string>();
        if (source.layout === 'help-wanted') skip.add(source.ask.badge);
        if (source.layout === 'link-list' && source.image) skip.add(source.image.alt);
        for (const text of formText(source).texts)
          if (!skip.has(text)) expect(all, text).toContain(text);
        const image = source.layout === 'link-list' ? source.image?.src : undefined;
        for (const url of formText(source).urls)
          if (url !== image) expect(have.urls, url).toContain(url);
      });
    }
  }

  it('covers every pair of layouts', () => {
    expect(new Set(sources.map(([, f]) => f.layout)).size).toBe(5);
  });

  it('returns the same form for the same layout', () => {
    expect(switchLayout(message, 'message')).toEqual(message);
  });

  it('keeps rows and the image between Date list and Link list', () => {
    const links = golden('4-in-the-news') as LinkListForm;
    const dates = switchLayout(links, 'date-list') as DateListForm;
    expect(
      dates.sections
        .flatMap((s) => s.rows)
        .slice(1)
        .map((r) => r.url),
    ).toEqual(links.items.map((i) => i.url));
    // Date list has no intro field, so the intro travels as the first row.
    const back = switchLayout(dates, 'link-list') as LinkListForm;
    expect(back.items.slice(1)).toEqual(links.items);
    expect(back.items[0]?.text).toBe(
      links.intro.map((r) => (r.kind === 'text' ? r.text : '')).join(''),
    );
    expect(back.image).toBeUndefined();
  });

  it('keeps a struck date as struck text', () => {
    const next = switchLayout(golden('5-webelos-dens-10-11'), 'message') as MessageForm;
    expect(next.paragraphs[0]?.[0]).toEqual({
      kind: 'text',
      text: 'Tue Nov 24',
      marks: ['strike'],
    });
  });

  it('gives a blank form of the target layout for a blank form', () => {
    for (const from of LAYOUTS)
      for (const to of LAYOUTS) expect(switchLayout(emptyForm(from), to)).toEqual(emptyForm(to));
  });
});

describe('fillForm for a layout other than the suggestion', () => {
  it('reads a sentence with a link as a link item with the sentence as its note', () => {
    const { form } = fill('2-help-needed', 'link-list');
    const last = (form as LinkListForm).items.at(-1);
    expect(last).toMatchObject({
      text: 'Additional Help Needed',
      note: 'See our list of Additional Help Needed.',
    });
  });

  it('reads the help paste as rows without arrows or stray punctuation', () => {
    const { form } = fill('2-help-needed', 'date-list');
    const rows = (form as DateListForm).sections.flatMap((s) => s.rows);
    expect(rows.map((r) => r.event)).toContain("I'm interested");
    expect(rows.at(-1)?.note).toEqual([]);
  });

  it('keeps the date and tag words as the note of a link item', () => {
    const { form } = fill('5-webelos-dens-10-11', 'link-list');
    expect((form as LinkListForm).items.map((i) => i.note).slice(1)).toEqual([
      'Dec 1 Virtual',
      'Dec 8',
    ]);
  });
});

describe('fillForm on an empty paste', () => {
  it.each(LAYOUTS)('%s: gives the blank form and asks for a label and a title', (layout) => {
    const result = fillHtml('', layout);
    expect(result.form).toEqual(emptyForm(layout));
    expect(result.checks.map((c) => c.path)).toEqual([['label'], ['title']]);
    expect(result.suggestions).toEqual([]);
  });
});
