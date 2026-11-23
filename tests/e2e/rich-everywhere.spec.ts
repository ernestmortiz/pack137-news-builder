/**
 * Browser tests for step 2 of docs/plans/rich-editing.md: every rich text field is a box, in both
 * screens, and one "Show codes" switch per screen turns the typed codes back on. Same watch as the
 * other specs: every non-local request is aborted and counted, and dialogs and page errors are
 * recorded.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const dir = fileURLToPath(new URL('../fixtures/weekly', import.meta.url));
const calendar = readFileSync(join(dir, '1-pack-calendar.input.html'), 'utf8');
const DEN15 =
  '<p>Den Meeting on Dec 16th - <a href="https://example.org/a">see the plan</a> and bring a chair</p>';

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

const weekly = (page: Page) => page.locator('#panel-converter');
const monthly = (page: Page) => page.locator('#panel-monthly');
const weeklyFrame = (page: Page, width: number) =>
  weekly(page).frameLocator(`iframe[title="Preview, ${width} pixels wide"]`);
const letterFrame = (page: Page, width: number) =>
  monthly(page).frameLocator(`iframe[title="Preview, ${width} pixels wide"]`);
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function paste(page: Page, html: string) {
  await page.goto('/');
  await weekly(page).getByLabel('Paste the old HTML here').fill(html);
  await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeVisible();
}

async function openLetter(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await expect(monthly(page).getByRole('heading', { name: 'Edit the letter' })).toBeVisible();
}

/** Selects the first word of a box and makes it bold with Ctrl+B. */
async function boldFirstWord(page: Page, box: ReturnType<Page['locator']>) {
  await box.focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+Shift+ArrowRight');
  await page.keyboard.press('Control+b');
}

