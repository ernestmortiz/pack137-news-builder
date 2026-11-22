import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applySuggestion, suggestionsFor } from '../../src/core/fill';
import type { AnnouncementForm } from '../../src/core/forms';
import { itemsFor } from '../../src/ui/paths';

function form(): AnnouncementForm {
  const raw = readFileSync('tests/fixtures/weekly/2-help-needed.form.json', 'utf8');
  return structuredClone(JSON.parse(raw)) as AnnouncementForm;
}

describe('suggestions follow the current form', () => {
  it('appear and disappear as the text is edited and fixes are applied', () => {
    const f = form();
    if (f.layout !== 'help-wanted') throw new Error('fixture should be help-wanted');
    f.ask.title = 'Legal & Finance Help';
    const first = suggestionsFor(f);
    const amp = itemsFor(first, ['ask', 'title']);
    expect(amp.map((s) => s.to)).toContain(' and ');

    const ampFix = amp.find((s) => s.to === ' and ');
    if (!ampFix) throw new Error('no & suggestion');
    const fixed = applySuggestion(f, ampFix);
    if (fixed.layout !== 'help-wanted') throw new Error('layout changed');
    expect(fixed.ask.title).toBe('Legal and Finance Help');
    const next = itemsFor(suggestionsFor(fixed), ['ask', 'title']);
    expect(next.map((s) => s.to)).toEqual(['Legal and finance help']);

    const cased = applySuggestion(fixed, next[0] ?? ampFix);
    if (cased.layout !== 'help-wanted') throw new Error('layout changed');
    expect(cased.ask.title).toBe('Legal and finance help');
    expect(itemsFor(suggestionsFor(cased), ['ask', 'title'])).toEqual([]);

    // One capital typed back in is not Title Case: the writer is using sentence case with a name.
    cased.ask.title = 'Legal and Finance help';
    expect(itemsFor(suggestionsFor(cased), ['ask', 'title'])).toEqual([]);
    // Capitals on every long word bring the suggestion back.
    cased.ask.title = 'Legal and Finance Help';
    expect(itemsFor(suggestionsFor(cased), ['ask', 'title'])).toHaveLength(1);
  });
});
