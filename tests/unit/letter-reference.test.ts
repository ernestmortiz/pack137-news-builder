/**
 * Monthly reference issue (build spec 11.3 and 8.2). The draft file reproduces the November 2026
 * issue; rendering it must match the corrected reference file in text, links and section order,
 * and must not reproduce the defects listed in 8.2.
 *
 * Both documents go through the same extractor, so any difference is a difference in content,
 * not in how it is read. Known, documented differences are normalized in `fold` and in the
 * expected side; each one is listed in tests/fixtures/monthly/README.md.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintOutput } from '../../src/core/lint-output';
import { LETTER_HEADINGS, letterWords, readTimeText } from '../../src/core/letter';
import type { LetterForm } from '../../src/core/letter';
import { renderLetter } from '../../src/core/render-letter';

const dir = join(__dirname, '../fixtures/monthly');
const draft = JSON.parse(readFileSync(join(dir, '2026-11.draft.json'), 'utf8')) as LetterForm;
const referenceHtml = readFileSync(join(dir, '2026-11.corrected.html'), 'utf8');
const rendered = renderLetter(draft);

/** The read time the draft really has. The reference file says "an 8 minute read" (see README). */
const readTime = readTimeText(letterWords(draft));
const REFERENCE_READ_TIME = 'About an 8 minute read.';

// ---------------------------------------------------------------------------------------------
// Reading a document
// ---------------------------------------------------------------------------------------------

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

/** Whitespace, non-breaking and zero-width filler characters all become one space. */
/** Built from code points so this file holds no invisible characters. */
const FILLER = [0xa0, 0x200b, 0x200c, 0x200d, 0x34f, 0xfeff]
  .map((c) => String.fromCharCode(c))
  .join('');
const FILLER_RUN = new RegExp(`[\\s${FILLER}]+`, 'g');
const spaces = (s: string): string => s.replace(FILLER_RUN, ' ').trim();

/** Style attribute with all spaces removed and lower-cased, for matching. */
const styleOf = (el: Element): string =>
  (el.getAttribute('style') ?? '').replace(/\s+/g, '').toLowerCase();

const BLOCKS = new Set([
  'P',
  'DIV',
  'LI',
  'UL',
  'OL',
  'TABLE',
  'TR',
  'TD',
  'TH',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BR',
  'CENTER',
]);

/** Removes the hidden preview-text div (first element of the body) and returns its text. */
function takePreview(doc: Document): { el: Element | null; text: string } {
  const first = doc.body.firstElementChild;
  if (first && styleOf(first).includes('display:none')) {
    const text = spaces(first.textContent ?? '');
    first.remove();
    return { el: first, text };
  }
  return { el: null, text: '' };
}

/**
 * The visible text as lines: text between block boundaries, plus one `IMG <src>` line per image.
 * Inline elements do not break a line, so "<strong>Sun Dec 6:</strong> text" is one line.
 */
function visibleLines(doc: Document): string[] {
  const lines: string[] = [];
  let current = '';
  const flush = (): void => {
    const t = spaces(current);
    if (t !== '') lines.push(t);
    current = '';
  };
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) current += child.textContent ?? '';
      else if (child.nodeType === 1) {
        const el = child as Element;
        const tag = el.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
        if (tag === 'IMG') {
          flush();
          lines.push(`IMG ${el.getAttribute('src') ?? ''}`);
          continue;
        }
        const block = BLOCKS.has(tag);
        if (block) flush();
        walk(el);
        if (block) flush();
      }
    }
  };
  walk(doc.body);
  return lines;
}

/**
 * Case, the read time and a full stop right after a link are folded before comparing:
 * - badges are written in capitals in the reference and by text-transform in the renderer;
 * - the reference's read time is the author's guess, the draft's is computed;
 * - the form has no place for the full stop that follows a link in two sentences.
 */
function fold(line: string): string {
  return line
    .replace(REFERENCE_READ_TIME, readTime)
    .replace(/(Send them to us here|Read the TAPinto story)\./g, '$1')
    .toLowerCase();
}

// ---------------------------------------------------------------------------------------------
// Sections, outline, links
// ---------------------------------------------------------------------------------------------

type Section =
  | 'masthead'
  | 'read time line'
  | 'intro'
  | 'story'
  | 'closing'
  | 'photo ask'
  | 'around the pack'
  | 'coming up'
  | 'on the horizon'
  | 'feedback'
  | 'sign-off'
  | 'footer';

