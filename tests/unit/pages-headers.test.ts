/**
 * The hosted site's headers (scripts/pages-headers.mjs) must carry the page's own policy, add the
 * frame protection a meta tag cannot give, and refuse to publish a page that lost its no-network
 * rule. The browser suite runs against these headers too (npm run e2e:pages).
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module without types
import { headersFile, pagePolicy } from '../../scripts/pages-headers.mjs';

const policy =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'";

function distWith(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pages-headers-'));
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><head><meta\n      http-equiv="Content-Security-Policy"\n      content="${content}"\n    /></head>`,
  );
  return dir;
}

describe('hosted site headers', () => {
  it('reuses the page policy and adds frame-ancestors', () => {
    const dir = distWith(policy);
    expect(pagePolicy(dir)).toBe(policy);
    const text = headersFile(dir) as string;
    expect(text.startsWith('/*\n')).toBe(true);
    expect(text).toContain(`  Content-Security-Policy: ${policy}; frame-ancestors 'self'\n`);
    expect(text).toContain('  X-Content-Type-Options: nosniff\n');
    expect(text).toContain('  X-Frame-Options: SAMEORIGIN\n');
    expect(text).toContain('  Referrer-Policy: no-referrer\n');
  });

  it('refuses a page without the no-network rule', () => {
    const dir = distWith("default-src 'none'; connect-src 'self'");
    expect(() => headersFile(dir)).toThrow(/connect-src 'none'/);
  });

  it('refuses a page with no policy tag', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pages-headers-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
    expect(() => pagePolicy(dir)).toThrow(/No Content Security Policy/);
  });
});
