import { describe, expect, it } from 'vitest';
import type { RichText } from '../../src/core/forms';
import type { Mark } from '../../src/core/model';
import {
  linkAt,
  marksIn,
  plainLength,
  removeLink,
  replaceRange,
  setLink,
  toggleMark,
} from '../../src/core/rich-edit';
import { richToText } from '../../src/core/rich-text';

const t = (text: string, marks: Mark[] = [], href?: string): RichText[number] => ({
  kind: 'text',
  text,
  marks,
  ...(href === undefined ? {} : { href }),
});
const br = (): RichText[number] => ({ kind: 'break' });
/** Compact view of the result, using the same codes the form shows. */
const code = (runs: RichText): string => richToText(runs);

describe('plainLength', () => {
  it('counts a break as one character', () => {
    expect(plainLength([t('ab'), br(), t('c', ['em'])])).toBe(4);
    expect(plainLength([])).toBe(0);
  });
});

describe('toggleMark', () => {
  it('adds a mark to the selected part only', () => {
    expect(code(toggleMark([t('hello world')], 6, 11, 'strong'))).toBe('hello **world**');
  });

  it('removes the mark when every character already has it', () => {
    const runs = [t('hello '), t('world', ['strong'])];
    expect(code(toggleMark(runs, 6, 11, 'strong'))).toBe('hello world');
  });

  it('adds it to all when only some characters have it', () => {
    const runs = [t('he', ['strong']), t('llo')];
    expect(code(toggleMark(runs, 0, 5, 'strong'))).toBe('**hello**');
  });

  it('removes it from part of a marked run', () => {
    const runs = [t('hello', ['em'])];
    expect(toggleMark(runs, 1, 3, 'em')).toEqual([t('h', ['em']), t('el'), t('lo', ['em'])]);
  });

  it('combines marks', () => {
    const runs = toggleMark(toggleMark([t('word')], 0, 4, 'strong'), 0, 4, 'em');
    expect(runs).toEqual([t('word', ['em', 'strong'])]);
  });

  it('spans runs and breaks and leaves breaks alone', () => {
    const runs = [t('ab'), br(), t('cd')];
    const out = toggleMark(runs, 1, 4, 'strike');
    expect(out).toEqual([t('a'), t('b', ['strike']), br(), t('c', ['strike']), t('d')]);
  });

  it('keeps links while changing marks inside them', () => {
    const runs = [t('see here', [], 'https://example.org')];
    const out = toggleMark(runs, 4, 8, 'strong');
    expect(out).toEqual([
      t('see ', [], 'https://example.org'),
      t('here', ['strong'], 'https://example.org'),
    ]);
  });

  it('does nothing for an empty range or a range with no text', () => {
    const runs = [t('abc'), br(), t('d')];
    expect(toggleMark(runs, 2, 2, 'strong')).toEqual(runs);
    expect(toggleMark(runs, 3, 4, 'strong')).toEqual(runs);
  });

  it('clamps out of bounds and reversed ranges', () => {
    expect(code(toggleMark([t('abc')], -5, 99, 'em'))).toBe('_abc_');
    expect(code(toggleMark([t('abc')], 3, 1, 'em'))).toBe('a_bc_');
  });

  it('does not change the input', () => {
    const runs = [t('abc')];
    toggleMark(runs, 0, 3, 'strong');
    expect(runs).toEqual([t('abc')]);
  });
});

describe('marksIn', () => {
  const runs = [t('plain '), t('bold', ['strong']), t(' both', ['strong', 'em'])];
  it('lists the marks that cover the whole range', () => {
    expect(marksIn(runs, 6, 10)).toEqual(['strong']);
    expect(marksIn(runs, 6, 15)).toEqual(['strong']);
    expect(marksIn(runs, 10, 15).sort()).toEqual(['em', 'strong']);
    expect(marksIn(runs, 0, 8)).toEqual([]);
  });
  it('uses the character before for a collapsed cursor', () => {
    expect(marksIn(runs, 10, 10)).toEqual(['strong']);
    expect(marksIn(runs, 15, 15).sort()).toEqual(['em', 'strong']);
    expect(marksIn(runs, 0, 0)).toEqual([]);
  });
  it('gives none for empty text or a break', () => {
    expect(marksIn([], 0, 0)).toEqual([]);
    expect(marksIn([t('a', ['em']), br()], 2, 2)).toEqual([]);
  });
  it('ignores breaks inside a range', () => {
    expect(marksIn([t('a', ['em']), br(), t('b', ['em'])], 0, 3)).toEqual(['em']);
  });
});