/** How a line opens each section after the masthead, in the order the sections must appear. */
const sectionStarts: [Section, (line: string) => boolean][] = [
  ['read time line', (l) => l.startsWith(fold(draft.summary))],
  ['intro', (l) => l === fold(draft.greeting)],
  ['story', (l) => l === fold(draft.story.title)],
  ['closing', (l) => l === fold(LETTER_HEADINGS.closing)],
  ['photo ask', (l) => l.startsWith(fold(draft.photoAsk.text.slice(0, 16)))],
  ['around the pack', (l) => l === fold(LETTER_HEADINGS.around)],
  ['coming up', (l) => l === 'coming up'],
  ['on the horizon', (l) => l === fold(LETTER_HEADINGS.horizon)],
  ['feedback', (l) => l.startsWith(fold(draft.feedback.question.slice(0, 14)))],
  ['sign-off', (l) => l === fold(draft.signOff)],
  ['footer', (l) => l.startsWith('more from the pack')],
];

/** Badge texts of the contributor blocks, as the reference writes them. */
const badgeLabels = draft.story.blocks.flatMap((b) =>
  b.kind === 'contributor' ? [b.role === '' ? b.name : `${b.name} · ${b.role}`] : [],
);
const statValues = draft.story.blocks.flatMap((b) =>
  b.kind === 'stats' ? b.stats.map((s) => s.value) : [],
);
const sidebarTitles = draft.story.blocks.flatMap((b) => (b.kind === 'sidebar' ? [b.title] : []));

interface Reading {
  /** Section name and the folded text of that section, in order. */
  sections: { name: Section; text: string }[];
  /** Section starts, story blocks and images in order. */
  outline: string[];
  /** (visible text, href) of every link in order. */
  links: string[];
}

function read(html: string): Reading {
  const doc = parse(html);
  takePreview(doc);
  const lines = visibleLines(doc);
  const sections: Reading['sections'] = [];
  const outline: string[] = [];
  const badges = new Set(badgeLabels.map(fold));
  const stats = new Set(statValues.map(fold));
  const sidebars = new Set(sidebarTitles.map(fold));
  let name: Section = 'masthead';
  let text: string[] = [];
  let next = 0;
  outline.push('section: masthead');
  for (const raw of lines) {
    const line = raw.startsWith('IMG ') ? raw : fold(raw);
    const start = sectionStarts[next];
    if (start && start[1](line)) {
      sections.push({ name, text: text.join(' ') });
      name = start[0];
      text = [];
      next += 1;
      outline.push(`section: ${name}`);
    }
    if (line.startsWith('IMG ')) outline.push(line.toLowerCase().replace('img ', 'image: '));
    else {
      text.push(line);
      if (badges.has(line)) outline.push(`badge: ${line}`);
      else if (stats.has(line)) outline.push(`stat: ${line}`);
      else if (sidebars.has(line)) outline.push(`sidebar box: ${line}`);
    }
  }
  sections.push({ name, text: text.join(' ') });
  const links = Array.from(doc.querySelectorAll('a[href]')).map(
    (a) => `${spaces(a.textContent ?? '')} -> ${a.getAttribute('href') ?? ''}`,
  );
  return { sections, outline, links };
}

// ---------------------------------------------------------------------------------------------
// Readable diffs
// ---------------------------------------------------------------------------------------------

/** Where two strings first differ, with a window of context on each side. */
function stringDiff(expected: string, actual: string): string {
  let i = 0;
  while (i < expected.length && i < actual.length && expected[i] === actual[i]) i++;
  const from = Math.max(0, i - 40);
  const show = (s: string): string => JSON.stringify(s.slice(from, i + 60));
  return (
    `first difference at character ${i}\n` +
    `  expected ...${show(expected)}\n` +
    `  actual   ...${show(actual)}`
  );
}

/** Fails with the first mismatch between two ordered lists, showing a few entries around it. */
function expectSameList(what: string, expected: string[], actual: string[]): void {
  const n = Math.max(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    if (expected[i] === actual[i]) continue;
    const around = (list: string[]): string =>
      list
        .slice(Math.max(0, i - 2), i + 3)
        .map((v, k) => `    ${Math.max(0, i - 2) + k}: ${v}`)
        .join('\n');
    throw new Error(
      `${what}: first mismatch at entry ${i} (expected ${expected.length} entries, got ${actual.length})\n` +
        `  expected ${JSON.stringify(expected[i] ?? '(nothing)')}\n` +
        `  actual   ${JSON.stringify(actual[i] ?? '(nothing)')}\n` +
        `  expected around:\n${around(expected)}\n  actual around:\n${around(actual)}`,
    );
  }
}

