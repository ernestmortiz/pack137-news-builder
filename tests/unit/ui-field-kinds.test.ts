import { describe, expect, it } from 'vitest';
import { createKit, type FormContext } from '../../src/ui/form-kit';
import { kindOfInputType, markSpelling, spellcheckFor } from '../../src/ui/field-kinds';

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

describe('spellcheckFor', () => {
  it('checks free words only', () => {
    expect(spellcheckFor('text')).toBe(true);
    for (const kind of ['address', 'email', 'url', 'number', 'date', 'time', 'code'] as const) {
      expect(spellcheckFor(kind)).toBe(false);
    }
  });

  it('sets the property explicitly, true or false', () => {
    const a = document.createElement('input');
    const b = document.createElement('input');
    expect(markSpelling(a, 'text').spellcheck).toBe(true);
    expect(markSpelling(b, 'url').spellcheck).toBe(false);
  });

  it('maps input types to kinds', () => {
    expect(kindOfInputType('email')).toBe('email');
    expect(kindOfInputType('url')).toBe('url');
    expect(kindOfInputType('number')).toBe('number');
    expect(kindOfInputType('date')).toBe('date');
    expect(kindOfInputType('time')).toBe('time');
    expect(kindOfInputType('text')).toBe('text');
  });
});

describe('the field factory', () => {
  const kit = createKit(ctx);
  const control = (node: HTMLElement) =>
    node.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  const make = (options: Parameters<typeof kit.text>[4], rows?: number) =>
    control(
      kit.text(
        'Label',
        ['x'],
        () => '',
        () => {},
        { ...options, rows },
      ),
    );

  it('spell checks plain text inputs and text areas', () => {
    expect(make({})?.spellcheck).toBe(true);
    expect(make({}, 3)?.spellcheck).toBe(true);
  });

  it('spell checks rich text fields', () => {
    const rich = control(
      kit.rich(
        'Body',
        ['b'],
        () => [],
        () => {},
      ),
    );
    expect(rich?.spellcheck).toBe(true);
  });

  it('does not spell check links, numbers or other non-word fields', () => {
    expect(make({ url: true })?.spellcheck).toBe(false);
    expect(make({ kind: 'number' })?.spellcheck).toBe(false);
    expect(make({ kind: 'email' })?.spellcheck).toBe(false);
    expect(make({ kind: 'address' })?.spellcheck).toBe(false);
  });
});
