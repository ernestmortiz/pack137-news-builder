/**
 * The built app opened from disk (file://), with every non-file request aborted and counted.
 * The webServer in playwright.config.ts runs `npm run build` first, so dist/ is current.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { lintOutput } from '../../src/core/lint-output';
import {
  clipboard,
  expectClean,
  frame,
  guard,
  isFileOrInline,
  noServiceWorkers,
  openLetter,
  panel,
} from './release-helpers';

const root = fileURLToPath(new URL('../..', import.meta.url));
const indexUrl = `file://${join(root, 'dist', 'index.html')}`;
const input = readFileSync(join(root, 'tests/fixtures/weekly/1-pack-calendar.input.html'), 'utf8');

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('dist/index.html opened from disk works, saves and copies with no remote requests', async ({
  page,
  context,
}) => {
  expect(existsSync(join(root, 'dist', 'index.html'))).toBe(true);
  const seen = await guard(context, isFileOrInline);
  await page.goto(indexUrl);

  // All three tabs show.
  for (const name of ['Weekly announcement', 'Monthly letter', 'Settings']) {
    await expect(page.getByRole('tab', { name })).toBeVisible();
  }

  // The converter fills the form and the preview.
  await page.getByLabel('Paste the old HTML here').fill(input);
  await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeVisible();
  // A file:// page has its own empty storage, so it opens on the card. This test reads the form.
  await expect(page.getByRole('button', { name: 'Edit on the card' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Edit in the form' }).click();
  await expect(page.getByRole('radio', { name: /^Date list/ })).toBeChecked();
  await expect(page.getByLabel('Event', { exact: true }).first()).toBeVisible();
  for (const width of [320, 375, 600]) {
    await expect(frame(page, width).locator('body')).toContainText('Pinewood Derby');
  }
  await page.getByRole('button', { name: 'Copy new HTML' }).click();
  await expect(page.getByText('Copied', { exact: true })).toBeVisible();
  const converted = await clipboard(page);
  expect(converted).toContain('Pinewood');
  expect(lintOutput(converted)).toEqual([]);

  // The letter autosaves.
  await openLetter(page);
  await panel(page).getByLabel('Summary line', { exact: true }).fill('From disk summary');
  await expect(panel(page).getByText(/^Saved on this device at /)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Copy letter HTML' }).click();
  await expect(panel(page).getByText('Copied', { exact: true })).toBeVisible();
  const letter = await clipboard(page);
  expect(letter).toContain('From disk summary');
  expect(lintOutput(letter, { monthly: true })).toEqual([]);

  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(
    page.locator('#panel-settings').getByRole('heading', { name: 'Settings' }),
  ).toBeVisible();

  await noServiceWorkers(page);
  expectClean(seen);
});
