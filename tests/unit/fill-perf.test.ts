/**
 * Time limits for the fill stage, the rich text markup and the renderer on hostile input.
 *
 * Each input below once took time that grew with the square of its length (a regex that rescans
 * the text from every position, or a loop that rescans it for every match), which froze the tab.
 * The inputs are sized at the 2 MB paste limit (MAX_PASTE_BYTES in src/ui/converter.ts), in one
 * list item, and every layout is filled, since the user may pick any of them.
 *
 * Only the time of the stage under test is measured. Parsing has its own limits in
 * sanitize.test.ts and hostile-input.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { fillForm, type FillOptions, type FillResult } from '../../src/core/fill';
import type {
  AnnouncementForm,
  DateListForm,
  LinkListForm,
  MessageForm,
} from '../../src/core/forms';
import { setAt } from '../../src/core/helpers/paths';
import { isShouting, shoutStart, toSentenceCase } from '../../src/core/helpers/shouting';
import { takeTags } from '../../src/core/helpers/tags';
import { sentence } from '../../src/core/helpers/text';
import type { Layout } from '../../src/core/model';
import { parse, type ParseResult } from '../../src/core/pipeline';
import { renderAnnouncement } from '../../src/core/render';
import { textToRich } from '../../src/core/rich-text';
import { cleanText } from '../../src/templates/components';
import { budget } from './budget';

/** The paste limit: the converter refuses anything larger. */
const PASTE_CAP = 2 * 1024 * 1024;
/** Every stage under test must finish a paste of that size within this many milliseconds. */
const LIMIT = 1500;
const OPTIONS: FillOptions = {
  today: { year: 2026, month: 11, day: 21 },
  programYearStartMonth: 9,
};
const LAYOUTS: Layout[] = ['message', 'call-to-action', 'link-list', 'date-list', 'help-wanted'];
const EM_DASH = String.fromCharCode(0x2014);
const NBSP = String.fromCharCode(0xa0);

