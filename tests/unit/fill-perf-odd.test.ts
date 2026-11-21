/**
 * The odd-character time limits, kept in their own file so each 2 MB case runs in a fresh
 * worker: in one file with the other 2 MB cases the worker came close to its memory limit and
 * garbage collection made a 140 ms fill take 14.8 s on CI.
 */
/**
 * Time limits for the fill stage, the rich text markup and the renderer on hostile input.
 *
 * Each input below once took time that grew with the square of its length (a regex that rescans
 * the text from every position, or a loop that rescans it for every match), which froze the tab.
 * The inputs are sized at the 2 MB paste limit (MAX_PASTE_BYTES in src/ui/converter.ts), in one
 * list item, and every layout is filled, since the user may pick any of them.
 *
 * Only the time of the stage under test is measured. Parsing has its own limits in
 * sanitize.test.ts and hostile-input.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { fillForm, type FillOptions, type FillResult } from '../../src/core/fill';
import type { DateListForm } from '../../src/core/forms';
import { cleanOddRich, cleanOddText } from '../../src/core/helpers/odd-characters';
import type { Layout } from '../../src/core/model';
import { parse, type ParseResult } from '../../src/core/pipeline';
import { budget } from './budget';

/** The paste limit: the converter refuses anything larger. */
const PASTE_CAP = 2 * 1024 * 1024;
/** Every stage under test must finish a paste of that size within this many milliseconds. */
const LIMIT = 1500;
/**
 * A paste of very many elements takes the parser several seconds here (it is not under test in
 * this file), so those tests get a longer test timeout than the default 5 seconds.
 */
const SLOW_PARSE = { timeout: budget(30_000) };

const OPTIONS: FillOptions = {
  today: { year: 2026, month: 11, day: 21 },
  programYearStartMonth: 9,
};
const LAYOUTS: Layout[] = ['message', 'call-to-action', 'link-list', 'date-list', 'help-wanted'];

/** `unit` repeated until the result is `length` characters long. */
function fill(unit: string, length: number): string {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

/** A list of three dated rows. The third holds the hostile text. */
function dateList(third: string): ParseResult {
  return parse(`<ul><li>Dec 6 Meeting</li><li>Dec 7 Hike</li><li>${third}</li></ul>`);
}

function timed<T>(run: () => T): { result: T; elapsed: number } {
  const started = performance.now();
  const result = run();
  return { result, elapsed: performance.now() - started };
}

/** Fills every layout from one parsed paste and checks each against the limit. */
function fillsEveryLayout(parsed: ParseResult, limit = LIMIT): Record<Layout, FillResult> {
  const out: Partial<Record<Layout, FillResult>> = {};
  for (const layout of LAYOUTS) {
    const { result, elapsed } = timed(() => fillForm(parsed, layout, OPTIONS));
    expect(elapsed, `fillForm as ${layout}`).toBeLessThan(budget(limit));
    out[layout] = result;
  }
  return out as Record<Layout, FillResult>;
}

function thirdRow(result: FillResult) {
  const row = (result.form as DateListForm).sections[0]?.rows[2];
  if (row === undefined) throw new Error('the third row is missing');
  return row;
}

describe('odd characters: time limits at the 2 MB paste limit', () => {
  const cp = (...codes: number[]) => String.fromCodePoint(...codes);
  const ZWSP = cp(0x200b);
  const ZWJ = cp(0x200d);
  const BULLET = cp(0x2022);
  const STAR = cp(0x2605);
  const WOMAN = cp(0x1f469);

  /** Hostile shapes: each one is a long run that a careless scan would read again and again. */
  const shapes: [string, string][] = [
    ['invisible characters only', fill(ZWSP, PASTE_CAP)],
    ['bullets and spaces only', fill(`${BULLET} `, PASTE_CAP)],
    ['a word, then stars to the end', 'Hike ' + fill(`${STAR} `, PASTE_CAP)],
    ['stars between words, never at an end', fill(`a ${STAR} `, PASTE_CAP) + 'a'],
    ['a word with a joiner after every letter', fill(`a${ZWJ}`, PASTE_CAP)],
    ['one emoji of a million joined parts', fill(`${WOMAN}${ZWJ}`, PASTE_CAP)],
    ['a million short lines that each start with a bullet', fill(`${BULLET} a\n`, PASTE_CAP)],
    ['spaces, then a bullet at the very end', fill(' ', PASTE_CAP) + BULLET],
    ['invisible characters, then one letter', fill(ZWSP, PASTE_CAP) + 'a'],
  ];

  it.each(shapes)('cleans plain text: %s', (_name, text) => {
    const { result, elapsed } = timed(() => cleanOddText(text));
    expect(elapsed).toBeLessThan(budget(LIMIT));
    expect(result.text.length).toBeLessThanOrEqual(text.length);
    expect(result.text).not.toContain(ZWSP);
  });

  it.each(shapes)('cleans rich text in one run and in many runs: %s', (_name, text) => {
    const one = timed(() => cleanOddRich([{ kind: 'text', text, marks: [] }]));
    expect(one.elapsed).toBeLessThan(budget(LIMIT));
    // The same text cut into runs of seven characters, with a line break after every hundredth.
    const runs: Parameters<typeof cleanOddRich>[0] = [];
    for (let at = 0, n = 0; at < text.length; at += 7, n++) {
      runs.push({ kind: 'text', text: text.slice(at, at + 7), marks: [] });
      if (n % 100 === 99) runs.push({ kind: 'break' });
    }
    const many = timed(() => cleanOddRich(runs));
    expect(many.elapsed).toBeLessThan(budget(LIMIT));
  });

  it('fills every layout from a row of 2 MB of odd characters', SLOW_PARSE, () => {
    for (const third of [
      'Dec 8 Hike ' + fill(`${STAR} ${ZWSP}`, PASTE_CAP),
      fill(`${BULLET}${ZWSP} `, PASTE_CAP) + 'Dec 8 Hike',
      'Dec 8 ' + fill(`Hike${ZWSP} ${STAR} `, PASTE_CAP),
    ]) {
      const filled = fillsEveryLayout(dateList(third));
      const row = thirdRow(filled['date-list']);
      expect(row.date?.start).toEqual({ year: 2026, month: 12, day: 8 });
      expect(row.event.startsWith('Hike')).toBe(true);
      expect(JSON.stringify(filled['date-list'].form)).not.toContain(ZWSP);
      const odd = filled['date-list'].checks.filter((c) => c.kind === 'odd-characters');
      expect(odd.map((c) => c.path.join('.'))).toEqual(['sections.0.rows.2.event']);
    }
  });

  it('fills a paste of very many short lines that each start with a bullet', SLOW_PARSE, () => {
    const lines = 20_000;
    const parsed = parse('<p>' + `${BULLET} Dec 8 Hike ${STAR}<br>`.repeat(lines) + '</p>');
    const filled = fillsEveryLayout(parsed);
    const form = filled['date-list'].form as DateListForm;
    expect(form.sections[0]?.rows).toHaveLength(lines);
    expect(filled['date-list'].checks.filter((c) => c.kind === 'odd-characters')).toHaveLength(
      lines,
    );
  });
});
