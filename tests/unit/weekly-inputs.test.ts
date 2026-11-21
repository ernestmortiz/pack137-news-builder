/**
 * Golden inputs, Phase 1. The five real TroopTrack pastes in tests/fixtures/weekly are run
 * through `parse` and the content model is checked against what the approved output needs.
 * There is no renderer yet, so these tests check that nothing the approved output uses was lost.
 * Wording that the owner edited by hand is asserted in its ORIGINAL form (see SOURCES.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Block, Inline, ListBlock } from '../../src/core/model';
import { parse, type ParseResult } from '../../src/core/pipeline';

const DIR = join(__dirname, '..', 'fixtures', 'weekly');
const read = (name: string, kind: 'input' | 'expected') =>
  readFileSync(join(DIR, `${name}.${kind}.html`), 'utf8');

function textOf(runs: Inline[]): string {
  return runs.map((r) => (r.kind === 'text' ? r.text : ' ')).join('');
}
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

function lists(blocks: Block[]): ListBlock[] {
  return blocks.flatMap((b) =>
    b.type === 'list' ? [b, ...b.items.flatMap((i) => lists(i.children))] : [],
  );
}

/** Every inline run list in the model: headings, paragraphs and list items. */
function allRunLists(blocks: Block[]): Inline[][] {
  const out: Inline[][] = [];
  for (const b of blocks) {
    if (b.type === 'heading' || b.type === 'paragraph') out.push(b.runs);
    if (b.type === 'list') {
      for (const i of b.items) {
        out.push(i.runs);
        out.push(...allRunLists(i.children));
      }
    }
  }
  return out;
}

const modelText = (r: ParseResult) => squash(allRunLists(r.model.blocks).map(textOf).join(' '));

function modelHrefs(r: ParseResult): string[] {
  const out: string[] = [];
  for (const b of r.model.blocks) if (b.type === 'image' && b.href !== undefined) out.push(b.href);
  for (const runs of allRunLists(r.model.blocks))
    for (const run of runs) if (run.kind === 'text' && run.href !== undefined) out.push(run.href);
  return out;
}

/** Every string the model carries, for the leak check. */
function modelStrings(r: ParseResult): string[] {
  const out: string[] = [];
  for (const runs of allRunLists(r.model.blocks)) {
    for (const run of runs) {
      if (run.kind === 'text') {
        out.push(run.text);
        if (run.href !== undefined) out.push(run.href);
      }
    }
  }
  for (const b of r.model.blocks) {
    if (b.type === 'image') out.push(b.src, b.alt, b.href ?? '');
  }
  for (const i of r.issues) out.push(i.message, i.detail ?? '');
  return out;
}

function hrefsIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => (m[1] ?? '').replace(/&amp;/g, '&'));
}

interface Fixture {
  name: string;
  layout: string;
  /** Expected hrefs that SOURCES.md records as changed by hand, so they are not expected. */
  editedHrefs: string[];
  headings: string[];
  /** Item or link text present in the approved output, in original wording. */
  texts: [label: string, text: string][];
  /** List items that must still start with this text. */
  itemStarts: string[];
}

