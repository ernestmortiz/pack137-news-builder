import { describe, expect, it } from 'vitest';
import type { RichText } from '../../src/core/forms';
import type { Mark, TextRun } from '../../src/core/model';
import { normalizeRich, richToText, textToRich } from '../../src/core/rich-text';

const t = (text: string, marks: Mark[] = [], href?: string): TextRun => ({
  kind: 'text',
  text,
  marks,
  ...(href === undefined ? {} : { href }),
});
const br = { kind: 'break' } as const;

function roundTrip(runs: RichText): void {
  expect(textToRich(richToText(runs))).toEqual(normalizeRich(runs));
}

describe('richToText', () => {
  it('writes plain text as is', () => {
    expect(richToText([t('Hello there')])).toBe('Hello there');
  });
  it('writes each mark', () => {
    expect(richToText([t('a', ['strong'])])).toBe('**a**');
    expect(richToText([t('a', ['em'])])).toBe('_a_');
    expect(richToText([t('a', ['strike'])])).toBe('~~a~~');
  });
  it('writes a link', () => {
    expect(richToText([t('Sign up', [], 'https://example.org/x')])).toBe(
      '[Sign up](https://example.org/x)',
    );
  });
  it('writes a line break as a newline', () => {
    expect(richToText([t('a'), br, t('b')])).toBe('a\nb');
  });
  it('escapes characters that would be read as markup', () => {
    expect(richToText([t('a*b_c[d]e~f\\g')])).toBe('a\\*b\\_c\\[d\\]e\\~f\\\\g');
  });
});

describe('textToRich', () => {
  it('reads each piece of markup', () => {
    expect(textToRich('Hi **bold** and _soft_ and ~~old~~.')).toEqual([
      t('Hi '),
      t('bold', ['strong']),
      t(' and '),
      t('soft', ['em']),
      t(' and '),
      t('old', ['strike']),
      t('.'),
    ]);
  });
  it('reads combined marks, sorted', () => {
    expect(textToRich('**_~~x~~_**')).toEqual([t('x', ['em', 'strike', 'strong'])]);
  });
  it('reads a link, with marks inside', () => {
    expect(textToRich('Go [**now**](https://example.org)')).toEqual([
      t('Go '),
      t('now', ['strong'], 'https://example.org'),
    ]);
  });
  it('keeps an unfinished link as text', () => {
    expect(textToRich('[oops](nothing')).toEqual([t('[oops](nothing')]);
    expect(textToRich('a [b] c')).toEqual([t('a [b] c')]);
  });
  it('turns newlines into line breaks', () => {
    expect(textToRich('a\r\nb\nc')).toEqual([t('a'), br, t('b'), br, t('c')]);
  });
  it('returns nothing for empty text', () => {
    expect(textToRich('')).toEqual([]);
  });
  it('treats a lone tilde as text', () => {
    expect(textToRich('a ~ b')).toEqual([t('a ~ b')]);
  });
  it('keeps a mailto link with its full address and parameters', () => {
    expect(textToRich('[mail](mailto:a@b.org?cc=x@y.org&subject=Hi%20there)')).toEqual([
      t('mail', [], 'mailto:a@b.org?cc=x@y.org&subject=Hi%20there'),
    ]);
  });
});

describe('round trip', () => {
  const cases: [string, RichText][] = [
    ['plain', [t('Just words.')]],
    ['empty', []],
    ['marks', [t('a ', ['strong']), t('b', ['em']), t(' c', ['strike'])]],
    ['combined marks', [t('x', ['em', 'strike', 'strong']), t('y', ['em', 'strong'])]],
    ['adjacent different marks', [t('a', ['strong']), t('b', ['em']), t('c')]],
    ['link', [t('see '), t('this', [], 'https://example.org/a?b=c&d=e'), t('.')]],
    ['link with marks', [t('this', ['strong', 'strike'], 'https://example.org')]],
    [
      'link then plain same text',
      [t('a', [], 'https://example.org'), t('b', ['em'], 'https://example.org'), t('c')],
    ],
    ['two links', [t('a', [], 'https://one.org'), t(' '), t('b', [], 'https://two.org')]],
    ['link with parentheses and backslash', [t('x', [], 'https://example.org/a_(b)\\c')]],
    ['mailto', [t('Email', [], 'mailto:a@b.org?subject=Help%20wanted&cc=c@d.org')]],
    ['empty href', [t('x', [], '')]],
    ['breaks', [t('a'), br, t('b', ['strong']), br, br, t('c')]],
    ['leading and trailing break', [br, t('a'), br]],
    ['break between linked runs', [t('a', [], 'https://x.org'), br, t('b', [], 'https://x.org')]],
    ['special characters', [t('1 * 2 _ 3 ~~ 4 [5] (6) \\7 \\* **8**')]],
    ['special characters in marks', [t('a_b*c', ['em']), t('[x](y)', ['strong'])]],
    ['spaces inside marks', [t(' a ', ['strong']), t(' b', ['em'])]],
    ['literal markup', [t('<script>alert(1)</script> $& &amp;')]],
    ['text that looks like markup after a mark', [t('a', ['strong']), t('**b**')]],
    ['backslash at the end', [t('a\\')]],
    ['backslash before a mark', [t('a\\', ['strong']), t('b')]],
  ];
  for (const [name, runs] of cases) it(name, () => roundTrip(runs));

  it('merges adjacent runs that look the same and drops empty ones', () => {
    expect(normalizeRich([t('a'), t(''), t('b'), t('c', ['em']), t('d', ['em'])])).toEqual([
      t('ab'),
      t('cd', ['em']),
    ]);
  });
  it('writes a newline inside a run as a space, as the renderer does', () => {
    expect(richToText([t('a\nb')])).toBe('a b');
  });
});
