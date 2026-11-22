import { describe, expect, it } from 'vitest';
import type { MessageForm } from '../../src/core/forms';
import { boxedMoved, boxedRemoved, isBoxed, setBoxed } from '../../src/ui/boxed';
import { moveItem } from '../../src/ui/paths';

const para = (text: string) => [{ kind: 'text' as const, text, marks: [] }];

function make(boxed?: boolean[]): MessageForm {
  const form: MessageForm = {
    layout: 'message',
    label: '',
    title: '',
    paragraphs: [para('a'), para('b'), para('c')],
  };
  if (boxed) form.boxed = boxed;
  return form;
}

const texts = (f: MessageForm) =>
  f.paragraphs.map((p) => (p[0] && 'text' in p[0] ? p[0].text : ''));

describe('boxed list alignment', () => {
  it('sets and clears a box, and leaves the key out when nothing is boxed', () => {
    const f = make();
    setBoxed(f, 1, true);
    expect(f.boxed).toEqual([false, true]);
    expect(isBoxed(f, 1)).toBe(true);
    expect(isBoxed(f, 0)).toBe(false);
    expect(isBoxed(f, 2)).toBe(false);
    setBoxed(f, 1, false);
    expect(f.boxed).toBeUndefined();
  });

  it('ignores an index with no paragraph', () => {
    const f = make();
    setBoxed(f, 5, true);
    expect(f.boxed).toBeUndefined();
  });

  it('moves the box with its paragraph, down and up', () => {
    const f = make([true]);
    moveItem(f.paragraphs, 0, 1);
    boxedMoved(f, 0, 1);
    expect(texts(f)).toEqual(['b', 'a', 'c']);
    expect(f.boxed).toEqual([false, true]);
    moveItem(f.paragraphs, 1, 0);
    boxedMoved(f, 1, 0);
    expect(f.boxed).toEqual([true]);
  });

  it('moves a box past the end of a short list', () => {
    const f = make([false, false, true]);
    moveItem(f.paragraphs, 2, 1);
    boxedMoved(f, 2, 1);
    expect(f.boxed).toEqual([false, true]);
  });

  it('does nothing to a form with no boxes', () => {
    const f = make();
    moveItem(f.paragraphs, 0, 1);
    boxedMoved(f, 0, 1);
    boxedRemoved(f, 0);
    expect(f.boxed).toBeUndefined();
  });

  it('removes the box of a removed paragraph and shifts the rest', () => {
    const f = make([true, false, true]);
    f.paragraphs.splice(0, 1);
    boxedRemoved(f, 0);
    expect(texts(f)).toEqual(['b', 'c']);
    expect(f.boxed).toEqual([false, true]);
  });

  it('drops the key when the only boxed paragraph is removed', () => {
    const f = make([false, true]);
    f.paragraphs.splice(1, 1);
    boxedRemoved(f, 1);
    expect(f.boxed).toBeUndefined();
  });

  it('keeps a boxed paragraph after a new one is added at the end', () => {
    const f = make([true]);
    f.paragraphs.push([]);
    expect(isBoxed(f, 0)).toBe(true);
    expect(isBoxed(f, 3)).toBe(false);
  });
});
