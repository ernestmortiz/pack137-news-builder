import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EM_DASH, lintOutput } from '../../src/core/lint-output';

const weeklyDir = join(__dirname, '../fixtures/weekly');
const monthlyDir = join(__dirname, '../fixtures/monthly');

describe('output linter', () => {
  const weekly = readdirSync(weeklyDir).filter((f) => f.endsWith('.expected.html'));

  it('finds the five approved weekly announcements', () => {
    expect(weekly).toHaveLength(5);
  });

  it.each(weekly)('approved announcement %s meets the output contract', (file) => {
    expect(lintOutput(readFileSync(join(weeklyDir, file), 'utf8'))).toEqual([]);
  });

  it('flags the known defects in the original November letter', () => {
    const problems = lintOutput(readFileSync(join(monthlyDir, '2026-11.original.html'), 'utf8'), {
      monthly: true,
    });
    expect(problems).toContain('contains calc()');
    expect(problems).toContain('link is not absolute: meet.google.com/vgn-rwmf-fmz');
    expect(problems).toContain('image without alt text');
    expect(problems).toContain('layout table with a percentage width other than 100%');
    expect(problems).toContain('contains a class attribute');
    expect(problems).toContain('contains an id attribute');
  });

  it('rejects hostile markup', () => {
    const problems = lintOutput(
      '<a href="javascript:alert(1)" onclick="x()">hi</a><script>1</script>',
    );
    expect(problems).toContain('contains <script>');
    expect(problems).toContain('contains an event handler attribute');
    expect(problems).toContain('link is not absolute: javascript:alert(1)');
  });

  it('rejects colors that are not tokens and em dashes', () => {
    expect(lintOutput(`<p style="color:#FF0000">a ${EM_DASH} b</p>`)).toEqual([
      'contains an em dash',
      'color #FF0000 is not a token',
    ]);
  });
});
