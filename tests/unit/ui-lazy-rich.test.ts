import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RichText } from '../../src/core/forms';
import {
  COMMIT_DELAY_MS,
  createKit,
  type FormContext,
  type TypingEdit,
} from '../../src/ui/form-kit';

function setup() {
  const edits: TypingEdit[] = [];
  const ctx: FormContext = {
    checks: () => [],
    suggestions: () => [],
    warnings: () => [],
    typed: (edit) => edits.push(edit),
    begin() {},
    step() {},
    history() {},
    swapped() {},
    removed() {},
    apply() {},
  };
  const kit = createKit(ctx);
  let value: RichText = [];
  let sets = 0;
  const node = kit.rich(
    'Body',
    ['b'],
    () => value,
    (v) => {
      value = v;
      sets++;
    },
  );
  document.body.append(node);
  const area = node.querySelector('textarea') as HTMLTextAreaElement;
  const type = (text: string): void => {
    area.value = text;
    area.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return { kit, area, type, edits, get: () => value, sets: () => sets, node };
}

const plain = (v: RichText): string => v.map((r) => ('text' in r ? r.text : '')).join('');

describe('lazy form value for rich fields', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('records one undo step per edit but parses once after a pause', () => {
    const s = setup();
    s.type('a');
    s.type('ab');
    s.type('abc');
    expect(s.edits).toHaveLength(3);
    expect(s.sets()).toBe(0);
    vi.advanceTimersByTime(COMMIT_DELAY_MS);
    expect(s.sets()).toBe(1);
    expect(plain(s.get())).toBe('abc');
  });

  it('keeps waiting while typing continues', () => {
    const s = setup();
    s.type('a');
    vi.advanceTimersByTime(COMMIT_DELAY_MS - 10);
    s.type('ab');
    vi.advanceTimersByTime(COMMIT_DELAY_MS - 10);
    expect(s.sets()).toBe(0);
    vi.advanceTimersByTime(10);
    expect(plain(s.get())).toBe('ab');
  });

  it('flush() brings the form up to date at once', () => {
    const s = setup();
    s.type('hello');
    s.kit.flush();
    expect(plain(s.get())).toBe('hello');
    vi.advanceTimersByTime(COMMIT_DELAY_MS * 2);
    expect(s.sets()).toBe(1);
  });

  it('commits when the field loses focus', () => {
    const s = setup();
    s.type('bye');
    s.area.dispatchEvent(new Event('blur'));
    expect(plain(s.get())).toBe('bye');
  });

  it('undo or redo putting text in cancels the waiting parse', () => {
    const s = setup();
    s.type('abc');
    s.kit.setField(['b'], 'ab', [2, 2]);
    expect(plain(s.get())).toBe('ab');
    vi.advanceTimersByTime(COMMIT_DELAY_MS * 2);
    expect(plain(s.get())).toBe('ab');
    expect(s.sets()).toBe(1);
  });
});
