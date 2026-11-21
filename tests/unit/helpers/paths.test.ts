import { describe, expect, it } from 'vitest';
import type { DateListForm } from '../../../src/core/forms';
import { formFields, getAt, hasPath, setAt } from '../../../src/core/helpers/paths';

const form: DateListForm = {
  layout: 'date-list',
  label: '',
  title: 'T',
  sections: [
    {
      name: 'S',
      style: 'plain',
      subtitle: '',
      rows: [{ event: 'E', url: 'https://x.test/', tags: [], note: [] }],
    },
  ],
};

describe('field paths', () => {
  it('resolves real fields only', () => {
    expect(getAt(form, ['sections', 0, 'rows', 0, 'event'])).toBe('E');
    expect(hasPath(form, ['label'])).toBe(true);
    expect(hasPath(form, ['sections', 0, 'rows', 0, 'note'])).toBe(true);
    expect(hasPath(form, ['sections', 0, 'rows', 0, 'date'])).toBe(false);
    expect(hasPath(form, ['sections', 1])).toBe(false);
    expect(hasPath(form, ['constructor'])).toBe(false);
    expect(hasPath(form, [])).toBe(false);
  });

  it('sets a value on a copy', () => {
    const next = setAt(form, ['sections', 0, 'rows', 0, 'event'], 'New');
    expect(getAt(next, ['sections', 0, 'rows', 0, 'event'])).toBe('New');
    expect(form.sections[0]?.rows[0]?.event).toBe('E');
  });

  it('lists text and link fields, not choices', () => {
    const fields = formFields(form).map((f) => `${f.path.join('.')}:${f.kind}`);
    expect(fields).toContain('sections.0.rows.0.url:url');
    expect(fields).toContain('sections.0.name:text');
    expect(fields).not.toContain('layout:text');
    expect(fields).not.toContain('sections.0.style:text');
  });
});

describe('setAt with a hostile path', () => {
  const HOSTILE = ['__proto__', 'constructor', 'prototype'];

  it('changes nothing when the last key is __proto__, constructor or prototype', () => {
    for (const key of HOSTILE) {
      const next = setAt(form, [key], { polluted: 'yes' });
      expect(next).toEqual(form);
      expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(next, key)).toBe(false);
      expect((next as unknown as Record<string, unknown>).polluted).toBeUndefined();
    }
  });

  it('changes nothing when such a key is anywhere in the path', () => {
    const paths: (string | number)[][] = [
      ['__proto__', 'polluted'],
      ['constructor', 'prototype', 'polluted'],
      ['sections', '__proto__', 'polluted'],
      ['sections', 0, 'constructor', 'polluted'],
      ['sections', 0, 'rows', 0, '__proto__'],
      ['sections', 0, 'rows', 'constructor'],
      ['sections', 0, 'prototype', 'event'],
    ];
    for (const path of paths) {
      const next = setAt(form, path, 'yes');
      expect(next).toEqual(form);
      expect(next).not.toBe(form);
      expect(Array.isArray(next.layout === 'date-list' && next.sections)).toBe(true);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(([] as unknown as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('still sets an ordinary field, and one the form does not have yet', () => {
    const next = setAt(form, ['sections', 0, 'rows', 0, 'date'], {
      start: { year: 2026, month: 12, day: 6 },
    });
    expect(getAt(next, ['sections', 0, 'rows', 0, 'date'])).toEqual({
      start: { year: 2026, month: 12, day: 6 },
    });
  });
});
