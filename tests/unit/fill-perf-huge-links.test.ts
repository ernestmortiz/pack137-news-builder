/** One paste with very many elements, alone in its file (see perf-shared.ts). */
import { describe, expect, it } from 'vitest';
import type { LinkListForm } from '../../src/core/forms';
import { parse } from '../../src/core/pipeline';
import { SLOW_PARSE, fillsEveryLayout } from './perf-shared';

describe('fill: time limits on a paste with very many elements', () => {
  it('takes a paragraph of many links', SLOW_PARSE, () => {
    const count = 50_000;
    const links = '<a href="https://example.org/a">one</a> '.repeat(count);
    const filled = fillsEveryLayout(parse(`<p>${links}</p>`));
    expect((filled['link-list'].form as LinkListForm).items).toHaveLength(count);
  });
});
