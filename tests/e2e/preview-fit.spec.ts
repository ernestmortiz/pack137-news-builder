/** Preview frames shrink to fit a narrow column instead of scrolling sideways (build spec 7.5). */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const input = readFileSync('tests/fixtures/weekly/1-pack-calendar.input.html', 'utf8');

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  await page.getByLabel('Paste the old HTML here').fill(input);
  await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeVisible();
  const iframe = page.locator('iframe[title="Preview, 600 pixels wide"]');
  await expect(iframe.contentFrame().locator('body')).toContainText('Pinewood Derby');
  return iframe;
}

test('1000px wide: desktop preview is scaled to fit, no sideways scroll', async ({ page }) => {
  const iframe = await open(page, 1000);
  const scroll = page.locator('.frame-scroll').filter({ has: iframe });
  await scroll.scrollIntoViewIfNeeded();
  const m = await scroll.evaluate((s) => ({
    scrollWidth: s.scrollWidth,
    clientWidth: s.clientWidth,
    right: s.getBoundingClientRect().right,
    frameRight: (s.querySelector('iframe') as HTMLElement).getBoundingClientRect().right,
  }));
  expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
  expect(m.frameRight).toBeLessThanOrEqual(m.right);
  expect(
    await iframe
      .contentFrame()
      .locator('body')
      .evaluate(() => document.documentElement.clientWidth),
  ).toBe(600);
  const figure = page.locator('figure.preview').filter({ has: iframe });
  expect(Number(await figure.getAttribute('data-scale'))).toBeLessThan(1);
  await expect(figure.locator('figcaption')).toHaveText(
    'Desktop: 600px wide (shown smaller to fit)',
  );
  await page.screenshot({ path: '/tmp/claude-0/ui-shots/preview-fit-1000.png' });
});

test('1600px wide: desktop preview is not scaled', async ({ page }) => {
  const iframe = await open(page, 1600);
  const figure = page.locator('figure.preview').filter({ has: iframe });
  expect(await figure.getAttribute('data-scale')).toBe('1');
  await expect(figure.locator('figcaption')).toHaveText('Desktop: 600px wide');
});
