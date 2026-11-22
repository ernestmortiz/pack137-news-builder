/**
 * Shared setup for the time-limit tests on pastes with very many elements. Each such paste runs
 * in its own test file, so each gets a fresh worker: the test DOM keeps every parsed document in
 * memory, and three in one worker pushed it near its memory limit, where garbage collection made a
 * 140 ms fill take 14.8 s on CI.
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
import { expect } from 'vitest';
import { fillForm, type FillOptions, type FillResult } from '../../src/core/fill';
import type { Layout } from '../../src/core/model';
import type { ParseResult } from '../../src/core/pipeline';
import { budget } from './budget';

/** Every stage under test must finish a paste of that size within this many milliseconds. */
export const LIMIT = 1500;
/**
 * A paste of very many elements takes the parser several seconds here (it is not under test in
 * this file), so those tests get a longer test timeout than the default 5 seconds.
 */
export const SLOW_PARSE = { timeout: budget(30_000) };

export const OPTIONS: FillOptions = {
  today: { year: 2026, month: 11, day: 21 },
  programYearStartMonth: 9,
};
export const LAYOUTS: Layout[] = [
  'message',
  'call-to-action',
  'link-list',
  'date-list',
  'help-wanted',
];

export function timed<T>(run: () => T): { result: T; elapsed: number } {
  const started = performance.now();
  const result = run();
  return { result, elapsed: performance.now() - started };
}

/** Fills every layout from one parsed paste and checks each against the limit. */
export function fillsEveryLayout(parsed: ParseResult, limit = LIMIT): Record<Layout, FillResult> {
  const out: Partial<Record<Layout, FillResult>> = {};
  for (const layout of LAYOUTS) {
    const { result, elapsed } = timed(() => fillForm(parsed, layout, OPTIONS));
    expect(elapsed, `fillForm as ${layout}`).toBeLessThan(budget(limit));
    out[layout] = result;
  }
  return out as Record<Layout, FillResult>;
}
