/**
 * Browser end to end tests for the Settings tab, autosave and draft files (build spec 8.3, 9, 11.3).
 * Every request that is not to the local preview server is aborted and counted, and the count must
 * be zero in every test, with no page errors and no dialogs. Each test gets its own browser context,
 * so device storage never leaks from one test to the next. Letter locators sit under #panel-monthly.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

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

function expectClean(seen: Watch) {
  expect(seen.remote).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.dialogs).toEqual([]);
}

const panel = (page: Page) => page.locator('#panel-monthly');
const settingsPanel = (page: Page) => page.locator('#panel-settings');
const frame600 = (page: Page) =>
  panel(page).frameLocator('iframe[title="Preview, 600 pixels wide"]');
const codeBox = (page: Page) => panel(page).locator('#letter-code-box');
const field = (page: Page, label: string) => panel(page).getByLabel(label, { exact: true });
const setting = (page: Page, label: string) =>
  settingsPanel(page).getByLabel(label, { exact: true });

async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name }).click();
}

async function openLetter(page: Page) {
  await openTab(page, 'Monthly letter');
  await expect(panel(page).getByRole('heading', { name: 'Edit the letter' })).toBeVisible();
}

async function openSettings(page: Page) {
  await openTab(page, 'Settings');
  await expect(settingsPanel(page).getByRole('heading', { name: 'Settings' })).toBeVisible();
}

async function letterCode(page: Page): Promise<string> {
  if (!(await codeBox(page).isVisible())) await panel(page).getByText('Show the code').click();
  return codeBox(page).inputValue();
}

async function copyLetter(page: Page): Promise<string> {
  await panel(page).getByRole('button', { name: 'Copy letter HTML' }).click();
  await expect(panel(page).getByText('Copied', { exact: true })).toBeVisible();
  return page.evaluate(() => navigator.clipboard.readText());
}

/** Waits past the 400 ms settings pause and the 1 second autosave pause, then reloads. */
async function reloadAfterSave(page: Page) {
  await expect(panel(page).getByText(/^Saved on this device at /)).toBeVisible();
  await page.reload();
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('feedback email: a bad value shows its problem, a good one reaches the letter, restore brings the default back', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await page.goto('/');
  await openSettings(page);
  const feedback = setting(page, 'Feedback email');
  const defaultValue = await feedback.inputValue();
  expect(defaultValue).toMatch(/@/);

  await feedback.fill('pack@x.org?bcc=evil@x.org');
  const problem = feedback.locator('xpath=following-sibling::p[contains(@class,"warn")]');
  await expect(problem).toBeVisible();
  await expect(problem).toContainText('must be one plain address');
  await expect(feedback).toHaveAttribute('aria-invalid', 'true');

  await feedback.fill('news@example.org');
  await expect(problem).toBeHidden();
  await expect(settingsPanel(page).getByText(/mailto:news@example\.org/)).toBeVisible();

  await openLetter(page);
  await expect(frame600(page).locator('a[href^="mailto:news@example.org"]').first()).toBeAttached();
  const html = await copyLetter(page);
  expect(html).toContain('mailto:news@example.org');
  expect(html).not.toContain('evil@x.org');

  await openSettings(page);
  await settingsPanel(page).getByRole('button', { name: 'Restore Pack 137 defaults' }).click();
  await settingsPanel(page).getByRole('button', { name: 'Yes, restore the defaults' }).click();
  await expect(setting(page, 'Feedback email')).toHaveValue(defaultValue);
  await openLetter(page);
  const restored = await copyLetter(page);
  expect(restored).toContain(`mailto:${defaultValue}`);
  expect(restored).not.toContain('news@example.org');
  expectClean(seen);
});

test('program year start month changes the year given to a date with no year', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  // Fixed clock: Nov 22 2026. "Sep 1" is 82 days back. It stays in 2026 when the program year starts
  // in September (the default), and moves to 2027 when the program year starts in November.
  await page.clock.setFixedTime(new Date(2026, 10, 22, 12, 0, 0));
  await page.goto('/');
  const html = '<p>Sep 1 - Pack Meeting at the church</p><p>Sep 8 - Pizza Night</p>';

  async function startDate(): Promise<string> {
    await page.getByLabel('Paste the old HTML here').fill(html);
    await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeVisible();
    const input = page.locator('#panel-converter input[type="date"]').first();
    await expect(input).toBeVisible();
    return input.inputValue();
  }

  expect(await startDate()).toBe('2026-09-01');

  await openSettings(page);
  await setting(page, 'Program year starts in').selectOption({ label: 'November' });
  await expect(setting(page, 'Program year starts in')).toHaveValue('11');
  await page.waitForTimeout(600);
  await openTab(page, 'Weekly announcement');
  // Start over with a new paste.
  await page.reload();
  await page.clock.setFixedTime(new Date(2026, 10, 22, 12, 0, 0));
  expect(await startDate()).toBe('2027-09-01');
  expectClean(seen);
});

