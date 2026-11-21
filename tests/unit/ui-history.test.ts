import { describe, expect, it } from 'vitest';
import { createHistory, MAX_STEPS } from '../../src/ui/history';

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