function expectSameText(what: string, expected: string, actual: string): void {
  if (expected !== actual) throw new Error(`${what}: ${stringDiff(expected, actual)}`);
}

// ---------------------------------------------------------------------------------------------
// The reference test
// ---------------------------------------------------------------------------------------------

const expected = read(referenceHtml);
const actual = read(rendered);

describe('monthly reference issue (spec 11.3): November 2026', () => {
  it('has a draft that reads as the reference does (guards the helpers themselves)', () => {
    // If these fail the extractor or the draft is wrong, not the renderer.
    expect(expected.sections.map((s) => s.name)).toEqual([
      'masthead',
      ...sectionStarts.map(([n]) => n),
    ]);
    expect(expected.links).toHaveLength(13);
    expect(expected.outline.filter((o) => o.startsWith('badge:'))).toHaveLength(badgeLabels.length);
    expect(expected.outline.filter((o) => o.startsWith('image:'))).toHaveLength(8);
  });

  it('renders something', () => {
    expect(rendered.length).toBeGreaterThan(1000);
  });

  it('keeps the section order: masthead to footer', () => {
    expectSameList(
      'section order',
      expected.sections.map((s) => s.name),
      actual.sections.map((s) => s.name),
    );
  });

  it('keeps the outline: sections, story blocks and photos in order', () => {
    expectSameList('outline', expected.outline, actual.outline);
  });

  for (const exp of expected.sections) {
    it(`matches the visible text of the ${exp.name} section`, () => {
      const got = actual.sections.find((s) => s.name === exp.name);
      expect(got, `the ${exp.name} section is missing from the output`).toBeDefined();
      expectSameText(`${exp.name} text`, exp.text, got?.text ?? '');
    });
  }

  it('has the same links in the same order, as (visible text, href) pairs', () => {
    expectSameList('links', expected.links, actual.links);
  });

  it('starts with a hidden preview div holding the summary and the read time', () => {
    const doc = parse(rendered);
    const first = doc.body.firstElementChild;
    expect(first?.tagName, 'the first element must be the preview div').toBe('DIV');
    expect(styleOf(first as Element)).toContain('display:none');
    const text = spaces(first?.textContent ?? '');
    expect(text.startsWith(`${draft.summary} ${readTime}`)).toBe(true);
    // The reference says the same thing, with its own read time.
    const ref = takePreview(parse(referenceHtml));
    expect(ref.text.startsWith(`${draft.summary} ${REFERENCE_READ_TIME}`)).toBe(true);
  });

  it('puts the same read time in the summary line and the preview text', () => {
    expect(actual.sections.find((s) => s.name === 'read time line')?.text).toContain(
      readTime.toLowerCase(),
    );
  });

  it('passes the output linter in monthly mode', () => {
    expect(lintOutput(rendered, { monthly: true })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Defect regressions (spec 8.2)
// ---------------------------------------------------------------------------------------------

describe('defects in the November file that the renderer must not reproduce (spec 8.2)', () => {
  const doc = parse(rendered);
  const compact = rendered.replace(/\s+/g, '').toLowerCase();

  it('the original file really has the defects (sanity check on the fixture)', () => {
    const original = readFileSync(join(dir, '2026-11.original.html'), 'utf8');
    expect(original).toContain('44%');
    expect(original).toContain('isPasted');
  });

  it('puts the card in a table at width 100%, max-width 600px, centered', () => {
    const card = Array.from(doc.querySelectorAll('table')).find((t) =>
      styleOf(t).includes('max-width:600px'),
    );
    expect(card, 'no table with max-width:600px').toBeDefined();
    const style = styleOf(card as Element);
    expect(style).toMatch(/(^|;)width:100%/);
    expect(style).toMatch(/margin:0auto/);
  });

  it('has no width: 44% and no calc(', () => {
    expect(compact).not.toContain('width:44%');
    expect(compact).not.toContain('calc(');
    expect(compact).not.toContain('margin-right');
  });

  it('gives every link an absolute https, http or mailto address', () => {
    const hrefs = Array.from(doc.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs).toHaveLength(13);
    for (const href of hrefs) expect(href).toMatch(/^(https?:\/\/|mailto:)/);
  });

  it('writes the Google Meet link as https://meet.google.com/vgn-rwmf-fmz', () => {
    const meet = Array.from(doc.querySelectorAll('a')).filter((a) =>
      (a.getAttribute('href') ?? '').includes('meet.google.com'),
    );
    expect(meet).toHaveLength(1);
    expect(meet[0]?.getAttribute('href')).toBe('https://meet.google.com/vgn-rwmf-fmz');
  });

  it('gives every photo non-empty alt text and a max-width', () => {
    const images = Array.from(doc.querySelectorAll('img'));
    // The logo plus six story photos plus the sidebar photo.
    expect(images).toHaveLength(8);
    for (const img of images) {
      const where = img.getAttribute('src') ?? '(no src)';
      expect(spaces(img.getAttribute('alt') ?? ''), `alt of ${where}`).not.toBe('');
      expect(styleOf(img), `max-width of ${where}`).toContain('max-width:');
      expect(styleOf(img), `max-width:100% or a px cap of ${where}`).toMatch(
        /max-width:(100%|\d+px)/,
      );
    }
  });

  it('keeps the story photo widths from the draft and never above 552px', () => {
    const photoWidths = draft.story.blocks.flatMap((b) =>
      b.kind === 'photo' ? [b.photo.width] : b.kind === 'sidebar' && b.photo ? [b.photo.width] : [],
    );
    for (const w of photoWidths) expect(w).toBeLessThanOrEqual(552);
    const bySrc = new Map(
      Array.from(doc.querySelectorAll('img')).map((i) => [i.getAttribute('src'), i] as const),
    );
    for (const b of draft.story.blocks) {
      const photo = b.kind === 'photo' ? b.photo : b.kind === 'sidebar' ? b.photo : undefined;
      if (!photo) continue;
      const img = bySrc.get(photo.src);
      expect(img, `image ${photo.src} missing`).toBeDefined();
      expect(img?.getAttribute('alt')).toBe(photo.alt);
    }
  });

  it('has no class or id attributes, no isPasted and no data attributes', () => {
    expect(doc.querySelectorAll('[class]')).toHaveLength(0);
    expect(doc.querySelectorAll('[id]')).toHaveLength(0);
    expect(rendered).not.toMatch(/isPasted/i);
    const withData = Array.from(doc.querySelectorAll('*')).filter((el) =>
      el.getAttributeNames().some((n) => n.startsWith('data-')),
    );
    expect(withData).toHaveLength(0);
  });

  it('has no noscript block, style block or script', () => {
    expect(rendered).not.toMatch(/<noscript/i);
    // The Outlook-only style inside a conditional comment is allowed; a real style element is not.
    expect(doc.querySelectorAll('style, script, noscript')).toHaveLength(0);
    expect(rendered).not.toMatch(/<script/i);
  });

  it('gives every badge 8px corners and none 4px', () => {
    const labels = [...badgeLabels, 'Coming up'].map((l) => spaces(l).toLowerCase());
    const leaves = Array.from(doc.querySelectorAll('*')).filter((el) =>
      labels.includes(spaces(el.textContent ?? '').toLowerCase()),
    );
    expect(leaves.length, 'badges not found').toBeGreaterThanOrEqual(labels.length);
    for (const label of labels) {
      // A badge sits on a navy fill (itself or a parent cell); a bold name in the closing list
      // has the same text but no fill. Nested elements share the text, so take the innermost.
      const onNavy = (el: Element): boolean => {
        for (let e: Element | null = el, n = 0; e && n < 3; e = e.parentElement, n++)
          if (styleOf(e).includes('background-color:#151b4d')) return true;
        return false;
      };
      const holder = leaves
        .filter((el) => spaces(el.textContent ?? '').toLowerCase() === label && onNavy(el))
        .pop();
      expect(holder, `badge "${label}" not found`).toBeDefined();
      // The badge's own box is the element or its nearest ancestor that sets a radius.
      let box: Element | null = holder as Element;
      while (box && !styleOf(box).includes('border-radius:')) box = box.parentElement;
      expect(box, `badge "${label}" has no border-radius`).not.toBeNull();
      expect(styleOf(box as Element), `badge "${label}"`).toContain('border-radius:8px');
    }
    expect(compact).not.toContain('border-radius:4px');
  });
});
