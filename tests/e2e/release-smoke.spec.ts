/**
 * Release smoke checklist as code. Each of the five weekly fixtures and the November 2026 draft
 * goes through the app end to end at 360 px and 1280 px wide: paste or open, check the preview,
 * copy, lint the copied HTML, and save a screenshot of the 600 px preview to test-results/release/
 * (not committed) for a person to look at. Every test also needs zero remote requests and no
 * page errors.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { lintOutput } from '../../src/core/lint-output';
import {
  clipboard,
  expectClean,
  frame,
  guard,
  letterFrame,
  openLetter,
  panel,
} from './release-helpers';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const shots = fileURLToPath(new URL('../../test-results/release', import.meta.url));
mkdirSync(shots, { recursive: true });

const weekly = [
  { name: '1-pack-calendar', layout: 'Date list', text: 'Pinewood Derby' },
  { name: '2-help-needed', layout: 'Help wanted', text: 'Legal' },
  {
    name: '3-year-in-review-photos',
    layout: 'Call to action',
    text: 'Upload your submissions here',
  },
  { name: '4-in-the-news', layout: 'Link list', text: 'Scouting' },
  { name: '5-webelos-dens-10-11', layout: 'Date list', text: 'Webelos Meeting' },
];
const widths = [360, 1280];

/**
 * Screenshots the 600 px preview. The frame is a fixed 640 px tall inside a scrolling box, so the
 * frame's own document (its srcdoc, which carries its own no-network policy) is shown in a second
 * page 600 px wide and captured whole.
 */
async function shoot(page: Page, scope: Locator, path: string) {
  const srcdoc = await scope
    .locator('iframe[title="Preview, 600 pixels wide"]')
    .getAttribute('srcdoc');
  expect(srcdoc).toBeTruthy();
  const shot = await page.context().newPage();
  await shot.setViewportSize({ width: 600, height: 800 });
  await shot.setContent(srcdoc ?? '');
  await shot.screenshot({ path, fullPage: true });
  await shot.close();
}

async function noOverflow(page: Page) {
  const o = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(o.doc).toBeLessThanOrEqual(0);
  expect(o.body).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

for (const width of widths) {
  for (const f of weekly) {
    test(`weekly ${f.name} at ${width}px`, async ({ page, context }) => {
      const seen = await guard(context);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const html = readFileSync(join(fixtures, 'weekly', `${f.name}.input.html`), 'utf8');
      await page.getByLabel('Paste the old HTML here').fill(html);
      await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeVisible();
      await expect(page.getByRole('radio', { name: new RegExp(`^${f.layout}`) })).toBeChecked();
      for (const w of [360, 390, 600]) {
        await expect(frame(page, w).locator('body')).toContainText(f.text);
      }
      await page.getByRole('button', { name: 'Copy new HTML' }).click();
      await expect(page.getByText('Copied', { exact: true })).toBeVisible();
      const copied = await clipboard(page);
      expect(copied).toContain(f.text.split(' ')[0]);
      expect(lintOutput(copied)).toEqual([]);
      await noOverflow(page);
      await shoot(
        page,
        page.locator('#panel-converter'),
        join(shots, `weekly-${f.name}-${width}.png`),
      );
      expectClean(seen);
    });
  }

  test(`monthly November 2026 draft at ${width}px`, async ({ page, context }) => {
    const seen = await guard(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await openLetter(page);
    const letter = JSON.parse(
      readFileSync(join(fixtures, 'monthly', '2026-11.draft.json'), 'utf8'),
    );
    const file = JSON.stringify({
      kind: 'pack137-letter-draft',
      version: 1,
      savedAt: '2026-11-21T12:00:00.000Z',
      letter,
    });
    await panel(page)
      .getByLabel('Choose a draft file to open')
      .setInputFiles({ name: 'nov.json', mimeType: 'application/json', buffer: Buffer.from(file) });
    const open = panel(page).getByRole('button', {
      name: /^(Open this draft|Use the settings from this draft)$/,
    });
    await open.first().click();
    await expect(panel(page).getByLabel('Summary line', { exact: true })).toHaveValue(
      'Fall camping at Watchung and a big month around the pack.',
    );
    for (const w of [360, 390, 600]) {
      await expect(letterFrame(page, w).locator('body')).toContainText('Fall camping at Watchung');
    }
    await expect(letterFrame(page, 600).locator('body')).toContainText('November 2026');
    await panel(page).getByRole('button', { name: 'Copy letter HTML' }).click();
    await expect(panel(page).getByText('Copied', { exact: true })).toBeVisible();
    const copied = await clipboard(page);
    expect(copied).toContain('Fall camping at Watchung');
    expect(lintOutput(copied, { monthly: true })).toEqual([]);
    await noOverflow(page);
    await shoot(page, panel(page), join(shots, `monthly-2026-11-${width}.png`));
    expectClean(seen);
  });
}
