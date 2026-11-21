/** One paste with very many elements, alone in its file (see perf-shared.ts). */
import { describe, expect, it } from 'vitest';
import type { DateListForm } from '../../src/core/forms';
import { parse } from '../../src/core/pipeline';
import { SLOW_PARSE, fillsEveryLayout, LIMIT } from './perf-shared';

describe('fill: time limits on a paste with very many elements', () => {
  it('takes a list of more dated rows than a function call can take arguments', SLOW_PARSE, () => {
    // This one guards against a crash (a spread of 130,000 notes overflowed the call stack), not
    // against slow growth: each row costs about 12 microseconds, so the limit is wider.
    const count = 130_000;
    const parsed = parse(`<ul>${'<li>1/9 x</li>'.repeat(count)}</ul>`);
    const filled = fillsEveryLayout(parsed, 4 * LIMIT);
    expect((filled['date-list'].form as DateListForm).sections[0]?.rows).toHaveLength(count);
    expect(filled['date-list'].checks.filter((c) => c.kind === 'year-assumed')).toHaveLength(count);
  });
});