const FIXTURES: Fixture[] = [
  {
    name: '1-pack-calendar',
    layout: 'date-list',
    editedHrefs: [],
    headings: [
      'Take Action Now',
      'Coming Soon',
      'Save the Date (details to come)',
      'On going',
      'References',
    ],
    texts: [
      ['Parent Planning Meeting', 'Parent Planning Meeting'],
      ['Pinewood Derby Planning Meeting', 'Pinewood Derby Planning Meeting'],
      ['Pack Meeting', 'Pack Meeting'],
      ['Please RSVP', 'Please RSVP!'],
      ['Toys for Tots note', 'LAST CHANCE FOR DONATIONS TO TOYS FOR TOTS'],
      ['First Time Racer In Person', 'Pinewood Derby First Time Racer Overview (In Person)'],
      ['First Time Racer Virtual', 'Pinewood Derby First Time Racer Overview (Virtual)'],
      ['Build Workshop', 'Pinewood Derby Build Workshop'],
      ['Weigh In (original wording)', 'Pinewood Derby Weigh In'],
      ['Race Day', 'Pinewood Derby Race Day'],
      ['Rock Climbing and TBD', 'Rock Climbing TBD'],
      ['Scout Sunday', 'Scout Sunday'],
      ['Blue & Gold (original wording)', 'Blue & Gold Banquet'],
      ['Overnight Trip', 'Pack Overnight Trip'],
      ['Snow Tubing', 'Snow Tubing'],
      ['Popcorn link text', 'Popcorn Store Front Sales'],
      ['Popcorn contact', '- Jen and Tess'],
      ['Derby info link text', 'Pinewood Derby 2027 Info'],
      ['Derby info contact', '- David Gannon'],
      ['Policies link text joined across spans', 'Pack Policies, Procedures and Guidelines'],
    ],
    itemStarts: [
      'Dec 6',
      'Dec 15',
      'Jan 3',
      'Jan 5',
      'Jan 6',
      'Jan 9',
      'Jan 22',
      'Jan 23',
      'Feb 6',
      'Feb 14',
      'Feb 20',
      'Feb 27-28',
      'March 6',
    ],
  },
  {
    name: '2-help-needed',
    layout: 'help-wanted',
    editedHrefs: ['mailto:cranfordpack137@gmail.com?subject=Help%20with%20nonprofit%20formation'],
    headings: ['Highest Need'],
    texts: [
      ['intro', 'The pack needs help with the following things.'],
      ['den leader line', 'reach out to your den leader or'],
      ['pack leadership link text', 'pack leadership'],
      ['email address text', 'cranfordpack137@gmail.com'],
      ['mention line', 'Mention which one you can help with.'],
      ['ask title (original wording)', 'Legal & Finance Help'],
      ['ask body', 'the formation of an 501(c)(3) non-profit'],
      ['consultation line', 'our Committee would love a brief consultation'],
      ['bold role list', 'attorney, CPA, or finance pro'],
      ['button text', "I'm interested"],
      ['additional help link text', 'Additional Help Needed'],
    ],
    itemStarts: [],
  },
  {
    name: '3-year-in-review-photos',
    layout: 'call-to-action',
    editedHrefs: [],
    headings: [],
    texts: [
      ['sentence (original wording)', "It's never to soon to share your favorite photo memories"],
      ['poster board name', 'Year-In-Review Poster Board'],
      ['link text', 'Upload your submissions here'],
    ],
    itemStarts: [],
  },
  {
    name: '4-in-the-news',
    layout: 'link-list',
    editedHrefs: [],
    headings: ['Read all about it!'],
    texts: [
      [
        'headline with site suffix (original wording)',
        'Cranford Scouts Combine Tradition and Technology to Collect 1,098 Bags of Food | Cranford, NJ News',
      ],
      ['thank you letter', 'Pack 137 Scouting For Food Thank You Letter'],
      ['history (original wording)', 'A short history of Scouting for Food generosity in Cranford'],
    ],
    itemStarts: [],
  },
  {
    name: '5-webelos-dens-10-11',
    layout: 'date-list',
    editedHrefs: [],
    headings: ['Webelos Den 10 & Den 11 Upcoming Events'],
    texts: [
      ['first meeting', 'Webelos Meeting'],
      ['rescheduled shout (original wording)', 'RESCHEDULED!!'],
      ['SignUpGenius note', 'Please read and see SignUpGenius.'],
      ['parent planning', 'Webelos Parent Planning Meeting'],
      ['Virtual tag text', 'Virtual'],
    ],
    itemStarts: ['Nov 24', 'Dec 1', 'Dec 8'],
  },
];

const parsed = new Map<string, ParseResult>();
for (const f of FIXTURES) parsed.set(f.name, parse(read(f.name, 'input')));
const resultOf = (name: string): ParseResult => {
  const r = parsed.get(name);
  if (r === undefined) throw new Error(`no result for ${name}`);
  return r;
};

