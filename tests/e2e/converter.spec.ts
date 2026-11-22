/**
 * Browser end to end tests for the Announcement Converter (build spec 11.3 and 7.5).
 * Every request that is not to the local preview server is aborted and counted. The count must be
 * zero, which also shows that the preview never loads a remote image.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { lintOutput } from '../../src/core/lint-output';

const dir = fileURLToPath(new URL('../fixtures/weekly', import.meta.url));
const input = (name: string) => readFileSync(join(dir, `${name}.input.html`), 'utf8');

/** Each fixture, the layout the tool should suggest, and text the preview must contain. */
const fixtures = [
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

const isLocal = (url: string) => /^(http:\/\/localhost:4173\/|data:|about:|blob:)/.test(url);

interface Watch {
  remote: string[];
  errors: string[];
  dialogs: string[];
}

/** Aborts and counts remote requests, and records page errors and dialogs. */
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

const frame = (page: Page, width: number) =>
  page.frameLocator(`iframe[title="Preview, ${width} pixels wide"]`);

async function paste(page: Page, html: string) {
  await page.goto('/');
  await page.getByLabel('Paste the old HTML here').fill(html);
  await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeVisible();
}

const codeBox = (page: Page) => page.locator('#code-box');
async function showCode(page: Page) {
  if (!(await codeBox(page).isVisible())) await page.getByText('Show the code').click();
}
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test.describe('paste each weekly fixture', () => {
  for (const f of fixtures) {
    test(`${f.name} suggests ${f.layout} and previews it`, async ({ page, context }) => {
      const seen = await watch(context, page);
      await paste(page, input(f.name));
      await expect(page.getByRole('radio', { name: new RegExp(`^${f.layout}`) })).toBeChecked();
      for (const width of [250, 375, 600]) {
        await expect(frame(page, width).locator('body')).toContainText(f.text);
      }
      expect(seen.errors).toEqual([]);
      expect(seen.remote).toEqual([]);
    });
  }
});

test('edit the label, see the preview change, copy exactly the code shown', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await paste(page, input('1-pack-calendar'));
  const label = page.getByLabel('Label (the small tag at the top)');
  await label.fill('Zebra news');
  await expect(frame(page, 375).locator('body')).toContainText('Zebra news');
  await page.getByRole('button', { name: 'Copy new HTML' }).click();
  await expect(page.getByText('Copied', { exact: true })).toBeVisible();
  await showCode(page);
  const shown = await codeBox(page).inputValue();
  expect(shown).toContain('Zebra&nbsp;news');
  expect(await clipboard(page)).toBe(shown);
  expect(lintOutput(shown)).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('switching to Message and back keeps the edited label and the rows', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await paste(page, input('1-pack-calendar'));
  const label = page.getByLabel('Label (the small tag at the top)');
  const events = page.getByLabel('Event', { exact: true });
  await label.fill('Zebra news');
  const before = await events.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(before.length).toBeGreaterThan(5);

  await page.getByRole('radio', { name: /^Message/ }).check();
  await expect(page.getByRole('radio', { name: /^Message/ })).toBeChecked();
  await expect(label).toHaveValue('Zebra news');
  await expect(events).toHaveCount(0);

  await page.getByRole('radio', { name: /^Date list/ }).check();
  await expect(label).toHaveValue('Zebra news');
  const after = await events.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(after).toEqual(before);
  await expect(frame(page, 600).locator('body')).toContainText('Zebra news');
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('start over, confirmed in the page, clears the paste and the form', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await paste(page, input('4-in-the-news'));
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByRole('group', { name: 'Confirm start over' })).toBeVisible();
  // Keeping work leaves everything as it was.
  await page.getByRole('button', { name: 'Keep working' }).click();
  await expect(page.getByLabel('Paste the old HTML here')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByRole('button', { name: 'Yes, start over' }).click();
  await expect(page.getByLabel('Paste the old HTML here')).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeHidden();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy new HTML' })).toBeHidden();
  expect(seen.dialogs).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('a hostile paste runs nothing and gives output that passes the linter', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  const hostile =
    '<img src=x onerror=alert(1)><script>alert(2)</script><a href="javascript:alert(3)">x</a>';
  await paste(page, hostile);
  await page.getByRole('button', { name: 'Copy new HTML' }).click();
  await showCode(page);
  const html = await codeBox(page).inputValue();
  await page.waitForTimeout(500);
  expect(html).not.toBe('');
  expect(lintOutput(html)).toEqual([]);
  expect(html).not.toMatch(/<script|onerror|javascript:|alert\(/i);
  expect(await clipboard(page)).toBe(html);
  expect(seen.dialogs).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('no horizontal page overflow at 360px wide', async ({ page, context }) => {
  const seen = await watch(context, page);
  await page.setViewportSize({ width: 360, height: 800 });
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  await page.goto('/');
  expect(await overflow()).toBeLessThanOrEqual(0);
  await paste(page, input('1-pack-calendar'));
  await expect(frame(page, 600).locator('body')).toContainText('Pinewood Derby');
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(seen.remote).toEqual([]);
});

test('screenshots of the three preview frames for fixture 1', async ({ page, context }) => {
  await watch(context, page);
  await paste(page, input('1-pack-calendar'));
  await expect(frame(page, 600).locator('body')).toContainText('Pinewood Derby');
  for (const width of [250, 375, 600]) {
    const figure = page.locator('figure.preview').filter({ hasText: `${width}px wide` });
    await figure.scrollIntoViewIfNeeded();
    await figure.screenshot({ path: `test-results/screens/1-pack-calendar-${width}.png` });
  }
});

const ownerPaste =
  '<div style="font-family: Arial;"><p style="text-align: left;"><span><strong>The&nbsp;</strong></span><span id="isPasted"><strong>First Presbyterian Church is having Scout Sunday on February 8th, 10am-11am.</strong></span></p><p><span id="isPasted">Even if you are are not members of the First Presbyterian Church, you are encouraged to show up as Scouts in full class A uniform for this event.</span></p><p><span>Please RSVP via the TroopTrack event. If you have questions, please contact Ryan Meier.</span></p><p><span>For the Scouts that attend <strong>St. Michael&#39;s Church</strong>, they are also having a Scout Sunday on <strong>February 1st</strong> at the 9am mass. &nbsp;If you are interested, please signup here: <a target="_blank" rel="noopener noreferrer" data-fr-linked="true" href="https://www.signupgenius.com/go/4090F4CAEAE2AA4F58-61725464-stmichael">https://www.signupgenius.com/go/4090F4CAEAE2AA4F58-61725464-stmichael</a>. &nbsp;If you have any questions, please contact Andy through the SignUp Genius Link.</span></p><p><br></p></div>';

test('the pack calendar with date pills does not widen the 250px or 375px preview', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await paste(page, input('1-pack-calendar'));
  await expect(page.getByRole('radio', { name: /^Date list/ })).toBeChecked();
  for (const width of [250, 375]) {
    const body = frame(page, width).locator('body');
    await expect(body).toContainText('Pinewood Derby');
    // A date pill, in capitals (owner decision 2026-11-22).
    await expect(body).toContainText('SAT FEB 27 TO SUN FEB 28');
    await expect
      .poll(() =>
        body.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(0);
  }
  expect(seen.remote).toEqual([]);
});

for (const layout of ['Message', 'Call to action', 'Date list', 'Help wanted', 'Link list']) {
  test(`a long web address does not widen the 250px or 375px preview: ${layout}`, async ({
    page,
    context,
  }) => {
    const seen = await watch(context, page);
    await paste(page, ownerPaste);
    await page.getByRole('radio', { name: new RegExp(`^${layout}`) }).check();
    await expect(page.getByRole('radio', { name: new RegExp(`^${layout}`) })).toBeChecked();
    for (const width of [250, 375]) {
      const body = frame(page, width).locator('body');
      await expect(body).toContainText('signupgenius');
      await expect
        .poll(() =>
          body.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        )
        .toBeLessThanOrEqual(0);
    }
    expect(seen.remote).toEqual([]);
  });
}
