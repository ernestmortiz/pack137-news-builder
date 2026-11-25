/**
 * ADR 0004, Phase 6 real-browser check: no request leaves the device, whatever is pasted or typed.
 * Remote resources are pasted into the converter and typed into a letter rich text field and a
 * letter photo address, with the preview frames open and Copy pressed. Any request to a host other
 * than localhost fails the test. That is counted three ways: page.on('request'), context routing
 * and a scan of every frame, and service workers are checked as well.
 */
import { expect, test } from '@playwright/test';
import { lintOutput } from '../../src/core/lint-output';
import {
  clipboard,
  expectClean,
  frame,
  guard,
  letterFrame,
  noServiceWorkers,
  openLetter,
  panel,
} from './release-helpers';

const remote =
  '<img src="https://example.org/a.png"><link rel=stylesheet href="https://example.org/x.css">' +
  '<iframe src="https://example.org/"></iframe><video src="https://example.org/v.mp4"></video>' +
  '<object data="https://example.org/o"></object>' +
  '<a href="https://example.org/p" ping="https://example.org/ping">x</a>';

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('remote resources pasted or typed never cause a request to another host', async ({
  page,
  context,
}) => {
  const seen = await guard(context);
  await page.goto('/');

  // Converter: paste, open every preview, copy.
  await page.getByLabel('Paste the old HTML here').fill(`<p>Hello there</p>${remote}`);
  await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeVisible();
  for (const width of [320, 375, 600]) {
    await expect(frame(page, width).locator('body')).toContainText('Hello there');
  }
  await page.getByRole('button', { name: 'Copy new HTML' }).click();
  await expect(page.getByText('Copied', { exact: true })).toBeVisible();
  const converted = await clipboard(page);
  expect(converted).not.toMatch(/<(iframe|video|object|link|script)\b|<a\b[^>]*\sping=/i);
  expect(lintOutput(converted)).toEqual([]);

  // Letter: the same text in a rich text field and in a photo address, plus a real image address.
  await openLetter(page);
  await panel(page).getByLabel('Intro paragraph', { exact: true }).fill(remote);
  for (const address of [remote, 'https://example.org/a.png']) {
    await panel(page)
      .getByLabel('Kind of block to add')
      .selectOption({ label: 'Photo: One picture with a caption' });
    await panel(page)
      .locator('section.letter-section')
      .filter({ has: page.getByRole('heading', { name: 'Feature story', exact: true }) })
      .getByRole('button', { name: 'Add block', exact: true })
      .click();
    await panel(page).getByLabel('Photo description (required)').last().fill(address);
  }
  for (const width of [320, 375, 600]) {
    await expect(letterFrame(page, width).locator('body')).toContainText('Hi Pack 137 families,');
    await expect(
      panel(page).locator(`iframe[title="Preview, ${width} pixels wide"]`),
    ).toBeVisible();
  }
  await panel(page).getByRole('button', { name: 'Copy letter HTML' }).click();
  await expect(panel(page).getByText('Copied', { exact: true })).toBeVisible();
  const letter = await clipboard(page);
  expect(letter).not.toMatch(/<(iframe|video|object|link|script)\b|<a\b[^>]*\sping=/i);
  expect(lintOutput(letter, { monthly: true })).toEqual([]);

  // Give any late load a chance, then check every frame in the page.
  await page.waitForTimeout(1000);
  for (const f of page.frames()) {
    const url = f.url();
    expect(url === '' || /^(http:\/\/localhost:4173\/|about:|data:)/.test(url)).toBe(true);
  }
  expect(await page.locator('iframe').count()).toBeGreaterThanOrEqual(3);
  await noServiceWorkers(page);
  expect(context.serviceWorkers()).toEqual([]);
  expectClean(seen);
});

test('canary: the watcher does record a remote request, so zero means zero', async ({
  page,
  context,
}) => {
  const seen = await guard(context);
  await page.goto('/');
  await page.evaluate(() => {
    const img = document.createElement('img');
    img.src = 'https://example.org/canary.png';
    document.body.append(img);
  });
  await expect.poll(() => seen.remote.length).toBeGreaterThan(0);
  expect(seen.remote.join(' ')).toContain('https://example.org/canary.png');
});