describe.each(FIXTURES)('weekly input $name', (fx) => {
  const input = read(fx.name, 'input');
  const expected = read(fx.name, 'expected');

  it('parses without throwing and suggests the right layout', () => {
    expect(() => parse(input)).not.toThrow();
    expect(resultOf(fx.name).suggestion.layout).toBe(fx.layout);
  });

  describe('links', () => {
    const inModel = new Set(modelHrefs(resultOf(fx.name)));
    const approved = [...new Set(hrefsIn(expected))].filter((h) => !fx.editedHrefs.includes(h));
    const original = [...new Set(hrefsIn(input))];

    it.each(approved)('approved output href is in the model: %s', (href) => {
      expect(inModel.has(href)).toBe(true);
    });
    it.each(original)('input href is in the model: %s', (href) => {
      expect(inModel.has(href)).toBe(true);
    });
  });

  describe.runIf(fx.headings.length > 0)('headings', () => {
    const headings = resultOf(fx.name).model.blocks.flatMap((b) =>
      b.type === 'heading' ? [squash(textOf(b.runs))] : [],
    );
    it.each(fx.headings)('heading block: %s', (title) => {
      expect(headings).toContain(title);
    });
  });

  describe('text carried', () => {
    const text = modelText(resultOf(fx.name));
    it.each(fx.texts)('%s', (_label, wanted) => {
      expect(text).toContain(squash(wanted));
    });
  });

  describe.runIf(fx.itemStarts.length > 0)('date items', () => {
    const items = lists(resultOf(fx.name).model.blocks).flatMap((l) =>
      l.items.map((i) => squash(textOf(i.runs))),
    );
    it.each(fx.itemStarts.map((s) => [s]))('an item still starts with "%s"', (start) => {
      expect(items.some((t) => t.startsWith(`${start} `) || t === start)).toBe(true);
    });
  });

  it('leaks no class, id, style or data- text and no isPasted', () => {
    const joined = modelStrings(resultOf(fx.name)).join('\n');
    expect(joined).not.toMatch(/\bclass\s*=/i);
    expect(joined).not.toMatch(/\bid\s*=/i);
    expect(joined).not.toMatch(/\bstyle\s*=/i);
    expect(joined).not.toMatch(/data-/i);
    expect(joined).not.toMatch(/isPasted/);
    expect(joined).not.toMatch(/font-family|rgb\(|text-align/i);
    expect(joined).not.toMatch(/<\/?[a-z][^>]*>/i);
  });
});

describe('weekly input specifics', () => {
  it('2 help needed: the original mailto subject survives with its encoding', () => {
    const href = 'mailto:cranfordpack137@gmail.com?subject=HelpWithNonProfitFormation';
    expect(modelHrefs(resultOf('2-help-needed'))).toContain(href);
  });

  it('2 help needed: the intro mailto link has no subject', () => {
    expect(modelHrefs(resultOf('2-help-needed'))).toContain('mailto:cranfordpack137@gmail.com');
  });

  it('5 webelos: "Nov 24" carries the strike mark and the other dates do not', () => {
    const items = lists(resultOf('5-webelos-dens-10-11').model.blocks).flatMap((l) => l.items);
    const struck = (prefix: string) =>
      items
        .filter((i) => squash(textOf(i.runs)).startsWith(prefix))
        .flatMap((i) => i.runs)
        .some((r) => r.kind === 'text' && r.marks.includes('strike') && r.text.includes(prefix));
    expect(struck('Nov 24')).toBe(true);
    expect(struck('Dec 1')).toBe(false);
    expect(struck('Dec 8')).toBe(false);
  });

  it('4 in the news: the image keeps its src and width, and the missing alt is flagged', () => {
    const r = resultOf('4-in-the-news');
    const images = r.model.blocks.flatMap((b) => (b.type === 'image' ? [b] : []));
    expect(images).toHaveLength(1);
    expect(images[0]?.src).toBe('https://styles.trooptrack.com/uploads/1795131915582.png');
    expect(images[0]?.alt).toBe('');
    expect(images[0]?.width).toBe(130);
    expect(r.issues.map((i) => i.code)).toContain('image-no-alt');
  });

  it('4 in the news: the only issue is the missing alt text', () => {
    const codes = resultOf('4-in-the-news').issues.map((i) => i.code);
    expect(codes.every((c) => c === 'image-no-alt')).toBe(true);
  });

  it('1 pack calendar: the red and green colour text is kept as text, not colour', () => {
    const text = modelText(resultOf('1-pack-calendar'));
    expect(text).not.toMatch(/rgb|color/i);
  });
});
