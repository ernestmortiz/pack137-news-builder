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
