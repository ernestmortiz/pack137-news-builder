import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RichText } from '../../src/core/forms';
import {
  COMMIT_DELAY_MS,
  createKit,
  type FormContext,
  type TypingEdit,
} from '../../src/ui/form-kit';

function setup(start: RichText = []) {
  const edits: TypingEdit[] = [];
  let history = 0;
  const ctx: FormContext = {
    checks: () => [],
    suggestions: () => [],
    warnings: () => [],
    typed: (edit) => edits.push(edit),
    begin() {},
    step() {},
    history: () => history++,
    swapped() {},
    removed() {},
    apply() {},
  };
  const kit = createKit(ctx);
  let value = start;
  const node = kit.rich(
    'Text of paragraph 1',
    ['p', 0],
    () => value,
    (v) => (value = v),
    3,
    true,
  );
  document.body.append(node);
  const box = node.querySelector('[role=textbox]') as HTMLElement;
  return { kit, box, node, edits, get: () => value, history: () => history };
}

describe('rich text box in the form kit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('is a labelled, multi line, editable text box with a toolbar', () => {
    const s = setup([{ kind: 'text', text: 'Hi', marks: ['strong'] }]);
    expect(s.box.getAttribute('contenteditable')).toBe('true');
    expect(s.box.getAttribute('aria-multiline')).toBe('true');
    const label = s.node.querySelector('label') as HTMLElement;
    expect(s.box.getAttribute('aria-labelledby')).toBe(label.id);
    expect(s.box.querySelector('strong')?.textContent).toBe('Hi');
    expect(s.node.querySelector('[role=toolbar]')).not.toBeNull();
    expect(s.node.textContent).toContain('Select words, then press Bold, Italic, Strike or Link.');
    expect(s.node.querySelector('textarea')).toBeNull();
  });

  it('records typing as code text and commits to the form after a pause', () => {
    const s = setup([{ kind: 'text', text: 'Hi', marks: [] }]);
    s.box.replaceChildren(document.createTextNode('Hi *there'));
    s.box.dispatchEvent(new Event('input', { bubbles: true }));
    expect(s.edits).toHaveLength(1);
    expect(s.edits[0]?.before).toBe('Hi');
    expect(s.edits[0]?.after).toBe('Hi \\*there');
    expect(s.get()).toEqual([{ kind: 'text', text: 'Hi', marks: [] }]);
    vi.advanceTimersByTime(COMMIT_DELAY_MS);
    expect(s.get()).toEqual([{ kind: 'text', text: 'Hi *there', marks: [] }]);
  });

  it('undo puts a value back without redrawing, and the history can read it', () => {
    const s = setup([{ kind: 'text', text: 'Hi', marks: [] }]);
    expect(s.kit.fieldText(['p', 0])).toBe('Hi');
    expect(s.kit.setField(['p', 0], '**Hi**', [0, 2])).toBe(true);
    expect(s.box.querySelector('strong')?.textContent).toBe('Hi');
    expect(s.get()).toEqual([{ kind: 'text', text: 'Hi', marks: ['strong'] }]);
    expect(s.kit.fieldText(['p', 0])).toBe('**Hi**');
    expect(s.kit.fieldControl(['p', 0])).toBe(s.box);
  });

  it('routes the browser undo and redo to the app history', () => {
    const s = setup();
    const event = new Event('beforeinput', { cancelable: true }) as Event & { inputType: string };
    event.inputType = 'historyUndo';
    s.box.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(s.history()).toBe(1);
  });

  it('flushes to the form when the box loses focus', () => {
    const s = setup();
    s.box.replaceChildren(document.createTextNode('abc'));
    s.box.dispatchEvent(new Event('input', { bubbles: true }));
    s.box.dispatchEvent(new Event('blur'));
    expect(s.get()).toEqual([{ kind: 'text', text: 'abc', marks: [] }]);
  });

  it('shows the mailto details for a link in the box', () => {
    const s = setup([{ kind: 'text', text: 'mail', marks: [], href: 'mailto:den@example.org' }]);
    expect(s.node.querySelector('.mailto')?.textContent).toContain('den@example.org');
  });
});
