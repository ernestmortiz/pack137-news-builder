import { afterEach, describe, expect, it } from 'vitest';
import type { RichText } from '../../src/core/forms';
import { emptyLetter } from '../../src/core/letter';
import {
  CODES_HINT,
  createCodesPref,
  createCodesSwitch,
  SHOW_CODES_KEY,
} from '../../src/ui/codes-switch';
import { createKit, type FormContext } from '../../src/ui/form-kit';
import { buildLetterForm } from '../../src/ui/letter-view';
import type { KeyValueStore } from '../../src/ui/storage';

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: KeyValueStore = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('quota');
  },
  removeItem() {
    throw new Error('blocked');
  },
};

const ctx: FormContext = {
  checks: () => [],
  suggestions: () => [],
  warnings: () => [],
  typed() {},
  begin() {},
  step() {},
  history() {},
  swapped() {},
  removed() {},
  apply() {},
};

afterEach(() => document.body.replaceChildren());

describe('show codes preference', () => {
  it('is off by default and remembers the choice', () => {
    const mem = memory();
    const pref = createCodesPref(() => mem);
    expect(pref.get()).toBe(false);
    pref.set(true);
    expect(mem.data.get(SHOW_CODES_KEY)).toBe('on');
    expect(createCodesPref(() => mem).get()).toBe(true);
    pref.set(false);
    expect(mem.data.has(SHOW_CODES_KEY)).toBe(false);
    expect(createCodesPref(() => mem).get()).toBe(false);
  });

  it('treats unknown stored text as off', () => {
    const mem = memory();
    mem.data.set(SHOW_CODES_KEY, '<script>');
    expect(createCodesPref(() => mem).get()).toBe(false);
  });

  it('never throws when storage is blocked, and still holds the choice for the visit', () => {
    const pref = createCodesPref(() => throwing);
    expect(pref.get()).toBe(false);
    expect(() => pref.set(true)).not.toThrow();
    expect(pref.get()).toBe(true);
    const none = createCodesPref(() => {
      throw new Error('SecurityError');
    });
    expect(none.get()).toBe(false);
    expect(() => none.set(true)).not.toThrow();
    const missing = createCodesPref(() => undefined);
    missing.set(true);
    expect(missing.get()).toBe(true);
  });

  it('tells listeners, and stops when they unsubscribe', () => {
    const pref = createCodesPref(() => memory());
    const seen: boolean[] = [];
    const stop = pref.subscribe((on) => seen.push(on));
    pref.set(true);
    stop();
    pref.set(false);
    expect(seen).toEqual([true]);
  });
});

describe('the show codes switch', () => {
  it('is a labelled checkbox that follows and sets the shared choice', () => {
    const pref = createCodesPref(() => memory());
    let redraws = 0;
    const sw = createCodesSwitch(() => redraws++, pref);
    document.body.append(sw.element);
    expect(sw.element.querySelector('label')?.textContent).toBe('Show codes');
    expect(sw.element.textContent).toContain(CODES_HINT);
    expect(sw.input.type).toBe('checkbox');
    expect(sw.input.getAttribute('aria-describedby')).toBeTruthy();
    sw.input.click();
    expect(pref.get()).toBe(true);
    expect(redraws).toBe(1);
    pref.set(false);
    expect(sw.input.checked).toBe(false);
    expect(redraws).toBe(2);
  });

  it('starts on when the saved choice is on', () => {
    const mem = memory();
    mem.data.set(SHOW_CODES_KEY, 'on');
    const sw = createCodesSwitch(
      () => {},
      createCodesPref(() => mem),
    );
    expect(sw.input.checked).toBe(true);
  });
});

describe('rich fields follow the setting', () => {
  const field = (codes: boolean) => {
    let value: RichText = [{ kind: 'text', text: 'Hi', marks: ['strong'] }];
    const kit = createKit(ctx, () => codes);
    const node = kit.rich(
      'Body',
      ['b'],
      () => value,
      (v) => (value = v),
    );
    document.body.append(node);
    return { kit, node };
  };

  it('shows the box when codes are off', () => {
    const { node, kit } = field(false);
    expect(node.querySelector('[role=textbox]')).not.toBeNull();
    expect(node.querySelector('textarea')).toBeNull();
    expect(kit.fieldText(['b'])).toBe('**Hi**');
  });

  it('shows typed codes when codes are on', () => {
    const { node, kit } = field(true);
    expect(node.querySelector('textarea')?.value).toBe('**Hi**');
    expect(node.querySelector('[role=textbox]')).toBeNull();
    expect(kit.fieldText(['b'])).toBe('**Hi**');
  });
});

describe('monthly letter form', () => {
  it('reads a rich field through fieldText in both styles, with the same content', () => {
    const letter = emptyLetter({ year: 2026, month: 12 });
    letter.intro = [{ kind: 'text', text: 'Welcome', marks: ['em'] }];
    const boxed = buildLetterForm(letter, ctx, () => false);
    document.body.append(boxed.element);
    const path = ['intro'];
    expect(boxed.fieldControl(path)?.getAttribute('role')).toBe('textbox');
    const inBox = boxed.fieldText(path);
    expect(inBox).toBe('_Welcome_');
    const coded = buildLetterForm(letter, ctx, () => true);
    document.body.append(coded.element);
    expect(coded.fieldControl(path)).toBeInstanceOf(HTMLTextAreaElement);
    expect(coded.fieldText(path)).toBe(inBox);
  });
});
