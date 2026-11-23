import { describe, expect, it } from 'vitest';
import { budget } from './budget';
import { extract } from '../../src/core/extract';
import type { Block, Mark, TextRun } from '../../src/core/model';
import { normalize } from '../../src/core/normalize';
import { sanitize } from '../../src/core/sanitize';

const blocks = (html: string): Block[] => extract(normalize(sanitize(html).root)).blocks;
const text = (t: string, marks: Mark[] = []): TextRun => ({ kind: 'text', text: t, marks });
const link = (t: string, href: string, marks: Mark[] = []): TextRun => ({
  ...text(t, marks),
  href,
});

describe('extract: blocks', () => {
  it('reads a plain paragraph', () => {
    expect(blocks('<p>Hello there.</p>')).toEqual([
      { type: 'paragraph', runs: [text('Hello there.')] },
    ]);
  });

  it('keeps marks and links as runs, merging neighbours with the same marks', () => {
    expect(
      blocks(
        '<p>Read <b>the <i>new</i></b> <a href="https://x.org/a">plan <strong>now</strong></a>.</p>',
      ),
    ).toEqual([
      {
        type: 'paragraph',
        runs: [
          text('Read '),
          text('the ', ['strong']),
          text('new', ['em', 'strong']),
          text(' '),
          link('plan ', 'https://x.org/a'),
          link('now', 'https://x.org/a', ['strong']),
          text('.'),
        ],
      },
    ]);
  });

  it('keeps strikethrough as the strike mark', () => {
    expect(blocks('<p><s>Dec 6</s> Pack Meeting.</p>')).toEqual([
      { type: 'paragraph', runs: [text('Dec 6', ['strike']), text(' Pack Meeting.')] },
    ]);
  });

  it('reads line breaks', () => {
    expect(blocks('<p>One.<br>Two.</p>')).toEqual([
      { type: 'paragraph', runs: [text('One.'), { kind: 'break' }, text('Two.')] },
    ]);
  });

  it('reads heading tags', () => {
    expect(blocks('<h2>Coming soon</h2>')).toEqual([
      { type: 'heading', level: 2, source: 'tag', runs: [text('Coming soon')] },
    ]);
  });

  it('reads lists with nested lists as children', () => {
    expect(blocks('<ul><li>One<ul><li>One a</li></ul></li><li>Two</li></ul>')).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [
          {
            runs: [text('One')],
            children: [
              { type: 'list', ordered: false, items: [{ runs: [text('One a')], children: [] }] },
            ],
          },
          { runs: [text('Two')], children: [] },
        ],
      },
    ]);
  });

  it('flattens lists nested more than one level into the first level of children', () => {
    const [list] = blocks('<ol><li>A<ul><li>B<ul><li>C</li></ul></li></ul></li></ol>');
    expect(list).toMatchObject({ type: 'list', ordered: true });
    const item = list?.type === 'list' ? list.items[0] : undefined;
    expect(item?.children).toHaveLength(2);
    expect(item?.children[1]?.items[0]?.runs).toEqual([text('C')]);
    expect(item?.children[1]?.items[0]?.children).toEqual([]);
  });

  it('reads rules and images, keeping alt, size and a wrapping link', () => {
    expect(
      blocks(
        '<p>Intro.</p><hr><img src="https://x.org/a.png" alt="Food drive" width="552" height="300"><p><a href="https://x.org/p"><img src="https://x.org/b.png" alt="B"></a></p>',
      ),
    ).toEqual([
      { type: 'paragraph', runs: [text('Intro.')] },
      { type: 'rule' },
      { type: 'image', src: 'https://x.org/a.png', alt: 'Food drive', width: 552, height: 300 },
      { type: 'image', src: 'https://x.org/b.png', alt: 'B', href: 'https://x.org/p' },
    ]);
  });

  it('splits an image out of a paragraph of text, keeping order', () => {
    expect(blocks('<p>Before. <img src="https://x.org/a.png" alt="A"> After.</p>')).toEqual([
      { type: 'paragraph', runs: [text('Before.')] },
      { type: 'image', src: 'https://x.org/a.png', alt: 'A' },
      { type: 'paragraph', runs: [text('After.')] },
    ]);
  });

  it('gives an image with no alt an empty alt', () => {
    expect(blocks('<img src="https://x.org/a.png">')).toEqual([
      { type: 'image', src: 'https://x.org/a.png', alt: '' },
    ]);
  });

  it('returns no blocks for empty input', () => {
    expect(blocks('')).toEqual([]);
    expect(blocks('<div>&nbsp;</div><p> </p>')).toEqual([]);
  });
});

