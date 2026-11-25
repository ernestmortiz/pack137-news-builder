/**
 * Browser tests for step 4 of docs/plans/rich-editing.md: the monthly letter's "Edit on the card"
 * view, and the one view choice it shares with the weekly screen. Every request that is not to the
 * local preview server is aborted and counted, and page errors and dialogs are recorded (same watch
 * as letter.spec and card-view.spec).
 *
 * The other specs start with "Edit in the form" remembered (playwright.config.ts). This one starts
 * from an empty device, so it sees the real default: the card.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { writeDraft } from '../../src/core/draft';
import type { LetterForm } from '../../src/core/letter';
import { lintOutput } from '../../src/core/lint-output';
import { renderLetter } from '../../src/core/render-letter';
import { defaultSettings } from '../../src/core/settings';
import { previewWidths } from '../../src/config/tokens';
import { previewDocument } from '../../src/ui/preview';

test.use({ storageState: { cookies: [], origins: [] } });

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const referenceLetter = JSON.parse(
  readFileSync(join(fixtures, 'monthly/2026-11.draft.json'), 'utf8'),
) as LetterForm;
const DEN15 =
  '<p>1. Den Meeting - Dec 16th 6:15pm - <a href="https://pack137.trooptrack.com/plan/events/1847519">Fun On The Run</a></p>';

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

const panel = (page: Page) => page.locator('#panel-monthly');
const weekly = (page: Page) => page.locator('#panel-converter');
const frame = (page: Page, width: number) =>
  panel(page).frameLocator(`iframe[title="Preview, ${width} pixels wide"]`);
const card = (page: Page) => panel(page).locator('.ec-letter');
const form = (page: Page) => panel(page).locator('.letter-form');
const onCard = (page: Page) => panel(page).getByRole('button', { name: 'Edit on the card' });
const inForm = (page: Page) => panel(page).getByRole('button', { name: 'Edit in the form' });
const box = (page: Page, name: string) => panel(page).getByRole('textbox', { name, exact: true });
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function openLetter(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await expect(panel(page).getByRole('heading', { name: 'Edit the letter' })).toBeVisible();
}

async function chooseDraft(page: Page, letter: LetterForm) {
  const text = writeDraft(letter, defaultSettings(), new Date('2026-11-23T12:00:00Z'));
  await panel(page)
    .getByLabel('Choose a draft file to open')
    .setInputFiles({
      name: 'reference.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
  await panel(page)
    .getByRole('button', { name: /^(Open this draft|Keep my settings)$/ })
    .click();
}

async function openReference(page: Page) {
  await openLetter(page);
  await chooseDraft(page, referenceLetter);
  await expect(card(page)).toBeVisible();
  await expect(box(page, 'Story title')).toHaveValue(referenceLetter.story.title);
}

async function copyLetter(page: Page): Promise<string> {
  await panel(page).getByRole('button', { name: 'Copy letter HTML' }).click();
  await expect(panel(page).getByText('Copied', { exact: true })).toBeVisible();
  return clipboard(page);
}

async function boldFirstWord(page: Page, target: Locator) {
  await target.focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+Shift+ArrowRight');
  await page.keyboard.press('Control+b');
}

async function pasteWeekly(page: Page, html: string) {
  await page.getByRole('tab', { name: 'Weekly announcement' }).click();
  await page.getByLabel('Paste the old HTML here').fill(html);
  await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeVisible();
}

const unnamed = (root: Locator) =>
  root.evaluate(
    (node) =>
      [...node.querySelectorAll('textarea, [role=textbox]')].filter(
        (c) => (c.getAttribute('aria-label') ?? '') === '',
      ).length,
  );

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

/** The Undo bar sticks to the top of the window, so it would sit on top of a tall card picture. */
const unstick = (page: Page) =>
  page.addStyleTag({ content: '.history-bar { position: static !important; }' });