test('settings persist across a reload', async ({ page, context }) => {
  const seen = await watch(context, page);
  await page.goto('/');
  await openSettings(page);
  await setting(page, 'Contact email').fill('hello@example.org');
  await setting(page, 'Program year starts in').selectOption({ label: 'June' });
  await page.waitForTimeout(700);
  await page.reload();
  await openSettings(page);
  await expect(setting(page, 'Contact email')).toHaveValue('hello@example.org');
  await expect(setting(page, 'Program year starts in')).toHaveValue('6');
  expectClean(seen);
});

test('autosave offers three choices on the next visit and each one works', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await page.goto('/');
  await openLetter(page);
  const issueText = (await panel(page).locator('iframe[title="Preview, 600 pixels wide"]').count())
    ? await frame600(page).locator('body').innerText()
    : '';
  expect(issueText).not.toBe('');
  await field(page, 'Summary line').fill('A busy month of camp and cars');
  await reloadAfterSave(page);

  async function choices() {
    await openTab(page, 'Monthly letter');
    await expect(
      panel(page).getByRole('heading', { name: 'You have a saved letter on this device' }),
    ).toBeVisible();
    await expect(
      panel(page).getByRole('button', { name: /^Keep working on the .+ letter$/ }),
    ).toBeVisible();
    await expect(panel(page).getByRole('button', { name: /^Start .+ from it$/ })).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Start a blank letter' })).toBeVisible();
  }

  await choices();
  const keepName =
    (await panel(page)
      .getByRole('button', { name: /^Keep working on the / })
      .textContent()) ?? '';
  const month = /the (\w+ \d{4}) letter/.exec(keepName)?.[1] ?? '';
  const nextName =
    (await panel(page)
      .getByRole('button', { name: /^Start .+ from it$/ })
      .textContent()) ?? '';
  const nextMonth = /^Start (\w+ \d{4}) from it$/.exec(nextName)?.[1] ?? '';
  expect(month).toMatch(/\d{4}/);
  expect(nextMonth).toMatch(/\d{4}/);
  expect(nextMonth).not.toBe(month);

  await panel(page)
    .getByRole('button', { name: /^Keep working on the / })
    .click();
  await expect(field(page, 'Summary line')).toHaveValue('A busy month of camp and cars');
  await expect(frame600(page).locator('body')).toContainText(month);
  // Nothing was changed, so the saved draft is still the same. Save again to be sure.
  await field(page, 'Summary line').fill('A busy month of camp and cars!');
  await reloadAfterSave(page);

  await choices();
  await panel(page)
    .getByRole('button', { name: /^Start .+ from it$/ })
    .click();
  await expect(field(page, 'Summary line')).toHaveValue('');
  await expect(frame600(page).locator('body')).toContainText(nextMonth);
  await field(page, 'Summary line').fill('Next month summary');
  await reloadAfterSave(page);

  await choices();
  await panel(page).getByRole('button', { name: 'Start a blank letter' }).click();
  await expect(field(page, 'Summary line')).toHaveValue('');
  await expect(field(page, 'Story title')).toHaveValue('');
  await expect(
    panel(page).getByText('You are starting from a blank letter for next month.'),
  ).toBeVisible();
  expectClean(seen);
});