describe('extract: inferred headings', () => {
  it('treats a short paragraph that is entirely bold as a heading and drops the bold', () => {
    expect(blocks('<p><b>Coming soon</b></p><p>Text.</p>')[0]).toEqual({
      type: 'heading',
      level: 3,
      source: 'inferred',
      runs: [text('Coming soon')],
    });
  });

  it('treats an unpunctuated line before a list as a heading', () => {
    expect(blocks('<p>Upcoming events</p><ul><li>Dec 6 Meeting</li></ul>')[0]).toMatchObject({
      type: 'heading',
      source: 'inferred',
    });
  });

  it('keeps a punctuated line before a list as a paragraph', () => {
    expect(
      blocks('<p>Here is what is coming up:</p><ul><li>Dec 6 Meeting</li></ul>')[0],
    ).toMatchObject({
      type: 'paragraph',
    });
    expect(blocks('<p>Thanks to all.</p><ul><li>A</li></ul>')[0]).toMatchObject({
      type: 'paragraph',
    });
  });

  it('keeps an unpunctuated line that does not precede a list as a paragraph', () => {
    expect(blocks('<p>Upcoming events</p><p>More.</p>')[0]).toMatchObject({ type: 'paragraph' });
  });

  it('does not promote a bold link, a long bold sentence or a bold date', () => {
    expect(blocks('<p><b><a href="https://x.org">Sign up here</a></b></p>')[0]).toMatchObject({
      type: 'paragraph',
    });
    expect(
      blocks(
        '<p><b>Please remember that every scout needs a signed permission slip before the campout next month.</b></p>',
      )[0],
    ).toMatchObject({ type: 'paragraph' });
    expect(blocks('<p><b>Sun Dec 6</b></p><p>Pack meeting.</p>')[0]).toMatchObject({
      type: 'paragraph',
    });
  });
});

describe('extract: robustness', () => {
  it('handles a 1 MB paste', { retry: 2 }, () => {
    const html = '<p>Line of text with a <a href="https://x.org">link</a>.</p>'.repeat(18_000);
    const started = performance.now();
    const result = blocks(html);
    expect(result.length).toBeGreaterThan(1000);
    expect(performance.now() - started).toBeLessThan(budget(5000));
  });

  it('handles a paragraph with 70,000 images without overflowing the stack', () => {
    const html = '<p>' + '<img src="https://a.org/i.png" alt="a">a'.repeat(70_000) + '</p>';
    const result = blocks(html);
    expect(result.filter((b) => b.type === 'image')).toHaveLength(70_000);
  }, 60_000);

  it('trims 250,000 leading breaks in linear time', { retry: 2, timeout: 60_000 }, () => {
    const html = '<p><img src="https://a.org/i.png" alt="a">' + '<br>'.repeat(250_000) + 'x</p>';
    const started = performance.now();
    const result = blocks(html);
    expect(result.at(-1)).toEqual({ type: 'paragraph', runs: [text('x')] });
    expect(performance.now() - started).toBeLessThan(budget(30_000));
  });

  it('never yields an empty text run', () => {
    const all = blocks('<p><b></b>a<i> </i>b<s></s></p><ul><li><b> </b>c</li></ul>');
    const runs = all.flatMap((b) =>
      b.type === 'paragraph' || b.type === 'heading'
        ? b.runs
        : b.type === 'list'
          ? b.items.flatMap((i) => i.runs)
          : [],
    );
    expect(runs.every((r) => r.kind === 'break' || r.text.length > 0)).toBe(true);
  });
});