test('the card comes first on the letter screen, with the previews unchanged', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await openLetter(page);
  await expect(onCard(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(inForm(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(card(page)).toBeVisible();
  await expect(form(page)).toHaveCount(0);
  // The Show codes switch belongs to the form only.
  await expect(panel(page).getByLabel('Show codes')).toBeHidden();
  // The card follows the letter: masthead, greeting, the fixed headings.
  await expect(card(page)).toContainText('Pack 137 Stories');
  await expect(box(page, 'Greeting')).toHaveValue('Hi Pack 137 families,');
  await expect(card(page)).toContainText('Coming up'.toUpperCase());
  await expect(card(page).getByRole('heading', { name: 'Around the pack' })).toBeVisible();
  await expect(box(page, 'Summary line')).toHaveAttribute('placeholder', 'Add a summary line');
  expect(await unnamed(card(page))).toBe(0);
  for (const width of [320, 375, 600]) {
    await expect(
      panel(page).locator(`iframe[title="Preview, ${width} pixels wide"]`),
    ).toBeVisible();
    await expect(frame(page, width).locator('body')).toContainText('Hi Pack 137 families,');
  }
  // Placeholders never reach the output.
  const html = await copyLetter(page);
  expect(html).not.toContain('Add a summary line');
  expect(html).not.toContain('Add a story title');
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('edit the intro on the card: the preview follows, Ctrl+Z restores, the form shows the same', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await openLetter(page);
  const intro = box(page, 'Intro paragraph');
  await intro.fill('Zebra camp news');
  await expect(frame(page, 375).locator('body')).toContainText('Zebra camp news');
  await page.keyboard.press('Control+z');
  await expect(intro).toHaveText('');
  await expect(frame(page, 375).locator('body')).not.toContainText('Zebra camp news');
  await page.keyboard.press('Control+Shift+z');
  await expect(intro).toHaveText('Zebra camp news');
  await expect(frame(page, 375).locator('body')).toContainText('Zebra camp news');

  await inForm(page).click();
  await expect(card(page)).toHaveCount(0);
  await expect(box(page, 'Intro paragraph')).toHaveText('Zebra camp news');
  // The keyboard stays on the switch, and undo reaches back into the card's edit.
  await expect(inForm(page)).toBeFocused();
  await page.keyboard.press('Control+z');
  await expect(box(page, 'Intro paragraph')).toHaveText('');
  await onCard(page).click();
  await expect(box(page, 'Intro paragraph')).toHaveText('');
  await expect(onCard(page)).toBeFocused();
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('bold a word in a block on the card: the preview gets it, and undo removes it', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await openReference(page);
  const block = card(page).getByRole('group', { name: /^Block 1:/ });
  const text = block.getByRole('textbox', { name: /^Text of part 1/ });
  const strong = frame(page, 375).locator('strong');
  const before = await strong.count();
  await boldFirstWord(page, text);
  await expect(text.locator('strong')).toHaveCount(1);
  await expect(strong).toHaveCount(before + 1);
  await page.keyboard.press('Control+z');
  await expect(text.locator('strong')).toHaveCount(0);
  await expect(strong).toHaveCount(before);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('"Change in the form" on a Coming up date opens the form with that date in focus', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await openReference(page);
  const third = card(page).getByRole('group', { name: 'Event 3' });
  await third.getByRole('textbox', { name: 'What is happening' }).click();
  await third
    .getByRole('button', { name: 'Change in the form: date, time and link address of event 3' })
    .click();
  await expect(card(page)).toHaveCount(0);
  await expect(form(page)).toBeVisible();
  const date = panel(page).locator('input[type=date]:focus');
  await expect(date).toHaveCount(1);
  await expect(date).toHaveValue('2026-12-15');
  // The jump does not change the remembered choice.
  await expect(inForm(page)).toHaveAttribute('aria-pressed', 'true');
  await panel(page).getByRole('button', { name: 'Download draft' }).focus();
  await page.reload();
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await panel(page)
    .getByRole('button', { name: /^Start a blank letter$/ })
    .click();
  await expect(card(page)).toBeVisible();
  expect(seen.errors).toEqual([]);
});

test('row controls show only on the active event; each section keeps one', async ({ page }) => {
  await openReference(page);
  await page.mouse.move(0, 0);
  const rowJump = (n: number) =>
    card(page).getByRole('button', {
      name: `Change in the form: date, time and link address of event ${n}`,
    });
  await expect(
    card(page).getByRole('button', { name: 'Change in the form: add, move or remove events' }),
  ).toBeVisible();
  await expect(rowJump(1)).toBeHidden();
  const first = card(page).getByRole('group', { name: 'Event 1' });
  await first.getByRole('textbox', { name: 'What is happening' }).click();
  await expect(rowJump(1)).toBeVisible();
  await expect(rowJump(2)).toBeHidden();
});

test('a Things to check item jumps to its field in the form', async ({ page, context }) => {
  const seen = await watch(context, page);
  await openLetter(page);
  const heading = page.getByRole('heading', { name: /^Things to check \(\d+\)$/ });
  await expect(heading).toBeVisible();
  await expect(card(page).locator('xpath=..')).toContainText('The summary line is empty.');
  await panel(page)
    .getByRole('button', { name: 'Show in the form: The summary line is empty.' })
    .click();
  await expect(card(page)).toHaveCount(0);
  await expect(box(page, 'Summary line')).toBeFocused();
  // Back on the card, filling the field takes the note away.
  await onCard(page).click();
  await box(page, 'Summary line').fill('A fine month');
  await expect(
    panel(page).getByRole('button', { name: 'Show in the form: The summary line is empty.' }),
  ).toHaveCount(0);
  // A note about a photo goes to that photo's description in the form.
  await inForm(page).click();
  await panel(page)
    .getByLabel('Kind of block to add')
    .selectOption({ label: 'Photo: One picture with a caption' });
  await panel(page).getByRole('button', { name: 'Add block', exact: true }).click();
  await onCard(page).click();
  await panel(page)
    .getByRole('button', { name: /^Show in the form: Photo 1 is a photo spot/ })
    .click();
  await expect(panel(page).getByLabel('Photo description (required)')).toBeFocused();
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('one view choice is shared: form on the weekly screen means form on the letter, and back', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await page.goto('/');
  await pasteWeekly(page, DEN15);
  await expect(weekly(page).locator('.ec')).toBeVisible();
  await weekly(page).getByRole('button', { name: 'Edit in the form' }).click();
  await expect(weekly(page).locator('.form')).toBeVisible();

  // The letter, opened for the first time, follows the weekly choice.
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await expect(form(page)).toBeVisible();
  await expect(inForm(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page)).toHaveCount(0);

  // Choosing the card on the letter changes the weekly screen too, with no reload.
  await onCard(page).click();
  await expect(card(page)).toBeVisible();
  await page.getByRole('tab', { name: 'Weekly announcement' }).click();
  await expect(weekly(page).locator('.ec')).toBeVisible();
  await expect(weekly(page).getByRole('button', { name: 'Edit on the card' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // And the other way: the form chosen on the letter reaches the weekly screen.
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await inForm(page).click();
  await page.getByRole('tab', { name: 'Weekly announcement' }).click();
  await expect(weekly(page).locator('.form')).toBeVisible();
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('a letter opened after the form was chosen on the weekly screen starts in the form', async ({
  page,
}) => {
  await openLetter(page);
  await inForm(page).click();
  await page.getByRole('tab', { name: 'Weekly announcement' }).click();
  await page.getByLabel('Paste the old HTML here').fill(DEN15);
  await expect(weekly(page).locator('.form')).toBeVisible();
  await expect(weekly(page).getByRole('button', { name: 'Edit in the form' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('reload keeps the letter and the view, in the form and on the card', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await openLetter(page);
  await box(page, 'Summary line').fill('Kept on this device');
  await expect(panel(page).getByText(/^Saved on this device at/)).toBeVisible();
  await inForm(page).click();
  await expect(form(page)).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await panel(page)
    .getByRole('button', { name: /^Keep working on the / })
    .click();
  await expect(form(page)).toBeVisible();
  await expect(inForm(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(box(page, 'Summary line')).toHaveValue('Kept on this device');

  await onCard(page).click();
  await box(page, 'Summary line').fill('Kept on the card');
  await expect(panel(page).getByText(/^Saved on this device at/)).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await panel(page)
    .getByRole('button', { name: /^Keep working on the / })
    .click();
  await expect(card(page)).toBeVisible();
  await expect(box(page, 'Summary line')).toHaveValue('Kept on the card');
  expect(seen.errors).toEqual([]);
});

test('the November reference letter fits at 360px, with every field named', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await page.setViewportSize({ width: 360, height: 800 });
  await openReference(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const width = (await card(page).boundingBox())?.width ?? 0;
  expect(width).toBeLessThanOrEqual(360);
  expect(await unnamed(card(page))).toBe(0);
  // Words are in place and nothing wider than the card sticks out of it.
  await expect(card(page)).toContainText('Photo:');
  const wide = await card(page).evaluate((node) => {
    const limit = node.getBoundingClientRect().right + 1;
    return [...node.querySelectorAll('*')].filter(
      (n) => n.getBoundingClientRect().right > limit && getComputedStyle(n).display !== 'none',
    ).length;
  });
  expect(wide).toBe(0);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('the same edits give the same letter HTML on the card and in the form', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  const edits = async () => {
    await box(page, 'Summary line').fill('Zebra summary');
    await box(page, 'Story title').fill('Zebra story');
    const intro = box(page, 'Intro paragraph');
    await intro.click();
    await page.keyboard.type('Zebra intro words');
    await boldFirstWord(page, intro);
    await expect(intro.locator('strong')).toHaveCount(1);
  };

  await openLetter(page);
  await expect(card(page)).toBeVisible();
  await edits();
  const fromCard = await copyLetter(page);

  await page.reload();
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await panel(page)
    .getByRole('button', { name: /^Start a blank letter$/ })
    .click();
  await inForm(page).click();
  await expect(form(page)).toBeVisible();
  await edits();
  const fromForm = await copyLetter(page);

  expect(fromCard).toContain('Zebra summary');
  expect(fromCard).toContain('Zebra story');
  expect(fromCard).toContain('<strong');
  expect(fromCard).toBe(fromForm);
  expect(lintOutput(fromCard, { monthly: true })).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('Download draft, Open draft, Finish photos and Copy work from the card', async ({
  page,
  context,
}, testInfo) => {
  const seen = await watch(context, page);
  await openLetter(page);
  await box(page, 'Summary line').fill('From the card');
  await expect(panel(page).getByRole('heading', { name: 'Finish photos' })).toBeVisible();

  const downloading = page.waitForEvent('download');
  await panel(page).getByRole('button', { name: 'Download draft' }).click();
  const saved = testInfo.outputPath('card-draft.json');
  await (await downloading).saveAs(saved);
  expect(JSON.parse(readFileSync(saved, 'utf8')).letter.summary).toBe('From the card');

  await box(page, 'Summary line').fill('');
  await panel(page).getByLabel('Choose a draft file to open').setInputFiles(saved);
  await panel(page).getByRole('button', { name: 'Open this draft' }).click();
  // The letter opens the way the person likes to work: on the card.
  await expect(card(page)).toBeVisible();
  await expect(box(page, 'Summary line')).toHaveValue('From the card');
  expect(await copyLetter(page)).toContain('From the card');
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('the card width control resizes the letter card', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openLetter(page);
  const widthOf = async () => (await card(page).boundingBox())?.width ?? 0;
  await panel(page).getByRole('button', { name: 'Card width 320 pixels' }).click();
  expect(await widthOf()).toBeCloseTo(320, 0);
  await panel(page).getByRole('button', { name: 'Card width 375 pixels' }).click();
  expect(await widthOf()).toBeCloseTo(375, 0);
  await panel(page).getByRole('button', { name: 'Card width 600 pixels' }).click();
  expect(await widthOf()).toBeLessThanOrEqual(600);
  await panel(page).getByRole('button', { name: 'Card width 320 pixels' }).click();
  await box(page, 'Story title').fill('Short');
  expect(await widthOf()).toBeCloseTo(320, 0);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('screenshots of the letter card for review', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLetter(page);
  await unstick(page);
  await card(page).screenshot({ path: 'test-results/screens/letter-card-empty-wide.png' });
  await openReference(page);
  await unstick(page);
  await card(page).screenshot({ path: 'test-results/screens/letter-card-reference-wide.png' });
  // One block active: its toolbar shows under it and its "Change in the form" shows.
  await page.mouse.move(0, 0);
  const block = card(page).getByRole('group', { name: /^Block 2:/ });
  await block.getByRole('textbox').first().click();
  await block.scrollIntoViewIfNeeded();
  await unstick(page);
  await block.screenshot({ path: 'test-results/screens/letter-card-block-active.png' });
  await page.setViewportSize({ width: 360, height: 900 });
  await unstick(page);
  await card(page).screenshot({ path: 'test-results/screens/letter-card-reference-360.png' });
});

test('the right-hand panel says how many things to check on the card, and lists them in full in the form', async ({
  page,
}) => {
  await openLetter(page);
  const out = panel(page).locator('.letter-output .card').first();
  const heading = page.getByRole('heading', { name: /^Things to check \(\d+\)$/ });
  const n = Number(/\((\d+)\)/.exec((await heading.textContent()) ?? '')?.[1] ?? '0');
  expect(n).toBeGreaterThan(0);
  await expect(out.getByRole('heading', { name: 'Check and copy' })).toBeVisible();
  await expect(out).toContainText(
    `${n} ${n === 1 ? 'thing' : 'things'} to check, listed above the card.`,
  );
  await expect(out.locator('li')).toHaveCount(0);
  await expect(panel(page).getByText('Things to look at')).toHaveCount(0);

  // In the form the right-hand panel keeps the full list, under the same name.
  await inForm(page).click();
  await expect(out.getByText('Things to check', { exact: true })).toBeVisible();
  await expect(out.locator('li')).toHaveCount(n);
  await expect(out).not.toContainText('listed above the card');

  // Back on the card the one line returns, and its number matches the list above the card.
  await onCard(page).click();
  await expect(out.locator('li')).toHaveCount(0);
  await expect(out).toContainText(`${n} ${n === 1 ? 'thing' : 'things'} to check`);
});

test('the saved-work hint shows with the save status on both views, and not on the weekly screen', async ({
  page,
}) => {
  const hint = /^Saved in this browser or app only\./;
  await openLetter(page);
  await expect(panel(page).getByText(hint)).toBeVisible();
  await expect(panel(page).getByText(hint)).toContainText(
    'To carry on somewhere else, use Download draft.',
  );
  await box(page, 'Story title').fill('Anything');
  await expect(panel(page).getByText(/^Saved on this device at /)).toBeVisible();
  await expect(panel(page).getByText(hint)).toBeVisible();
  await inForm(page).click();
  await expect(panel(page).getByText(hint)).toBeVisible();
  // The weekly screen does not save, so it says nothing about saving.
  await page.getByRole('tab', { name: 'Weekly announcement' }).click();
  await expect(weekly(page).getByText(/Saved in this browser/)).toHaveCount(0);
  await expect(weekly(page).getByText(/Saved on this device/)).toHaveCount(0);
});

test('name tags and other pills on the letter card have a 44px touch area at 360px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await openReference(page);
  const areas = card(page).locator('.ec-badge .ec-input, .ec-pill .ec-input');
  const count = await areas.count();
  expect(count).toBeGreaterThan(0);
  const heights = await areas.evaluateAll((nodes) =>
    nodes.map((n) => n.getBoundingClientRect().height),
  );
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

/**
 * The preview document (the letter with its picture stand-ins, as the preview frames show it),
 * loaded straight into a page of the given width. Measuring inside the real frames is unreliable:
 * the browser does not draw a sandboxed frame that is off screen, so it reports zero sizes.
 */
async function previewAt(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/*', (route) => route.abort());
  await page.setContent(previewDocument(renderLetter(referenceLetter, defaultSettings())), {
    waitUntil: 'domcontentloaded',
  });
}

for (const width of previewWidths.filter((w) => w < 600)) {
  test(`the ${width}px preview of a letter with full-width photos does not scroll sideways (owner, 2026-11-25)`, async ({
    page,
  }) => {
    // The photo stand-ins used to be fixed 552px boxes, which stretched the letter to about
    // 630px inside the phone frames, while the real email fits a phone.
    await previewAt(page, width);
    const sizes = await page
      .locator('html')
      .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(sizes.client).toBe(width);
    expect(sizes.scroll).toBeLessThanOrEqual(width);
  });

  test(`the logo stand-in stays logo-sized in the ${width}px preview`, async ({ page }) => {
    // Each stand-in copies its picture's own sizing: the logo is a fixed 90px circle in the email.
    await previewAt(page, width);
    const sizes = await page.getByText('Cranford Cub Scouts Pack 137 logo').evaluate((el) => ({
      box: Math.round(el.getBoundingClientRect().width),
      cell: Math.round((el.closest('td') as Element).getBoundingClientRect().width),
    }));
    // The box is the logo's 90px, and its cell keeps the template's 110px plus padding, leaving
    // the rest of the row to the title.
    expect(sizes.box).toBe(90);
    expect(sizes.cell).toBeLessThanOrEqual(134);
  });
}
