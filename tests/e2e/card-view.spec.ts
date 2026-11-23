/**
 * Browser tests for step 3 of docs/plans/rich-editing.md: the weekly "Edit on the card" view and
 * the switch between the card and the form. Every request that is not to the local preview server
 * is aborted and counted, and page errors and dialogs are recorded (same watch as converter.spec).
 *
 * The other specs start with "Edit in the form" remembered (playwright.config.ts). This one starts
 * from an empty device, so it sees the real default: the card.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { lintOutput } from '../../src/core/lint-output';

test.use({ storageState: { cookies: [], origins: [] } });

const dir = fileURLToPath(new URL('../fixtures/weekly', import.meta.url));
const input = (name: string) => readFileSync(join(dir, `${name}.input.html`), 'utf8');

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

const frame = (page: Page, width: number) =>
  page.frameLocator(`iframe[title="Preview, ${width} pixels wide"]`);
const card = (page: Page) => page.locator('.ec');
const onCard = (page: Page) => page.getByRole('button', { name: 'Edit on the card' });
const inForm = (page: Page) => page.getByRole('button', { name: 'Edit in the form' });
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function paste(page: Page, html: string) {
  await page.goto('/');
  await page.getByLabel('Paste the old HTML here').fill(html);
  await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeVisible();
}

async function copied(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Copy new HTML' }).click();
  await expect(page.getByText('Copied', { exact: true })).toBeVisible();
  return clipboard(page);
}

/** Everything a person can read on the card: text areas hold their words in `value`. */
const cardWords = (page: Page) =>
  card(page).evaluate(
    (node) =>
      [...node.querySelectorAll('textarea')].map((t) => t.value).join('\n') +
      '\n' +
      (node.textContent ?? ''),
  );