describe('setLink and removeLink', () => {
  it('links the selected words', () => {
    const out = setLink([t('Fun On The Run today')], 0, 14, 'https://example.org');
    expect(code(out)).toBe('[Fun On The Run](https://example.org) today');
  });

  it('keeps marks inside the link', () => {
    const out = setLink([t('go '), t('now', ['strong'])], 0, 6, 'https://example.org');
    expect(out).toEqual([
      t('go ', [], 'https://example.org'),
      t('now', ['strong'], 'https://example.org'),
    ]);
  });

  it('does not link breaks', () => {
    const out = setLink([t('a'), br(), t('b')], 0, 3, 'https://example.org');
    expect(out).toEqual([
      t('a', [], 'https://example.org'),
      br(),
      t('b', [], 'https://example.org'),
    ]);
  });

  it('replaces an existing address on the selection', () => {
    const out = setLink([t('abc', [], 'https://old.example')], 0, 3, 'https://new.example');
    expect(out).toEqual([t('abc', [], 'https://new.example')]);
  });

  it('with a cursor inside a link, changes the whole link', () => {
    const runs = [t('x '), t('link', [], 'https://old.example'), t(' y')];
    expect(setLink(runs, 4, 4, 'https://new.example')).toEqual([
      t('x '),
      t('link', [], 'https://new.example'),
      t(' y'),
    ]);
  });

  it('with a cursor outside any link, changes nothing', () => {
    const runs = [t('abc')];
    expect(setLink(runs, 1, 1, 'https://example.org')).toEqual(runs);
  });

  it('removes a link from the whole link the selection touches', () => {
    const runs = [t('x '), t('long link', [], 'https://example.org'), t(' y')];
    expect(code(removeLink(runs, 4, 6))).toBe('x long link y');
  });

  it('removes the whole link for a cursor inside it, keeping marks', () => {
    const runs = [t('a', [], 'https://example.org'), t('b', ['em'], 'https://example.org')];
    expect(removeLink(runs, 1, 1)).toEqual([t('a'), t('b', ['em'])]);
  });

  it('leaves other links alone', () => {
    const runs = [t('a', [], 'https://one.example'), t(' '), t('b', [], 'https://two.example')];
    expect(code(removeLink(runs, 0, 1))).toBe('a [b](https://two.example)');
  });

  it('does nothing for a cursor outside a link', () => {
    const runs = [t('abc')];
    expect(removeLink(runs, 1, 1)).toEqual(runs);
  });
});

describe('linkAt', () => {
  const runs = [
    t('go '),
    t('here', [], 'https://example.org'),
    t(' and '),
    t('there', ['em'], 'https://example.org/2'),
  ];
  it('gives the address and the whole range', () => {
    expect(linkAt(runs, 4)).toEqual({ href: 'https://example.org', start: 3, end: 7 });
    expect(linkAt(runs, 3)).toEqual({ href: 'https://example.org', start: 3, end: 7 });
  });
  it('counts the end of a link as inside it', () => {
    expect(linkAt(runs, 7)).toEqual({ href: 'https://example.org', start: 3, end: 7 });
  });
  it('joins neighbouring pieces with the same address', () => {
    const joined = [t('a', [], 'https://x.example'), t('b', ['strong'], 'https://x.example')];
    expect(linkAt(joined, 1)).toEqual({ href: 'https://x.example', start: 0, end: 2 });
  });
  it('is null outside a link or out of bounds', () => {
    expect(linkAt(runs, 1)).toBeNull();
    expect(linkAt(runs, 99)).toBeNull();
    expect(linkAt(runs, -1)).toBeNull();
    expect(linkAt([], 0)).toBeNull();
  });
});

describe('replaceRange', () => {
  it('replaces the selection with pasted runs', () => {
    const out = replaceRange([t('hello world')], 6, 11, [t('there', ['strong'])]);
    expect(code(out)).toBe('hello **there**');
  });
  it('inserts at a cursor and keeps breaks', () => {
    const out = replaceRange([t('ab')], 1, 1, [t('x'), br(), t('y')]);
    expect(out).toEqual([t('ax'), br(), t('yb')]);
  });
  it('deletes when nothing is inserted', () => {
    expect(replaceRange([t('abc'), br(), t('d')], 2, 4, [])).toEqual([t('abd')]);
  });
  it('clamps out of bounds', () => {
    expect(replaceRange([t('abc')], 2, 99, [t('Z')])).toEqual([t('abZ')]);
    expect(replaceRange([t('abc')], -4, 1, [t('Z')])).toEqual([t('Zbc')]);
  });
  it('splits a link and keeps both halves linked', () => {
    const out = replaceRange([t('abcd', [], 'https://example.org')], 2, 2, [t('-')]);
    expect(out).toEqual([
      t('ab', [], 'https://example.org'),
      t('-'),
      t('cd', [], 'https://example.org'),
    ]);
  });
});
