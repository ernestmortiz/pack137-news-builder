/**
 * Browser check with generated pastes (tests/fuzz/generate.ts). Fifteen fixed seeds are pasted into
 * the running app. For each: no page error, no dialog, no remote request (every request that is not
 * to the local preview server is aborted and counted) and the copied HTML passes the output linter.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { lintOutput } from '../../src/core/lint-output';
import { describeCase, generatePaste } from '../fuzz/generate';

/** Spread over every paste shape; some carry hostile bits; each must hold some content, or the app shows no form. Changing the generator changes these. */
const SEEDS = [1, 2, 3, 5, 8, 11, 18, 23, 42, 64, 99, 137, 256, 420, 1001];

const isLocal = (url: string) => /^(http:\/\/localhost:4173\/|data:|about:|blob:)/.test(url);

interface Watch {
  remote: string[];
  errors: string[];
  dialogs: string[];
}

async function watch(context: BrowserContext, page: Page): Promise<Watch> {
  const seen: Watch = { remote: [], errors: [], dialogs: [] };
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (isLocal(url)) return route.continue();
    seen.remote.push(url);
    return route.abort();
  });
  page.on('pageerror', (e) => seen.errors.push(e.message));
  page.on('dialog', (d) => {
    seen.dialogs.push(d.message());
    void d.dismiss();
  });
  return seen;
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

for (const seed of SEEDS) {
  test(`generated paste, seed ${seed}`, async ({ page, context }) => {
    const paste = generatePaste(seed);
    const seen = await watch(context, page);
    await page.goto('/');
    await page.getByLabel('Paste the old HTML here').fill(paste);
    await expect(
      page.getByRole('heading', { name: 'Edit the announcement' }),
      describeCase(seed, paste),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Copy new HTML' }).click();
    await expect(page.getByText('Copied', { exact: true })).toBeVisible();
    const html = await page.evaluate(() => navigator.clipboard.readText());
    // Give any script that slipped through time to run before the checks.
    await page.waitForTimeout(300);

    const note = describeCase(seed, paste);
    expect(html, note).not.toBe('');
    expect(lintOutput(html), note).toEqual([]);
    expect(html, note).not.toMatch(/<script|onerror|javascript:|data:text/i);
    expect(seen.dialogs, note).toEqual([]);
    expect(seen.errors, note).toEqual([]);
    expect(seen.remote, note).toEqual([]);
  });
}