async function boldFirstWord(page: Page, box: Locator) {
  await box.focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+Shift+ArrowRight');
  await page.keyboard.press('Control+b');
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test.describe('after pasting, the card comes first', () => {
  for (const f of fixtures) {
    test(`${f.name}: card shown, with its text, and no horizontal overflow at 360px`, async ({
      page,
      context,
    }) => {
      const seen = await watch(context, page);
      await page.setViewportSize({ width: 360, height: 800 });
      await paste(page, input(f.name));
      await expect(page.getByRole('radio', { name: new RegExp(`^${f.layout}`) })).toBeChecked();
      await expect(onCard(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(inForm(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(card(page)).toBeVisible();
      await expect(page.locator('.form')).toHaveCount(0);
      // The Show codes switch belongs to the form only.
      await expect(page.getByLabel('Show codes')).toBeHidden();
      await expect.poll(() => cardWords(page)).toContain(f.text);
      for (const width of [250, 375, 600]) {
        await expect(frame(page, width).locator('body')).toContainText(f.text);
      }
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const box = await card(page).boundingBox();
      expect(box?.width ?? 0).toBeLessThanOrEqual(360);
      // Everything editable has a name a screen reader can say.
      const unnamed = await card(page).evaluate(
        (node) =>
          [...node.querySelectorAll('textarea, [role=textbox]')].filter(
            (c) => (c.getAttribute('aria-label') ?? '') === '',
          ).length,
      );
      expect(unnamed).toBe(0);
      expect(seen.errors).toEqual([]);
      expect(seen.remote).toEqual([]);
    });
  }
});

test('edit the title on the card: the preview follows, Ctrl+Z restores, the form shows the same', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await paste(page, input('5-webelos-dens-10-11'));
  const title = card(page).getByRole('textbox', { name: 'Title', exact: true });
  const before = await title.inputValue();
  await title.fill('Zebra title');
  await expect(frame(page, 375).locator('body')).toContainText('Zebra title');
  await page.keyboard.press('Control+z');
  await expect(title).toHaveValue(before);
  await expect(frame(page, 375).locator('body')).not.toContainText('Zebra title');
  await page.keyboard.press('Control+Shift+z');
  await expect(title).toHaveValue('Zebra title');

  await inForm(page).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Zebra title');
  // The keyboard stays on the switch.
  await expect(inForm(page)).toBeFocused();
  // Undo reaches back into the other view's edit, and the form shows it.
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(before);
  await onCard(page).click();
  await expect(card(page).getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(before);
  await expect(onCard(page)).toBeFocused();
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('Date list: bold in a row note on the card reaches the preview, and undo reverts it', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await paste(page, input('1-pack-calendar'));
  const note = card(page).getByRole('textbox', { name: /^Note/ }).filter({ hasText: /\w/ }).first();
  await expect(note).toBeVisible();
  const strong = frame(page, 375).locator('strong');
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

test('the toolbar floats above the box being edited and is hidden otherwise', async ({ page }) => {
  await paste(page, input('1-pack-calendar'));
  const note = card(page).getByRole('textbox', { name: /^Note/ }).filter({ hasText: /\w/ }).first();
  const toolbar = card(page).getByRole('toolbar').first();
  await expect(toolbar).toBeHidden();
  await note.click();
  const tools = note.locator('xpath=ancestor::div[contains(@class,"rich-editor")]');
  await expect(tools.getByRole('toolbar')).toBeVisible();
  await expect(tools.getByRole('button', { name: 'Bold' })).toBeVisible();
  // Shift+Tab reaches the toolbar from the box.
  await page.keyboard.press('Shift+Tab');
  await expect(tools.getByRole('button', { name: 'Bold' })).toBeFocused();
});

test('row controls and empty hints show only on the active row; sections keep one', async ({
  page,
}) => {
  // Hover would also reveal them, so keep the mouse away from the card.
  await paste(page, input('1-pack-calendar'));
  await page.mouse.move(0, 0);
  const rowJump = (n: number) =>
    card(page).getByRole('button', {
      name: new RegExp(`^Change in the form: date, link and tags of row ${n}$`),
    });
  const section = card(page).getByRole('button', {
    name: /^Change in the form: add, move or restyle the rows of section 1$/,
  });
  await expect(section).toBeVisible();
  await expect(rowJump(1).first()).toBeHidden();
  await expect(
    card(page).getByRole('textbox', { name: /^Note/ }).filter({ hasText: /^$/ }).first(),
  ).toBeHidden();

  const firstRow = card(page).getByRole('group', { name: 'Row 1' }).first();
  const secondRow = card(page).getByRole('group', { name: 'Row 2' }).first();
  const event = firstRow.getByRole('textbox', { name: 'Event', exact: true });
  await event.click();
  await expect(rowJump(1).first()).toBeVisible();
  await expect(secondRow.getByRole('button', { name: /Change in the form/ })).toBeHidden();

  // Tab from the event reaches the row's button (past tags and a note, if the row has them).
  await event.focus();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') ?? '',
    );
    if (name.startsWith('Change in the form: date, link and tags of row 1')) break;
  }
  await expect(rowJump(1).first()).toBeFocused();
  await card(page).screenshot({ path: 'test-results/screens/card-row-active.png' });
});

test('"Change in the form" on a date opens the form with that date field in focus', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await paste(page, input('1-pack-calendar'));
  const firstRow = card(page).getByRole('group', { name: 'Row 1' }).first();
  await firstRow.getByRole('textbox', { name: 'Event', exact: true }).click();
  const jump = firstRow.getByRole('button', {
    name: /^Change in the form: date, link and tags of row 1$/,
  });
  await jump.click();
  await expect(card(page)).toHaveCount(0);
  const date = page.locator('input[type=date]:focus');
  await expect(date).toHaveCount(1);
  await expect(date).toHaveAttribute('id', 'd-sections-0-rows-0');
  await expect(page.getByLabel('Date', { exact: true }).first()).toBeVisible();
  // The jump does not change the remembered choice.
  await page.reload();
  await page.getByLabel('Paste the old HTML here').fill(input('1-pack-calendar'));
  await expect(card(page)).toBeVisible();
  expect(seen.errors).toEqual([]);
});

test('Things to check lists the missing label and title, and they go once filled on the card', async ({
  page,
}) => {
  await paste(page, DEN15);
  const heading = page.getByRole('heading', { name: /^Things to check \(\d+\)$/ });
  await expect(heading).toBeVisible();
  const labelNote = page.getByText('Add a short label for the top of the card.');
  const titleNote = page.getByText('Add a title for this announcement.');
  await expect(labelNote).toBeVisible();
  await expect(titleNote).toBeVisible();
  const count = async () =>
    Number(/\((\d+)\)/.exec((await heading.textContent()) ?? '')?.[1] ?? '0');
  const start = await count();
  // The empty fields show a hint that is not their value.
  const label = card(page).getByRole('textbox', {
    name: 'Label (the small tag at the top)',
    exact: true,
  });
  const title = card(page).getByRole('textbox', { name: 'Title', exact: true });
  await expect(label).toHaveAttribute('placeholder', 'Add a label');
  await expect(label).toHaveValue('');
  await expect(title).toHaveAttribute('placeholder', 'Add a title');
  await expect(title).toHaveValue('');
  const html = await copied(page);
  expect(html).not.toContain('Add a label');
  expect(html).not.toContain('Add a title');

  await label.fill('Announcements');
  await title.fill('Den 15 - Lions');
  await expect(labelNote).toBeHidden();
  await expect(titleNote).toBeHidden();
  await expect.poll(count).toBe(start - 2);
  // Clearing a field brings its note back.
  await title.fill('');
  await expect(titleNote).toBeVisible();

  // A note's button jumps to the field in the form.
  await page.getByRole('button', { name: /^Show in the form: Add a title/ }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
});

test('the view choice survives a reload, and the keyboard operates the switch', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await paste(page, input('4-in-the-news'));
  await expect(card(page)).toBeVisible();

  // Keyboard only: focus the form button, press Enter.
  await inForm(page).focus();
  await page.keyboard.press('Enter');
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('.form')).toBeVisible();
  await expect(page.getByLabel('Show codes')).toBeVisible();
  await expect(inForm(page)).toBeFocused();
  await expect(inForm(page)).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await page.getByLabel('Paste the old HTML here').fill(input('4-in-the-news'));
  await expect(page.locator('.form')).toBeVisible();
  await expect(inForm(page)).toHaveAttribute('aria-pressed', 'true');

  // Arrow keys move between the two, and Space switches back.
  await page.keyboard.press('Tab');
  await inForm(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(onCard(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(card(page)).toBeVisible();
  await expect(onCard(page)).toBeFocused();

  await page.reload();
  await page.getByLabel('Paste the old HTML here').fill(input('4-in-the-news'));
  await expect(card(page)).toBeVisible();
  expect(seen.errors).toEqual([]);
});

test('undo reaches a change made in the form (a link address) even from the card', async ({
  page,
}) => {
  await paste(page, input('3-year-in-review-photos'));
  await inForm(page).click();
  const url = page.getByLabel('Button link');
  const before = await url.inputValue();
  await url.fill('https://example.org/new');
  await onCard(page).click();
  await expect(card(page)).toBeVisible();
  await page.keyboard.press('Control+z');
  // The card does not show addresses, so the form opens to show what was undone.
  await expect(page.getByLabel('Button link')).toHaveValue(before);
});

test('the same edits give the same HTML on the card and in the form', async ({ page, context }) => {
  const seen = await watch(context, page);
  const edits = async () => {
    await page
      .getByRole('textbox', { name: 'Label (the small tag at the top)', exact: true })
      .fill('Zebra news');
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Zebra title');
    await page.getByRole('textbox', { name: 'Event', exact: true }).first().fill('Zebra event');
    const note = page.getByRole('textbox', { name: /^Note/ }).filter({ hasText: /\w/ }).first();
    await boldFirstWord(page, note);
    await expect(note.locator('strong')).toHaveCount(1);
  };

  await paste(page, input('1-pack-calendar'));
  await expect(card(page)).toBeVisible();
  await edits();
  const fromCard = await copied(page);

  await page.reload();
  await page.getByLabel('Paste the old HTML here').fill(input('1-pack-calendar'));
  await inForm(page).click();
  await expect(page.locator('.form')).toBeVisible();
  await edits();
  const fromForm = await copied(page);

  expect(fromCard).toContain('Zebra&nbsp;news');
  expect(fromCard).toContain('Zebra title');
  expect(fromCard).toContain('<strong');
  expect(fromCard).toBe(fromForm);
  expect(lintOutput(fromCard)).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('the card width control resizes the card', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await paste(page, input('4-in-the-news'));
  const widthOf = async () => (await card(page).boundingBox())?.width ?? 0;
  await page.getByRole('button', { name: 'Card width 250 pixels' }).click();
  expect(await widthOf()).toBeCloseTo(250, 0);
  await page.getByRole('button', { name: 'Card width 375 pixels' }).click();
  expect(await widthOf()).toBeCloseTo(375, 0);
  await page.getByRole('button', { name: 'Card width 600 pixels' }).click();
  expect(await widthOf()).toBeLessThanOrEqual(600);
  // Typing in a card line keeps the width.
  await page.getByRole('button', { name: 'Card width 250 pixels' }).click();
  await card(page).getByRole('textbox', { name: 'Title', exact: true }).fill('Short');
  expect(await widthOf()).toBeCloseTo(250, 0);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('screenshots of the card for review', async ({ page }) => {
  for (const f of fixtures) {
    await page.setViewportSize({ width: 360, height: 900 });
    await paste(page, input(f.name));
    await expect(card(page)).toBeVisible();
    await card(page).screenshot({ path: `test-results/screens/card-${f.name}-360.png` });
    await page.setViewportSize({ width: 1280, height: 900 });
    await card(page).screenshot({ path: `test-results/screens/card-${f.name}-wide.png` });
  }
});
