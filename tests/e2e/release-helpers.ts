/**
 * Shared helpers for the Phase 6 release specs. Not a spec file, so Playwright does not run it.
 * `guard` counts every request that does not go to the local preview server (or, for the
 * from-disk spec, to a file) and aborts it. The count must be zero in every test.
 */
import { expect, type BrowserContext, type Page } from '@playwright/test';

export const isLocalHttp = (url: string) =>
  /^(http:\/\/localhost:4173\/|data:|about:|blob:)/.test(url);
export const isFileOrInline = (url: string) => /^(file:\/\/|data:|about:|blob:)/.test(url);

export interface Guard {
  remote: string[];
  errors: string[];
  dialogs: string[];
  watchPage(page: Page): void;
}

/** Aborts and counts remote requests on the whole context, and records errors and dialogs. */
export async function guard(
  context: BrowserContext,
  allowed: (url: string) => boolean = isLocalHttp,
): Promise<Guard> {
  const seen: Guard = {
    remote: [],
    errors: [],
    dialogs: [],
    watchPage(page) {
      page.on('request', (r) => {
        if (!allowed(r.url())) seen.remote.push(`request ${r.url()}`);
      });
      page.on('pageerror', (e) => seen.errors.push(e.message));
      page.on('dialog', (d) => {
        seen.dialogs.push(d.message());
        void d.dismiss();
      });
      page.on('frameattached', (f) => {
        const url = f.url();
        if (url && !allowed(url)) seen.remote.push(`frame ${url}`);
      });
    },
  };
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (allowed(url)) return route.continue();
    seen.remote.push(`route ${url}`);
    return route.abort();
  });
  context.on('request', (r) => {
    if (!allowed(r.url())) seen.remote.push(`context ${r.url()}`);
  });
  context.on('page', (p) => seen.watchPage(p));
  context.on('serviceworker', (w) => seen.remote.push(`serviceworker ${w.url()}`));
  for (const p of context.pages()) seen.watchPage(p);
  return seen;
}

/** Remote hits are de-duplicated by text only for readability; any entry fails the test. */
export function expectClean(seen: Guard) {
  expect(seen.remote).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.dialogs).toEqual([]);
}

export const frame = (page: Page, width: number) =>
  page.locator('#panel-converter').frameLocator(`iframe[title="Preview, ${width} pixels wide"]`);
export const panel = (page: Page) => page.locator('#panel-monthly');
export const letterFrame = (page: Page, width: number) =>
  panel(page).frameLocator(`iframe[title="Preview, ${width} pixels wide"]`);

export const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

export async function openLetter(page: Page) {
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await expect(panel(page).getByRole('heading', { name: 'Edit the letter' })).toBeVisible();
}

export async function noServiceWorkers(page: Page) {
  const count = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 0;
    try {
      return (await navigator.serviceWorker.getRegistrations()).length;
    } catch {
      return 0; // file:// origins refuse service workers outright
    }
  });
  expect(count).toBe(0);
}