test('Download draft then Open draft of the same file restores the letter', async ({
  page,
  context,
}, testInfo) => {
  const seen = await watch(context, page);
  await page.goto('/');
  await openLetter(page);
  await field(page, 'Summary line').fill('Round trip summary');
  await field(page, 'Story title').fill('Round trip story');

  const downloading = page.waitForEvent('download');
  await panel(page).getByRole('button', { name: 'Download draft' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^pack137-letter-\d{4}-\d{2}\.json$/);
  const saved = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(saved);
  expect(JSON.parse(readFileSync(saved, 'utf8')).kind).toBe('pack137-letter-draft');

  await field(page, 'Summary line').fill('');
  await field(page, 'Story title').fill('');
  await panel(page).getByLabel('Choose a draft file to open').setInputFiles(saved);
  await panel(page).getByRole('button', { name: 'Open this draft' }).click();
  await expect(field(page, 'Summary line')).toHaveValue('Round trip summary');
  await expect(field(page, 'Story title')).toHaveValue('Round trip story');
  expectClean(seen);
});

async function chooseFile(page: Page, name: string, text: string) {
  await panel(page)
    .getByLabel('Choose a draft file to open')
    .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

test('Open draft refuses files that are not drafts', async ({ page, context }) => {
  const seen = await watch(context, page);
  await page.goto('/');
  await openLetter(page);
  await chooseFile(page, 'notes.json', 'this is { not json');
  await expect(panel(page).getByText(/^This file could not be read\./)).toBeVisible();
  await chooseFile(page, 'other.json', JSON.stringify({ kind: 'something-else', version: 1 }));
  await expect(panel(page).getByText('This file is not a Pack 137 letter draft.')).toBeVisible();
  await expect(panel(page).getByRole('heading', { name: 'Edit the letter' })).toBeVisible();
  expectClean(seen);
});

test('a hostile draft opens with notes and never runs script or keeps bad links', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await page.addInitScript(() => {
    (window as unknown as { __ran: number }).__ran = 0;
    window.alert = () => {
      (window as unknown as { __ran: number }).__ran++;
    };
  });
  await page.goto('/');
  await openLetter(page);
  const hostile = `{
    "kind": "pack137-letter-draft", "version": 1, "savedAt": "2026-11-01T12:00:00.000Z",
    "__proto__": { "x": "polluted" },
    "letter": {
      "version": 1,
      "__proto__": { "x": "polluted" },
      "constructor": { "prototype": { "x": "polluted" } },
      "issue": { "year": 2026, "month": 12 },
      "summary": "<img src=x onerror=alert(1)>",
      "story": { "title": "Hostile", "blocks": [
        { "kind": "evil-block", "html": "<script>alert(2)</script>" },
        { "kind": "paragraph", "__proto__": { "x": "polluted" } }
      ] }
    },
    "settings": {
      "__proto__": { "x": "polluted" },
      "logoUrl": "javascript:alert(3)",
      "email": { "contact": "pack@x.org?bcc=evil@x.org", "volunteer": "v@x.org", "feedback": "f@x.org?bcc=evil@x.org" }
    }
  }`;
  await chooseFile(page, 'hostile.json', hostile);
  await expect(
    panel(page).getByText('Things to know about this file', { exact: true }),
  ).toBeVisible();
  const notes = panel(page).locator('ul.warn-list li');
  expect(await notes.count()).toBeGreaterThan(0);
  // Whatever the settings choice is, the result must be safe. Keep the draft's own settings.
  const use = panel(page).getByRole('button', { name: 'Use the settings from this draft' });
  if (await use.isVisible()) await use.click();
  else await panel(page).getByRole('button', { name: 'Open this draft' }).click();
  await expect(panel(page).getByRole('heading', { name: 'Edit the letter' })).toBeVisible();
  // The summary is plain text in the field, not markup.
  await expect(field(page, 'Summary line')).toHaveValue('<img src=x onerror=alert(1)>');
  const html = await copyLetter(page);
  expect(html).not.toContain('evil@x.org');
  expect(html.toLowerCase()).not.toContain('javascript:');
  expect(html).not.toContain('<img src=x');
  expect(html).not.toContain('<script');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (({}) as Record<string, unknown>).x)).toBeUndefined();
  expect(await page.evaluate(() => (window as unknown as { __ran: number }).__ran)).toBe(0);
  expectClean(seen);
});

test('blocked storage: the app loads, the letter works and the save note says so', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await openLetter(page);
  await field(page, 'Summary line').fill('Still works');
  await expect(panel(page).getByText('Could not save on this device')).toBeVisible();
  await expect.poll(() => letterCode(page)).toContain('Still works');
  await openSettings(page);
  await setting(page, 'Contact email').fill('hello@example.org');
  await expect(settingsPanel(page).getByText(/^Could not save on this device\./)).toBeVisible();
  expectClean(seen);
});

test('Settings tab has no horizontal overflow at 360px wide', async ({ page, context }) => {
  const seen = await watch(context, page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await openSettings(page);
  await setting(page, 'Feedback email').fill('pack@x.org?bcc=evil@x.org');
  await expect(settingsPanel(page).locator('p.warn:visible').first()).toBeVisible();
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.doc).toBeLessThanOrEqual(0);
  expect(overflow.body).toBeLessThanOrEqual(0);
  const wide: Locator = settingsPanel(page).locator('input, select, button');
  for (const box of await wide.evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().right),
  )) {
    expect(box).toBeLessThanOrEqual(360);
  }
  expectClean(seen);
});
