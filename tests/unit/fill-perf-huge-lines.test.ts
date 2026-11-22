/** One paste with very many elements, alone in its file (see perf-shared.ts). */
import { describe, expect, it } from 'vitest';
import type { DateListForm } from '../../src/core/forms';
import { parse } from '../../src/core/pipeline';
import { SLOW_PARSE, fillsEveryLayout } from './perf-shared';

describe('fill: time limits on a paste with very many elements', () => {
  it('takes a paragraph of many short lines under one dated row', SLOW_PARSE, () => {
    const lines = 'Dec 8 Hike' + '<br>bring water'.repeat(100_000);
    const parsed = parse(`<p>${lines}</p>`);
    const filled = fillsEveryLayout(parsed);
    const row = (filled['date-list'].form as DateListForm).sections[0]?.rows[0];
    expect(row?.event).toBe('Hike');
    expect(row?.note.filter((r) => r.kind === 'break')).toHaveLength(99_999);
  });
});
