/**
 * Recorded edits (build spec 11.3, ADR 0005): the pasted input, filled by the tool, plus the edits
 * the owner made by hand, must give the approved form and render to the approved output.
 * The edit counts are a ratchet. They may only go down. If the fill gets better, lower the number
 * here and shorten the edits file. If the fill gets worse, this test fails.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fillForm } from '../../src/core/fill';
import type { AnnouncementForm } from '../../src/core/forms';
import { setAt } from '../../src/core/helpers/paths';
import { lintOutput } from '../../src/core/lint-output';
import type { Layout } from '../../src/core/model';
import { parse } from '../../src/core/pipeline';
import { renderAnnouncement } from '../../src/core/render';

const dir = join(__dirname, '../fixtures/weekly');
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

/** Same rule as render-golden.test.ts (ADR 0005). */
const layoutOnly = (html: string): string => html.replace(/>\s*\n\s*</g, '><').trim();

interface Edit {
  path: (string | number)[];
  value: unknown;
  why: string;
}
interface EditsFile {
  layout: Layout;
  today: string;
  edits: Edit[];
}

/** Current edit counts: all edits, and how many of them are "tool gap". */
const counts: Record<string, { total: number; gaps: number }> = {
  '1-pack-calendar': { total: 13, gaps: 3 },
  '2-help-needed': { total: 9, gaps: 1 },
  '3-year-in-review-photos': { total: 4, gaps: 0 },
  '4-in-the-news': { total: 7, gaps: 0 },
  '5-webelos-dens-10-11': { total: 5, gaps: 3 },
};
const fixtures = Object.keys(counts);

function load(name: string) {
  const file = JSON.parse(read(`${name}.edits.json`)) as EditsFile;
  const [year = 0, month = 0, day = 0] = file.today.split('-').map(Number);
  const parsed = parse(read(`${name}.input.html`));
  const filled = fillForm(parsed, file.layout, {
    today: { year, month, day },
    programYearStartMonth: 9,
  }).form;
  const edited = file.edits.reduce((form, e) => setAt(form, e.path, e.value), filled);
  return { file, parsed, filled, edited };
}

describe('fillForm plus recorded edits: golden fixtures', () => {
  it.each(fixtures)('%s: edits file names the layout the tool suggests', (name) => {
    const { file, parsed } = load(name);
    expect(file.layout).toBe(parsed.suggestion.layout);
  });

  it.each(fixtures)('%s: fill plus edits equals the approved form', (name) => {
    const { edited } = load(name);
    expect(edited).toEqual(JSON.parse(read(`${name}.form.json`)) as AnnouncementForm);
  });

  it.each(fixtures)('%s: the edited form renders to the approved output', (name) => {
    const { edited } = load(name);
    const html = renderAnnouncement(edited);
    expect(layoutOnly(html)).toBe(layoutOnly(read(`${name}.expected.html`)));
    expect(lintOutput(html)).toEqual([]);
  });

  it.each(fixtures)('%s: no more edits than the current count', (name) => {
    const { file } = load(name);
    const max = counts[name];
    expect(max).toBeDefined();
    expect(file.edits.length).toBeLessThanOrEqual(max?.total ?? 0);
    const gaps = file.edits.filter((e) => e.why.startsWith('tool gap')).length;
    expect(gaps).toBeLessThanOrEqual(max?.gaps ?? 0);
    for (const e of file.edits) expect(e.why).toMatch(/^(human copy edit|tool gap): \S/);
  });

  it.each(fixtures)('%s: every edit is needed (it changes the form)', (name) => {
    const { filled, file } = load(name);
    let form = filled;
    for (const e of file.edits) {
      const next = setAt(form, e.path, e.value);
      expect(next, e.why).not.toEqual(form);
      form = next;
    }
  });

  it('the fill alone does not already equal the approved form (the edits are real)', () => {
    for (const name of fixtures) {
      expect(load(name).filled).not.toEqual(JSON.parse(read(`${name}.form.json`)));
    }
  });
});