/** `unit` repeated until the result is `length` characters long. */
function fill(unit: string, length: number): string {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

/** A list of three dated rows. The third holds the hostile text. */
function dateList(third: string): ParseResult {
  return parse(`<ul><li>Dec 6 Meeting</li><li>Dec 7 Hike</li><li>${third}</li></ul>`);
}

function timed<T>(run: () => T): { result: T; elapsed: number } {
  const started = performance.now();
  const result = run();
  return { result, elapsed: performance.now() - started };
}

/** Fills every layout from one parsed paste and checks each against the limit. */
function fillsEveryLayout(parsed: ParseResult, limit = LIMIT): Record<Layout, FillResult> {
  const out: Partial<Record<Layout, FillResult>> = {};
  for (const layout of LAYOUTS) {
    const { result, elapsed } = timed(() => fillForm(parsed, layout, OPTIONS));
    expect(elapsed, `fillForm as ${layout}`).toBeLessThan(budget(limit));
    out[layout] = result;
  }
  return out as Record<Layout, FillResult>;
}

function thirdRow(result: FillResult) {
  const row = (result.form as DateListForm).sections[0]?.rows[2];
  if (row === undefined) throw new Error('the third row is missing');
  return row;
}

describe('fill: time limits at the 2 MB paste limit', () => {
  it('takes a row that ends in half a million tag words (S1a)', () => {
    const parsed = dateList('Dec 8 x ' + fill('tbd ', PASTE_CAP));
    const filled = fillsEveryLayout(parsed);
    const row = thirdRow(filled['date-list']);
    expect(row.event).toBe('x');
    expect(row.tags).toEqual([{ text: 'TBD', strength: 'quiet' }]);
    expect(row.note).toEqual([]);
  });

  it('takes a row of every tag word in turn, in brackets and bare', () => {
    const unit = '(Virtual) in-person TBD! ( please  rsvp ). Rescheduled ';
    const filled = fillsEveryLayout(
      dateList('Dec 8 Hike ' + unit.repeat(Math.floor(PASTE_CAP / unit.length))),
    );
    const row = thirdRow(filled['date-list']);
    expect(row.event).toBe('Hike');
    expect(row.tags.map((t) => t.text).sort()).toEqual([
      'In person',
      'Please RSVP',
      'Rescheduled',
      'TBD',
      'Virtual',
    ]);
  });

  it('takes a row that starts with half a million strong tags', () => {
    const filled = fillsEveryLayout(dateList('Dec 8 ' + 'RSVP! '.repeat(PASTE_CAP / 6) + 'Hike'));
    const row = thirdRow(filled['date-list']);
    expect(row.event).toBe('Hike');
    expect(row.tags).toEqual([{ text: 'Please RSVP', strength: 'strong' }]);
  });

  it('takes a long run of commas before a tag (S1b)', () => {
    const filled = fillsEveryLayout(dateList('Dec 8 a' + ','.repeat(PASTE_CAP) + 'b Virtual'));
    const row = thirdRow(filled['date-list']);
    expect(row.event).toBe('a' + ','.repeat(PASTE_CAP) + 'b');
    expect(row.tags).toEqual([{ text: 'Virtual', strength: 'quiet' }]);
  });

  it('takes a long run of commas between the event and a tag', () => {
    const filled = fillsEveryLayout(dateList('Dec 8 a' + ', '.repeat(PASTE_CAP / 2) + 'Virtual'));
    const row = thirdRow(filled['date-list']);
    expect(row.event).toBe('a');
    expect(row.tags).toEqual([{ text: 'Virtual', strength: 'quiet' }]);
  });

  it('takes one very long word of digits (S1c)', () => {
    const filled = fillsEveryLayout(dateList('Dec 8 a' + '1'.repeat(PASTE_CAP) + 'b'));
    expect(thirdRow(filled['date-list']).event).toBe('a' + '1'.repeat(PASTE_CAP) + 'b');
  });

  it('takes one very long shouted word of digits and turns it to sentence case (S1c)', () => {
    const word = 'A' + '1'.repeat(PASTE_CAP) + 'B';
    const filled = fillsEveryLayout(dateList(`Dec 8 SIGN UP NOW ${word} !!`));
    const row = thirdRow(filled['date-list']);
    expect(row.event).toBe(`Sign up now a${'1'.repeat(PASTE_CAP)}b !`);
  });

  it('takes a link with a long run of commas beside it (S1d)', () => {
    const half = PASTE_CAP / 2;
    const link = `<a href="https://example.org/">${'x'.repeat(half + 8)}</a>`;
    const parsed = parse(`<ul><li>${link} a${','.repeat(half)}b</li></ul>`);
    const filled = fillsEveryLayout(parsed);
    const item = (filled['link-list'].form as LinkListForm).items[0];
    expect(item?.text).toBe('x'.repeat(half + 8));
    expect(item?.note).toBe('a' + ','.repeat(half) + 'b');
  });
});

describe('helpers: time limits on text of the paste limit', () => {
  it('takeTags gives the same answer as before on small rows', () => {
    const take = (text: string) => {
      const t = takeTags(text);
      return [t.tags.map((x) => x.text).join('+'), text.slice(t.start, t.end)];
    };
    expect(take('Den meeting (Virtual)')).toEqual(['Virtual', 'Den meeting']);
    expect(take('Den meeting - in person, TBD!')).toEqual(['In person+TBD', 'Den meeting']);
    expect(take('RSVP: Blue and Gold')).toEqual(['Please RSVP', 'Blue and Gold']);
    expect(take('Please RSVP')).toEqual(['Please RSVP', '']);
    expect(take('xplease rsvp')).toEqual(['Please RSVP', 'xplease']);
    expect(take('rsvp:tbd')).toEqual(['Please RSVP+TBD', '']);
    expect(take('Hike(tbd)')).toEqual(['', 'Hike(tbd)']);
    expect(take('Hike (tbd')).toEqual(['', 'Hike (tbd']);
    expect(take('Not virtually')).toEqual(['', 'Not virtually']);
  });

  it('takeTags is quick when the text only looks like it ends in a tag', { retry: 2 }, () => {
    const inputs = [
      fill('rsvp! ', PASTE_CAP) + 'x(' + ' '.repeat(PASTE_CAP) + 'tbd )',
      fill('rsvp! ', PASTE_CAP) + 'x' + '!'.repeat(PASTE_CAP),
      'rsvp' + ' '.repeat(PASTE_CAP) + 'x',
      ' '.repeat(PASTE_CAP) + 'x',
      fill('( rsvp ', PASTE_CAP),
      fill('please ', PASTE_CAP),
    ];
    for (const [i, text] of inputs.entries()) {
      const { elapsed } = timed(() => takeTags(text));
      expect(elapsed, `input ${i}`).toBeLessThan(budget(LIMIT));
    }
  });

  it('the shouting helper is quick on one long word', { retry: 2 }, () => {
    const inputs = [
      'a' + '1'.repeat(PASTE_CAP) + 'b',
      'GO NOW A' + '1'.repeat(PASTE_CAP) + 'B',
      fill('1!', PASTE_CAP) + 'b',
      fill('GO NOW!! ', PASTE_CAP),
    ];
    for (const [i, text] of inputs.entries()) {
      const { elapsed } = timed(() => [shoutStart(text), isShouting(text), toSentenceCase(text)]);
      expect(elapsed, `input ${i}`).toBeLessThan(budget(LIMIT));
    }
    expect(toSentenceCase('LAST CHANCE FOR DONATIONS!!')).toBe('Last chance for donations!');
    expect(toSentenceCase('!!(SIGN UP)!! TODAY')).toBe('!(Sign up)! Today');
  });

  it('sentence and cleanText are quick on long runs of spaces (N1a)', { retry: 2 }, () => {
    const inputs = [
      ' '.repeat(PASTE_CAP),
      ' '.repeat(PASTE_CAP) + 'x' + EM_DASH,
      fill(` ${EM_DASH}`, PASTE_CAP),
      fill(`${NBSP} \t`, PASTE_CAP) + 'x',
    ];
    for (const [i, text] of inputs.entries()) {
      const { elapsed } = timed(() => [sentence(text), cleanText(text)]);
      expect(elapsed, `input ${i}`).toBeLessThan(budget(LIMIT));
    }
    expect(sentence(`a ${EM_DASH} b`)).toBe('a, b');
    expect(sentence(`a${EM_DASH}${EM_DASH} b`)).toBe('a, , b');
    expect(sentence(`${EM_DASH} ${EM_DASH}`)).toBe(', , ');
    expect(sentence(`a \t${NBSP}${EM_DASH}\n`)).toBe('a, ');
    expect(sentence('a  b')).toBe('a  b');
    expect(cleanText(`a ${EM_DASH} b\r\n\nc`)).toBe('a, b c');
  });
});

describe('render: time limits on text typed into a form field', () => {
  const SPACES = ' '.repeat(500 * 1024);

  it('renders a form whose title is 500 KB of spaces (N1a)', { retry: 2 }, () => {
    const form: MessageForm = {
      layout: 'message',
      label: 'News',
      title: SPACES,
      paragraphs: [[{ kind: 'text', text: 'Hello pack.', marks: [] }]],
    };
    const { result, elapsed } = timed(() => renderAnnouncement(form));
    expect(elapsed).toBeLessThan(budget(LIMIT));
    expect(result).toContain('Hello pack.');
  });

  it('renders a title of 500 KB of spaces with one em dash after them (N1a)', { retry: 2 }, () => {
    // With no em dash at all the engine skips the regex, so the plain run of spaces was quick in
    // Node. One em dash anywhere after the spaces is what made the old regex slow.
    const form: MessageForm = {
      layout: 'message',
      label: 'News',
      title: SPACES + 'x' + EM_DASH + 'y',
      paragraphs: [],
    };
    const { result, elapsed } = timed(() => renderAnnouncement(form));
    expect(elapsed).toBeLessThan(budget(LIMIT));
    expect(result).toContain(SPACES + 'x, y</p>');
  });

  it('renders 500 KB of spaces in every kind of field (N1a)', { retry: 2 }, () => {
    const typed = SPACES + 'x' + EM_DASH;
    const forms: AnnouncementForm[] = [
      {
        layout: 'message',
        label: typed,
        title: typed,
        paragraphs: [[{ kind: 'text', text: typed, marks: [] }]],
        button: { text: typed, url: 'https://example.org/' + SPACES },
      },
      {
        layout: 'date-list',
        label: '',
        title: 'Dates',
        sections: [
          {
            name: typed,
            style: 'quiet',
            subtitle: typed,
            rows: [
              {
                event: typed,
                url: '',
                tags: [{ text: typed, strength: 'quiet' }],
                note: [{ kind: 'text', text: typed, marks: [] }],
              },
            ],
          },
        ],
      },
      {
        layout: 'link-list',
        label: '',
        title: 'Links',
        intro: [{ kind: 'text', text: typed, marks: [] }],
        image: { src: 'https://example.org/a.png', alt: typed },
        items: [{ text: typed, url: 'https://example.org/', note: typed }],
      },
    ];
    for (const form of forms) {
      const { result, elapsed } = timed(() => renderAnnouncement(form));
      expect(elapsed, form.layout).toBeLessThan(budget(LIMIT));
      expect(result).not.toContain(EM_DASH);
    }
  });
});

describe('rich text markup: time limits on typed text', () => {
  it('reads a quarter of a million unclosed links (N1b)', { retry: 2 }, () => {
    const text = '[a]('.repeat(250_000);
    const { result, elapsed } = timed(() => textToRich(text));
    expect(elapsed).toBeLessThan(budget(LIMIT));
    expect(result).toEqual([{ kind: 'text', text, marks: [] }]);
  });

  it('reads unclosed links on many lines, and a closed one after them', { retry: 2 }, () => {
    const text = '[a](\n'.repeat(100_000) + '[b](https://example.org/x\\)y)';
    const { result, elapsed } = timed(() => textToRich(text));
    expect(elapsed).toBeLessThan(budget(LIMIT));
    expect(result).toHaveLength(200_001);
    expect(result[result.length - 1]).toEqual({
      kind: 'text',
      text: 'b',
      marks: [],
      href: 'https://example.org/x)y',
    });
  });

  it('reads one very long link address', { retry: 2 }, () => {
    const url = 'https://example.org/' + 'a'.repeat(PASTE_CAP);
    const { result, elapsed } = timed(() => textToRich(`[a](${url}) [b](${url}`));
    expect(elapsed).toBeLessThan(budget(LIMIT));
    expect(result[0]).toEqual({ kind: 'text', text: 'a', marks: [], href: url });
    expect(result).toHaveLength(2);
  });
});

describe('setAt: a quick check that hostile keys change nothing', () => {
  it('leaves Object.prototype alone', () => {
    const form: MessageForm = { layout: 'message', label: '', title: 'T', paragraphs: [] };
    setAt(form, ['__proto__', 'polluted'], 'yes');
    setAt(form, ['constructor', 'prototype', 'polluted'], 'yes');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
