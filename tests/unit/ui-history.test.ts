import { describe, expect, it } from 'vitest';
import { createHistory, MAX_STEPS } from '../../src/ui/history';
import { changeBytes, textAfter, textBefore, toChange } from '../../src/ui/typing';

interface S {
  text: string;
  list: string[];
}
interface P {
  from: string;
  to: string;
}

const make = (limit?: number) => createHistory<S, P>(limit);

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const h = make();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBeUndefined();
    expect(h.redo()).toBeUndefined();
  });

  it('undoes and redoes snapshot steps with labels', () => {
    const h = make();
    h.recordSnapshot({ text: 'a', list: [] }, { text: 'a', list: ['x'] }, 'added a row');
    h.recordSnapshot({ text: 'a', list: ['x'] }, { text: 'a', list: [] }, 'removed a row');
    expect(h.undo()).toEqual({
      kind: 'snapshot',
      state: { text: 'a', list: ['x'] },
      label: 'removed a row',
    });
    expect(h.undo()).toEqual({
      kind: 'snapshot',
      state: { text: 'a', list: [] },
      label: 'added a row',
    });
    expect(h.canUndo()).toBe(false);
    expect(h.redo()).toEqual({
      kind: 'snapshot',
      state: { text: 'a', list: ['x'] },
      label: 'added a row',
    });
    expect(h.redo()).toEqual({
      kind: 'snapshot',
      state: { text: 'a', list: [] },
      label: 'removed a row',
    });
    expect(h.canRedo()).toBe(false);
  });

  it('undoes and redoes patch steps in order, one per character', () => {
    const h = make();
    h.recordPatch({ from: '', to: 'a' }, 'typing in Label');
    h.recordPatch({ from: 'a', to: 'ab' }, 'typing in Label');
    h.recordPatch({ from: 'ab', to: 'abc' }, 'typing in Label');
    expect(h.size()).toBe(3);
    expect(h.undo()).toEqual({
      kind: 'patch',
      patch: { from: 'ab', to: 'abc' },
      direction: 'undo',
      label: 'typing in Label',
    });
    expect(h.undo()).toMatchObject({ kind: 'patch', patch: { to: 'ab' }, direction: 'undo' });
    expect(h.redo()).toMatchObject({ kind: 'patch', patch: { to: 'ab' }, direction: 'redo' });
    expect(h.size()).toBe(2);
  });

  it('mixes patch and snapshot steps', () => {
    const h = make();
    h.recordPatch({ from: '', to: 'a' }, 'typing');
    h.recordSnapshot({ text: 'a', list: [] }, { text: 'a', list: ['x'] }, 'added a row');
    h.recordPatch({ from: 'a', to: 'ab' }, 'typing');
    expect(h.undo()?.kind).toBe('patch');
    expect(h.undo()).toMatchObject({ kind: 'snapshot', state: { text: 'a', list: [] } });
    expect(h.undo()).toMatchObject({ kind: 'patch', patch: { to: 'a' } });
    expect(h.redo()?.kind).toBe('patch');
    expect(h.redo()).toMatchObject({ kind: 'snapshot', state: { text: 'a', list: ['x'] } });
    expect(h.redo()).toMatchObject({ kind: 'patch', patch: { to: 'ab' } });
    expect(h.canRedo()).toBe(false);
  });

  it('stores deep copies, in and out', () => {
    const before: S = { text: 'a', list: ['one'] };
    const after: S = { text: 'a', list: ['one', 'two'] };
    const h = make();
    h.recordSnapshot(before, after, 'added a link');
    after.list.push('three');
    const back = h.undo();
    if (back?.kind !== 'snapshot') throw new Error('expected snapshot');
    back.state.list.push('mutated');
    const again = h.redo();
    expect(again).toMatchObject({ state: { list: ['one', 'two'] } });
    if (again?.kind === 'snapshot') again.state.list.push('mutated');
    h.undo();
    expect(h.redo()).toMatchObject({ state: { list: ['one', 'two'] } });
    expect(h.undo()).toMatchObject({ state: { list: ['one'] } });
  });

  it('drops redo steps when recording after an undo', () => {
    const h = make();
    h.recordPatch({ from: '', to: 'a' }, 'one');
    h.recordPatch({ from: 'a', to: 'ab' }, 'two');
    h.undo();
    h.recordSnapshot({ text: 'a', list: [] }, { text: 'z', list: [] }, 'three');
    expect(h.canRedo()).toBe(false);
    expect(h.size()).toBe(2);
    h.undo();
    expect(h.undo()).toMatchObject({ kind: 'patch', patch: { to: 'a' } });
    expect(h.undo()).toBeUndefined();
  });

  it('keeps at most 2000 steps, dropping the oldest', () => {
    expect(MAX_STEPS).toBe(2000);
    const h = make();
    for (let i = 1; i <= MAX_STEPS + 50; i++)
      h.recordPatch({ from: String(i - 1), to: String(i) }, 's');
    let undone = 0;
    let last: P | undefined;
    for (let m = h.undo(); m; m = h.undo()) {
      undone += 1;
      if (m.kind === 'patch') last = m.patch;
    }
    expect(undone).toBe(MAX_STEPS);
    expect(last).toEqual({ from: '50', to: '51' });
  });

  it('honours a smaller limit with mixed steps', () => {
    const h = make(2);
    h.recordPatch({ from: '', to: 'a' }, 'a');
    h.recordSnapshot({ text: '1', list: [] }, { text: '2', list: [] }, 'b');
    h.recordSnapshot({ text: '2', list: [] }, { text: '3', list: [] }, 'c');
    expect(h.undo()).toMatchObject({ state: { text: '2' } });
    expect(h.undo()).toMatchObject({ state: { text: '1' } });
    expect(h.undo()).toBeUndefined();
  });

  it('chains adjacent snapshot steps through the stored state', () => {
    const h = make();
    h.recordSnapshot({ text: '1', list: [] }, { text: '2', list: [] }, 'a');
    h.recordSnapshot({ text: 'ignored', list: [] }, { text: '3', list: [] }, 'b');
    expect(h.undo()).toMatchObject({ state: { text: '2' } });
  });
});