test('Date list: bold in a row note reaches the preview and undo reverts it', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await paste(page, calendar);
  await expect(weekly(page).getByRole('radio', { name: /^Date list/ })).toBeChecked();
  await expect(weekly(page).locator('textarea.rich')).toHaveCount(0);
  const note = weekly(page)
    .getByRole('textbox', { name: /^Note/ })
    .filter({ hasText: /\w/ })
    .first();
  await expect(note).toBeVisible();
  const strong = weeklyFrame(page, 375).locator('strong');
  const before = await strong.count();
  await boldFirstWord(page, note);
  await expect(note.locator('strong')).toHaveCount(1);
  await expect(strong).toHaveCount(before + 1);
  await page.keyboard.press('Control+z');
  await expect(note.locator('strong')).toHaveCount(0);
  await expect(strong).toHaveCount(before);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('Monthly letter: the box edits, undo works, it saves and a reload restores it', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await openLetter(page);
  await expect(monthly(page).locator('textarea.rich')).toHaveCount(0);
  const intro = monthly(page).getByRole('textbox', { name: 'Intro paragraph' });
  await intro.click();
  await page.keyboard.type('Welcome to a busy month');
  await boldFirstWord(page, intro);
  await expect(intro.locator('strong')).toHaveText(/^Welcome/);
  await expect(letterFrame(page, 600).locator('strong', { hasText: 'Welcome' })).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(intro.locator('strong')).toHaveCount(0);
  await expect(letterFrame(page, 600).locator('strong', { hasText: 'Welcome' })).toHaveCount(0);
  await expect(intro).toContainText('Welcome to a busy month');
  await page.keyboard.press('Control+Shift+z');
  await expect(intro.locator('strong')).toHaveCount(1);
  await expect(monthly(page).getByText(/^Saved on this device at /)).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await monthly(page)
    .getByRole('button', { name: /^Keep working on the / })
    .click();
  const back = monthly(page).getByRole('textbox', { name: 'Intro paragraph' });
  await expect(back).toContainText('Welcome to a busy month');
  await expect(back.locator('strong')).toHaveText(/^Welcome/);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('Show codes: typed codes appear, edits carry over, the box shows the result, and it is remembered', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await paste(page, DEN15);
  await weekly(page)
    .getByRole('radio', { name: /^Message/ })
    .check();
  const box = weekly(page).getByRole('textbox', { name: /^Text of paragraph 1/ });
  await boldFirstWord(page, box);
  await expect(box.locator('strong')).toHaveCount(1);
  const preview = weeklyFrame(page, 375).locator('body');
  const textBefore = await preview.innerText();

  // On: the same text, as typed codes. Focus stays on the switch.
  const sw = weekly(page).getByRole('checkbox', { name: 'Show codes' });
  await expect(
    weekly(page).getByText('Type **bold**, _italic_ and [link text](https://...)'),
  ).toBeVisible();
  await expect(sw).not.toBeChecked();
  await sw.check();
  await expect(sw).toBeFocused();
  const area = weekly(page).getByRole('textbox', { name: /^Text of paragraph 1/ });
  await expect(area).toHaveValue(/^\*\*Den\*\* /);
  await expect(weekly(page).locator('[role=textbox][contenteditable]')).toHaveCount(0);
  expect(await preview.innerText()).toBe(textBefore);

  // Edit a code, then go back to the box.
  await area.fill('**Den** Meeting on _Dec 16th_ with a new ending');
  await expect(preview).toContainText('with a new ending');
  await sw.uncheck();
  await expect(sw).toBeFocused();
  const boxAgain = weekly(page).getByRole('textbox', { name: /^Text of paragraph 1/ });
  await expect(boxAgain).toHaveAttribute('contenteditable', 'true');
  await expect(boxAgain).toHaveText('Den Meeting on Dec 16th with a new ending');
  await expect(boxAgain.locator('strong')).toHaveText('Den');
  await expect(boxAgain.locator('em')).toHaveText('Dec 16th');
  await expect(preview).toContainText('with a new ending');

  // Undo still works across a switch: typed codes are the common record.
  await sw.check();
  await weekly(page)
    .getByRole('textbox', { name: /^Text of paragraph 1/ })
    .focus();
  await page.keyboard.press('Control+z');
  await expect(weekly(page).getByRole('textbox', { name: /^Text of paragraph 1/ })).not.toHaveValue(
    /new ending/,
  );

  // Remembered on this device, and shared with the monthly letter.
  await page.reload();
  await weekly(page).getByLabel('Paste the old HTML here').fill(DEN15);
  await expect(weekly(page).getByRole('checkbox', { name: 'Show codes' })).toBeChecked();
  await expect(weekly(page).locator('textarea.rich').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await expect(monthly(page).getByRole('checkbox', { name: 'Show codes' })).toBeChecked();
  await expect(monthly(page).getByRole('textbox', { name: 'Intro paragraph' })).toHaveJSProperty(
    'tagName',
    'TEXTAREA',
  );
  // Turning it off here turns it off for the weekly screen too.
  await monthly(page).getByRole('checkbox', { name: 'Show codes' }).uncheck();
  await expect(monthly(page).locator('textarea.rich')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Weekly announcement' }).click();
  await expect(weekly(page).getByRole('checkbox', { name: 'Show codes' })).not.toBeChecked();
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('Show codes works from the keyboard and has a 44px target', async ({ page, context }) => {
  await watch(context, page);
  await paste(page, DEN15);
  const sw = weekly(page).getByRole('checkbox', { name: 'Show codes' });
  await sw.focus();
  await page.keyboard.press('Space');
  await expect(sw).toBeChecked();
  await expect(weekly(page).locator('textarea.rich').first()).toBeVisible();
  await page.keyboard.press('Space');
  await expect(sw).not.toBeChecked();
  await expect(weekly(page).locator('textarea.rich')).toHaveCount(0);
  const row = await weekly(page).locator('.codes-switch label').boundingBox();
  expect(row?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('blocked storage: Show codes still works for the visit', async ({ page, context }) => {
  const seen = await watch(context, page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  await paste(page, DEN15);
  // Storage is blocked, so no stored form choice reaches this page: it opens on the card.
  await weekly(page).getByRole('button', { name: 'Edit in the form' }).click();
  const sw = weekly(page).getByRole('checkbox', { name: 'Show codes' });
  await expect(sw).not.toBeChecked();
  await sw.check();
  await expect(weekly(page).locator('textarea.rich').first()).toBeVisible();
  expect(seen.errors).toEqual([]);
});

test('360px wide: no sideways scroll with the boxes, in either screen', async ({
  page,
  context,
}) => {
  await watch(context, page);
  await page.setViewportSize({ width: 360, height: 800 });
  await paste(page, calendar);
  await expect(weekly(page).getByRole('textbox', { name: /^Note/ }).first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await weekly(page).getByRole('checkbox', { name: 'Show codes' }).check();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await weekly(page).getByRole('checkbox', { name: 'Show codes' }).uncheck();
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await expect(monthly(page).getByRole('textbox', { name: 'Intro paragraph' })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
