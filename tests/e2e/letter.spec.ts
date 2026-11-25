/**
 * Browser end to end tests for the Monthly letter editor (build spec 11.3 and 8.1).
 * Every request that is not to the local preview server is aborted and counted. The count must be
 * zero in every test. All locators sit under #panel-monthly because the converter has its own
 * "Show the code" and its own fields.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { lintOutput } from '../../src/core/lint-output';

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

const panel = (page: Page) => page.locator('#panel-monthly');
const frame = (page: Page, width: number) =>
  panel(page).frameLocator(`iframe[title="Preview, ${width} pixels wide"]`);
const codeBox = (page: Page) => panel(page).locator('#letter-code-box');
const counter = (page: Page) => panel(page).getByLabel('Read time and word count');
const field = (page: Page, label: string) => panel(page).getByLabel(label, { exact: true });
const block = (page: Page, n: number) =>
  panel(page).getByRole('group', { name: new RegExp(`^Block ${n}:`) });
const section = (page: Page, heading: string): Locator =>
  panel(page)
    .locator('section.letter-section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) });

async function openLetter(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await expect(panel(page).getByRole('heading', { name: 'Edit the letter' })).toBeVisible();
}

async function showCode(page: Page) {
  if (!(await codeBox(page).isVisible())) await panel(page).getByText('Show the code').click();
}

/** The code text once the debounced refresh has caught up with `needle`. */
async function codeContaining(page: Page, needle: string): Promise<string> {
  await showCode(page);
  await expect(codeBox(page)).toHaveValue(
    new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
  return codeBox(page).inputValue();
}

async function addBlock(page: Page, kind: string) {
  await panel(page).getByLabel('Kind of block to add').selectOption({ label: kind });
  await section(page, 'Feature story')
    .getByRole('button', { name: 'Add block', exact: true })
    .click();
}

const wordCount = async (page: Page) =>
  Number(
    /([\d,]+) words?\./.exec((await counter(page).textContent()) ?? '')?.[1]?.replace(',', ''),
  );

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

async function copyLetter(page: Page) {
  await panel(page).getByRole('button', { name: 'Copy letter HTML' }).click();
  await expect(panel(page).getByText('Copied', { exact: true })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('the blank letter for next month shows with the defaults and three previews', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await openLetter(page);
  await expect(
    panel(page).getByText('You are starting from a blank letter for next month.'),
  ).toBeVisible();
  await expect(field(page, 'Greeting')).toHaveValue('Hi Pack 137 families,');
  await expect(counter(page)).toContainText(/About an? \d+ minute read\. \d+ words?\./);
  for (const width of [360, 390, 600]) {
    await expect(
      panel(page).locator(`iframe[title="Preview, ${width} pixels wide"]`),
    ).toBeVisible();
    await expect(frame(page, width).locator('body')).toContainText('Hi Pack 137 families,');
  }
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('filled fields reach the 600px preview and the counter follows the typing', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await openLetter(page);
  const before = await wordCount(page);

  await field(page, 'Summary line').fill('A busy month of camp and cars');
  await field(page, 'Story title').fill('Why we love fall camp');
  await expect.poll(() => wordCount(page)).toBeGreaterThan(before);
  const afterTitle = await wordCount(page);
  await field(page, 'Story title').fill('Why we love fall camp so much');
  await expect.poll(() => wordCount(page)).toBe(afterTitle + 2);

  // A contributor with a paragraph and a bullet list.
  await addBlock(page, 'Contributor: A name tag, then paragraphs and bullet lists');
  const contributor = block(page, 1);
  await contributor.getByLabel('Name on the name tag').fill('Justin Daly');
  await contributor.getByLabel('Role (optional)').fill('Program Director');
  await contributor
    .getByRole('textbox', { name: 'Paragraph text' })
    .fill('Thank you all for a great campout.');
  await contributor.getByRole('button', { name: 'Add a bullet list' }).click();
  await contributor.getByLabel('Bold lead').fill('Camp Crafts');
  await contributor
    .getByRole('textbox', { name: 'Text after the lead' })
    .fill('Every Scout made a lanyard.');

  // A photo spot, with a description.
  await addBlock(page, 'Photo: One picture with a caption');
  const photo = block(page, 2);
  await photo.getByLabel('Photo description (required)').fill('Scouts around a campfire');

  // A stat band.
  await addBlock(page, 'Stat band: Two big numbers, such as 48 families');
  const stats = block(page, 3);
  await stats.getByLabel('Big number or figure').first().fill('48');
  await stats.getByLabel('Line of text under it').first().fill('families came to camp');

  // A Coming up item with a date and a time.
  const coming = section(page, 'Coming up');
  await coming.getByRole('button', { name: 'Add an event' }).click();
  await coming.getByLabel('Date', { exact: true }).fill('2026-12-06');
  await coming.getByLabel('Time (optional)').fill('20:00');
  await coming.getByRole('textbox', { name: 'What is happening' }).fill('Holiday party');

  const body = frame(page, 600).locator('body');
  await expect(body).toContainText(/A busy month of camp and cars\s+About an? \d+ minute read\./);
  await expect(body).toContainText('Why we love fall camp so much');
  await expect(body).toContainText('JUSTIN DALY');
  await expect(body).toContainText('Camp Crafts');
  await expect(body).toContainText('families came to camp');
  await expect(body).toContainText('Sun Dec 6, 8:00 pm');
  await expect(body).toContainText('Holiday party');
  // The summary comes before the story title.
  const text = await body.innerText();
  expect(text.indexOf('A busy month')).toBeLessThan(text.indexOf('Why we love fall camp'));

  await expect(counter(page)).toContainText(/About an? \d+ minute read\./);
  expect(await wordCount(page)).toBeGreaterThan(afterTitle + 10);

  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('Copy letter HTML puts exactly the code shown on the clipboard and it lints clean', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await openLetter(page);
  await field(page, 'Summary line').fill('Copy me please');
  await field(page, 'Story title').fill('A story to copy');
  await copyLetter(page);

  const copied = await clipboard(page);
  await showCode(page);
  expect(copied).toBe(await codeBox(page).inputValue());
  expect(copied).toMatch(/^<div\b/);
  expect(copied.slice(0, 400)).toContain('display:none');
  expect(copied).toContain('Copy me please');
  expect(copied).toMatch(/About an? \d+ minute read\./);
  expect(lintOutput(copied, { monthly: true })).toEqual([]);
  // Outlook conditional comments may hold a style block (spec 6), so look outside them.
  const outsideMso = copied.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, '');
  expect(outsideMso).not.toMatch(/<script|<style|\sclass=|\sid=|\sdata-/i);
  expect(outsideMso).not.toContain(String.fromCharCode(0x2014));

  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('switching Around the pack off removes it, and Undo and Ctrl+Z bring things back', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await openLetter(page);
  const around = section(page, 'Around the pack');
  await around.getByLabel('Intro line').fill('News from the dens');
  const body = frame(page, 600).locator('body');
  await expect(body).toContainText('Around the pack');
  await codeContaining(page, 'Around the pack');

  const sw = panel(page).getByRole('switch', { name: 'Include "Around the pack" in the letter' });
  await expect(sw).toBeChecked();
  await sw.uncheck();
  await expect(body).not.toContainText('Around the pack');
  await expect(codeBox(page)).not.toHaveValue(/Around the pack/);
  await copyLetter(page);
  expect(await clipboard(page)).not.toContain('Around the pack');

  await panel(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(sw).toBeChecked();
  await expect(body).toContainText('Around the pack');
  await expect(codeBox(page)).toHaveValue(/Around the pack/);
  await copyLetter(page);
  expect(await clipboard(page)).toContain('Around the pack');

  // Ctrl+Z inside a text field undoes one typed character.
  const summary = field(page, 'Summary line');
  await summary.click();
  await summary.pressSequentially('abc');
  await expect(summary).toHaveValue('abc');
  await summary.press('Control+z');
  await expect(summary).toHaveValue('ab');

  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('moving a story block up changes the order in the preview', async ({ page, context }) => {
  const seen = await watch(context, page);
  await openLetter(page);
  await addBlock(page, 'Contributor: A name tag, then paragraphs and bullet lists');
  await block(page, 1).getByLabel('Name on the name tag').fill('Alpha');
  await addBlock(page, 'Contributor: A name tag, then paragraphs and bullet lists');
  await block(page, 2).getByLabel('Name on the name tag').fill('Beta');

  const body = frame(page, 600).locator('body');
  await expect(body).toContainText('BETA');
  const order = async () => {
    const t = await body.innerText();
    return t.indexOf('ALPHA') < t.indexOf('BETA') ? 'alpha first' : 'beta first';
  };
  expect(await order()).toBe('alpha first');

  await panel(page)
    .getByRole('button', { name: /^Move up: block 2/ })
    .click();
  await expect.poll(order).toBe('beta first');
  await expect(block(page, 1).getByLabel('Name on the name tag')).toHaveValue('Beta');

  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('the letter keeps its content when switching to the converter and back', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await openLetter(page);
  await field(page, 'Summary line').fill('Keep this summary');
  await addBlock(page, 'Contributor: A name tag, then paragraphs and bullet lists');
  await block(page, 1).getByLabel('Name on the name tag').fill('Stays Put');

  await page.getByRole('tab', { name: 'Weekly announcement' }).click();
  await expect(panel(page)).toBeHidden();
  await page.getByRole('tab', { name: 'Monthly letter' }).click();
  await expect(panel(page)).toBeVisible();

  await expect(field(page, 'Summary line')).toHaveValue('Keep this summary');
  await expect(block(page, 1).getByLabel('Name on the name tag')).toHaveValue('Stays Put');
  await expect(frame(page, 600).locator('body')).toContainText('Keep this summary');

  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('hostile text is escaped, fires nothing and the copy still lints clean', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  const hostile = '<script>alert(1)</script> --> <![endif]--> "quoted"';
  await openLetter(page);
  await field(page, 'Summary line').fill(hostile);
  await addBlock(page, 'Contributor: A name tag, then paragraphs and bullet lists');
  await block(page, 1).getByLabel('Name on the name tag').fill(hostile);
  await section(page, 'Photo and story ask').getByLabel('Link address').fill(hostile);

  const body = frame(page, 600).locator('body');
  await expect(body).toContainText('alert(1)');
  await copyLetter(page);
  const copied = await clipboard(page);
  expect(copied).not.toContain('<script');
  expect(copied).toContain('alert(1)');
  expect(lintOutput(copied, { monthly: true })).toEqual([]);
  // The text is still visible as text, not run.
  await expect(body).toContainText('"quoted"');
  await page.waitForTimeout(300);

  expect(seen.dialogs).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('at 360px wide the letter tab has no horizontal page overflow', async ({ page, context }) => {
  const seen = await watch(context, page);
  await page.setViewportSize({ width: 360, height: 740 });
  await openLetter(page);
  await addBlock(page, 'Stat band: Two big numbers, such as 48 families');
  await section(page, 'Coming up').getByRole('button', { name: 'Add an event' }).click();
  await expect(frame(page, 360).locator('body')).toContainText('Hi Pack 137 families,');
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.doc).toBeLessThanOrEqual(0);
  expect(overflow.body).toBeLessThanOrEqual(0);

  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});