describe('typing changes stored as only the change', () => {
  const sel = (n: number): [number, number] => [n, n];
  const edit = (before: string, after: string) => ({
    path: ['f'],
    before,
    after,
    selBefore: sel(0),
    selAfter: sel(after.length),
  });

  it('finds the changed middle', () => {
    expect(toChange(edit('hello world', 'hello brave world'))).toMatchObject({
      start: 6,
      removed: '',
      inserted: 'brave ',
    });
    expect(toChange(edit('abc', 'axc'))).toMatchObject({ start: 1, removed: 'b', inserted: 'x' });
    expect(toChange(edit('aa', 'aaa'))).toMatchObject({ removed: '', inserted: 'a' });
    expect(toChange(edit('abc', 'abc'))).toMatchObject({ removed: '', inserted: '' });
  });

  it('stores a few bytes for a typed character in a 5 MB value', () => {
    const big = 'x'.repeat(5 * 1024 * 1024);
    const change = toChange(edit(big, `${big}y`));
    expect(change.removed).toBe('');
    expect(change.inserted).toBe('y');
    expect(changeBytes(change)).toBeLessThan(200);
    // At the start of the text as well.
    const front = toChange(edit(big, `y${big}`));
    expect(changeBytes(front)).toBeLessThan(200);
    const h = createHistory<S, ReturnType<typeof toChange>>({ patchBytes: changeBytes });
    h.recordPatch(change, 'typing');
    h.recordPatch(front, 'typing');
    expect(h.bytes()).toBeLessThan(500);
  });

  it('undo and redo rebuild the exact text, and match a reference model', () => {
    const texts = ['', 'a', 'ab', 'aXb', 'aXbc', 'Xbc', 'Xbc', '\u{1F600}Xbc', 'zz'];
    const h = createHistory<S, ReturnType<typeof toChange>>({ patchBytes: changeBytes });
    for (let i = 1; i < texts.length; i++) {
      const before = texts[i - 1] ?? '';
      const after = texts[i] ?? '';
      h.recordPatch(
        { ...toChange({ ...edit(before, after), selBefore: sel(i), selAfter: sel(i + 1) }) },
        't',
      );
    }
    let value = texts.at(-1) ?? '';
    for (let i = texts.length - 1; i >= 1; i--) {
      const m = h.undo();
      if (m?.kind !== 'patch') throw new Error('expected patch');
      value = textBefore(value, m.patch);
      expect(value).toBe(texts[i - 1]);
      expect(m.patch.selBefore).toEqual(sel(i));
    }
    for (let i = 1; i < texts.length; i++) {
      const m = h.redo();
      if (m?.kind !== 'patch') throw new Error('expected patch');
      value = textAfter(value, m.patch);
      expect(value).toBe(texts[i]);
      expect(m.patch.selAfter).toEqual(sel(i + 1));
    }
  });
});

describe('history byte budget', () => {
  it('drops the oldest steps once the stored text passes the budget', () => {
    const h = createHistory<S, P>({ maxBytes: 1000, patchBytes: (p) => p.to.length });
    for (let i = 0; i < 5; i++) h.recordPatch({ from: '', to: String(i).repeat(300) }, `s${i}`);
    expect(h.bytes()).toBeLessThanOrEqual(1000);
    expect(h.size()).toBe(3);
    const labels: string[] = [];
    for (let m = h.undo(); m; m = h.undo()) labels.push(m.label);
    expect(labels).toEqual(['s4', 's3', 's2']);
  });

  it('always keeps the newest step, even if it is over the budget alone', () => {
    const h = createHistory<S, P>({ maxBytes: 10, patchBytes: (p) => p.to.length });
    h.recordPatch({ from: '', to: 'a' }, 'small');
    h.recordPatch({ from: '', to: 'b'.repeat(100) }, 'huge');
    expect(h.size()).toBe(1);
    expect(h.undo()).toMatchObject({ label: 'huge' });
  });

  it('counts snapshot steps by their JSON size', () => {
    const h = make();
    const s: S = { text: 'x'.repeat(1000), list: [] };
    h.recordSnapshot(s, s, 'one');
    expect(h.bytes()).toBeGreaterThanOrEqual(2000);
    const small = createHistory<S, P>({ maxBytes: 3000 });
    for (let i = 0; i < 4; i++)
      small.recordSnapshot(s, { ...s, text: `${i}`.repeat(1000) }, `s${i}`);
    expect(small.bytes()).toBeLessThanOrEqual(3000);
    expect(small.size()).toBeLessThan(4);
  });

  it('forgets the size of redo steps that are dropped', () => {
    const h = createHistory<S, P>({ patchBytes: (p) => p.to.length });
    h.recordPatch({ from: '', to: 'a'.repeat(100) }, 'a');
    h.recordPatch({ from: '', to: 'b'.repeat(100) }, 'b');
    h.undo();
    h.recordPatch({ from: '', to: 'c' }, 'c');
    expect(h.bytes()).toBe(101);
  });
});
