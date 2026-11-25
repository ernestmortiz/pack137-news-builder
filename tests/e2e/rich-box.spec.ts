/**
 * Browser tests for the rich text box (docs/plans/rich-editing.md, step 1). It is used for the
 * Message layout's paragraphs and the Call to action paragraph. Same watch as the converter tests:
 * every non-local request is aborted and counted, and dialogs and page errors are recorded.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

const DEN15 =
  '<p>Den Meeting on Dec 16th - <a href="https://pack137.trooptrack.com/plan/events/1847519">Fun On The Run</a></p>';

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

/** Pastes the snippet into the big box and switches to the Message layout. */
async function openMessage(page: Page, html = DEN15): Promise<Locator> {
  await page.goto('/');
  await page.getByLabel('Paste the old HTML here').fill(html);
  await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeVisible();
  await page.getByRole('radio', { name: /^Message/ }).check();
  const box = page.getByRole('textbox', { name: /^Text of paragraph 1/ });
  await expect(box).toBeVisible();
  return box;
}

/** A paste event with clipboard data, as the browser would send it. */
async function pasteInto(box: Locator, data: { html?: string; text?: string }) {
  await box.focus();
  await box.evaluate((node, d) => {
    const transfer = new DataTransfer();
    if (d.html !== undefined) transfer.setData('text/html', d.html);
    transfer.setData('text/plain', d.text ?? '');
    node.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  }, data);
}

const toolbar = (page: Page) =>
  page.getByRole('toolbar', { name: /^Formatting for Text of paragraph 1/ });
const codeBox = (page: Page) => page.locator('#code-box');
async function showCode(page: Page) {
  if (!(await codeBox(page).isVisible())) await page.getByText('Show the code').click();
}
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('a pasted link shows as a link in the box, with no codes', async ({ page, context }) => {
  const seen = await watch(context, page);
  // In the Message layout the last link becomes the button (since 1.1.1), so the text alone shows
  // here. Other links stay links in the box.
  const plain = await openMessage(page);
  await expect(plain).toHaveText('Den Meeting on Dec 16th - Fun On The Run');
  await expect(page.getByLabel('Button link')).toHaveValue(
    'https://pack137.trooptrack.com/plan/events/1847519',
  );
  const box = await openMessage(
    page,
    '<p>Den Meeting on <a href="https://pack137.trooptrack.com/plan/events/1847519">Dec 16th</a> - bring a chair and see <a href="https://example.org/map">the map</a> or <a href="https://example.org/rsvp">RSVP here</a></p>',
  );
  const link = box.locator('a').first();
  await expect(link).toHaveText('Dec 16th');
  await expect(link).toHaveAttribute('title', 'https://pack137.trooptrack.com/plan/events/1847519');
  await expect(box).not.toContainText('](');
  await expect(box).not.toContainText('**');
  // It is labelled by the visible label, and is a multi line text box.
  await expect(box).toHaveAttribute('aria-multiline', 'true');
  await expect(box).toHaveAttribute('contenteditable', 'true');
  await expect(
    page.getByText(/^Select words, then press Bold, Italic, Strike or Link\./),
  ).toBeVisible();
  // Clicking the link does not open it.
  await link.click();
  expect(page.url()).toBe('http://localhost:4173/');
  expect(seen.remote).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test('Bold shows in the preview, and Ctrl+Z undoes it', async ({ page, context }) => {
  const seen = await watch(context, page);
  const box = await openMessage(page);
  await box.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Control+Shift+ArrowRight'); // "Den "
  await page.keyboard.press('Control+Shift+ArrowRight');
  const bold = toolbar(page).getByRole('button', { name: 'Bold' });
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await expect(box.locator('strong')).toHaveText(/^Den/);
  await expect(frame(page, 390).locator('strong').first()).toContainText('Den');
  await page.keyboard.press('Control+z');
  await expect(box.locator('strong')).toHaveCount(0);
  await expect(frame(page, 390).locator('strong')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(box.locator('strong')).toHaveCount(1);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('Ctrl+B and Ctrl+I work in the box, and Strike from the toolbar', async ({
  page,
  context,
}) => {
  await watch(context, page);
  const box = await openMessage(page);
  await box.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Control+i');
  await expect(box.locator('strong em, em strong')).toHaveCount(1);
  await toolbar(page).getByRole('button', { name: 'Strike' }).click();
  await expect(box.locator('s')).toHaveCount(1);
  await showCode(page);
  await expect(codeBox(page)).toHaveValue(/<strong/);
  await expect(codeBox(page)).toHaveValue(/<em/);
  await expect(codeBox(page)).toHaveValue(/<s>/);
});

test('Bold with nothing selected marks the next typed words, and Ctrl+Z undoes them', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  const box = await openMessage(page);
  await box.focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' ');
  const bold = toolbar(page).getByRole('button', { name: 'Bold' });
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  // Ctrl+B with a cursor and nothing selected: the button shows it, and no note appears.
  await page.keyboard.press('Control+b');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Select some words first/)).toHaveCount(0);
  await page.keyboard.type('Bring a hat');
  await expect(box.locator('strong')).toHaveText('Bring a hat');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await expect(frame(page, 390).locator('strong')).toHaveText('Bring a hat');
  await showCode(page);
  await expect(codeBox(page)).toHaveValue(/<strong[^>]*>Bring a hat<\/strong>/);
  // The words before it stay plain.
  await expect(box).toHaveText('Den Meeting on Dec 16th - Fun On The Run Bring a hat');
  // Undo takes the typed words back, as typing is undone anywhere else in the app.
  for (let i = 0; i < 'Bring a hat'.length; i++) await page.keyboard.press('Control+z');
  await expect(box.locator('strong')).toHaveCount(0);
  await expect(frame(page, 390).locator('strong')).toHaveCount(0);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('pending marks: the toolbar button toggles them, moving the cursor drops them', async ({
  page,
  context,
}) => {
  await watch(context, page);
  const box = await openMessage(page);
  await box.focus();
  await page.keyboard.press('Control+End');
  const italic = toolbar(page).getByRole('button', { name: 'Italic' });
  // Pressed with the mouse: the cursor stays in the box, and the next letters are italic.
  await italic.click();
  await expect(italic).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('ab');
  await expect(box.locator('em')).toHaveText('ab');
  // Pressing again turns it off for the next letters.
  await italic.click();
  await expect(italic).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.type('cd');
  await expect(box.locator('em')).toHaveText('ab');
  // Press Strike, then move the cursor away and back: it is dropped.
  const strike = toolbar(page).getByRole('button', { name: 'Strike' });
  await strike.click();
  await expect(strike).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(strike).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('ef');
  await expect(box.locator('s')).toHaveCount(0);
  // Bold, then click elsewhere in the page: dropped too.
  await page.keyboard.press('Control+b');
  const bold = toolbar(page).getByRole('button', { name: 'Bold' });
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('heading', { name: 'Edit the announcement' }).click();
  await box.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('gh');
  await expect(box.locator('strong')).toHaveCount(0);
});

test('Bold with nothing selected inside bold words turns bold off for the next letters', async ({
  page,
  context,
}) => {
  await watch(context, page);
  const box = await openMessage(page);
  await box.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Control+b');
  await page.keyboard.press('End');
  const bold = toolbar(page).getByRole('button', { name: 'Bold' });
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+b');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.type('!');
  await expect(box.locator('strong')).toHaveText('Den Meeting on Dec 16th - Fun On The Run');
  await expect(box).toHaveText('Den Meeting on Dec 16th - Fun On The Run!');
});

test('Link with nothing selected still says a link needs words', async ({ page, context }) => {
  await watch(context, page);
  const box = await openMessage(page);
  await box.focus();
  await page.keyboard.press('Control+End');
  await toolbar(page).getByRole('button', { name: 'Link', exact: true }).click();
  await expect(
    page.getByText('Select the words you want to turn into a link first.'),
  ).toBeVisible();
});

test('a link added through the panel reaches the code, and a javascript: address is refused', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  const box = await openMessage(page, '<p>Please read the camp page today</p>');
  await box.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('Control+Shift+ArrowRight'); // "the camp " style selection
  await page.keyboard.press('Control+k');
  const address = page.getByLabel('Link address', { exact: true });
  await expect(address).toBeFocused();

  await address.fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save link' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'cannot be used' })).toBeVisible();
  await expect(box.locator('a')).toHaveCount(0);

  await address.fill('https://example.org/camp');
  await address.press('Enter');
  await expect(page.getByLabel('Link address', { exact: true })).toBeHidden();
  await expect(box.locator('a')).toHaveAttribute('href', 'https://example.org/camp');
  await expect(box).toBeFocused();

  await showCode(page);
  await expect(codeBox(page)).toHaveValue(/href="https:\/\/example\.org\/camp"/);
  expect(await codeBox(page).inputValue()).not.toMatch(/javascript:|alert\(/i);

  // Remove link takes it off again.
  await box.locator('a').click();
  await toolbar(page).getByRole('button', { name: 'Remove link' }).click();
  await expect(box.locator('a')).toHaveCount(0);
  expect(seen.dialogs).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('Enter makes a line break, not a new paragraph', async ({ page, context }) => {
  await watch(context, page);
  const box = await openMessage(page, '<p>One</p>');
  await box.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Two');
  await expect(box).toHaveText('OneTwo');
  await expect(box.locator('br')).not.toHaveCount(0);
  await expect(page.getByRole('group', { name: /^Paragraph 2/ })).toHaveCount(0);
  await expect(frame(page, 390).locator('body')).toContainText('Two');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(box).toHaveText('One');
});

test('pasting hostile HTML into the box runs nothing and brings only text', async ({
  page,
  context,
}) => {
  const seen = await watch(context, page);
  const box = await openMessage(page, '<p>Start</p>');
  await pasteInto(box, {
    html:
      '<p>Safe words</p><script>window.__ran = 1; alert(1)</script>' +
      '<img src=x onerror="window.__ran = 2; alert(2)">' +
      '<p><a href="javascript:window.__ran = 3">bad link</a> and <b>bold</b></p>',
    text: 'Safe words bad link and bold',
  });
  await page.waitForTimeout(400);
  await expect(box).toContainText('Safe words');
  await expect(box).toContainText('bad link');
  await expect(box.locator('script, img')).toHaveCount(0);
  await expect(box.locator('a')).toHaveCount(0);
  await expect(box.locator('strong')).toHaveText('bold');
  expect(
    await page.evaluate(() => (window as unknown as { __ran?: number }).__ran),
  ).toBeUndefined();
  await showCode(page);
  const code = await codeBox(page).inputValue();
  expect(code).not.toMatch(/<script|onerror|javascript:|alert\(/i);
  expect(seen.dialogs).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect(seen.remote).toEqual([]);
});

test('pasting plain text turns lines into breaks', async ({ page, context }) => {
  await watch(context, page);
  const box = await openMessage(page, '<p>Hi</p>');
  await pasteInto(box, { text: 'first\nsecond' });
  await expect(box).toContainText('first');
  await expect(box.locator('br')).toHaveCount(1);
});

test('works at 360px wide with no sideways scroll, and buttons are 44px tall', async ({
  page,
  context,
}) => {
  await watch(context, page);
  await page.setViewportSize({ width: 360, height: 800 });
  const box = await openMessage(page);
  await toolbar(page).scrollIntoViewIfNeeded();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  for (const name of ['Bold', 'Italic', 'Strike', 'Link', 'Remove link']) {
    const b = await toolbar(page).getByRole('button', { name, exact: true }).boundingBox();
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(b?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
  // Even a long unbroken address does not push the page wider.
  await pasteInto(box, { text: 'x'.repeat(300) });
  await toolbar(page).getByRole('button', { name: 'Link', exact: true }).click();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('the toolbar works from the keyboard alone', async ({ page, context }) => {
  const seen = await watch(context, page);
  const box = await openMessage(page, '<p>Hello world</p>');
  await box.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  // Shift+Tab leaves the box for the toolbar, which has one tab stop.
  await page.keyboard.press('Shift+Tab');
  const bold = toolbar(page).getByRole('button', { name: 'Bold' });
  await expect(bold).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar(page).getByRole('button', { name: 'Italic' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(bold).toBeFocused();
  await page.keyboard.press('Space');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await expect(box.locator('strong')).toHaveText('Hello world');
  // The arrow keys wrap, and Tab leaves the toolbar in one press.
  await page.keyboard.press('End');
  await expect(toolbar(page).getByRole('button', { name: 'Remove link' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(toolbar(page).getByRole('button')).not.toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove link' }).first()).not.toBeFocused();
  // Link from the keyboard: open, Escape closes and puts focus back in the box.
  await box.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Control+k');
  await expect(page.getByLabel('Link address', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(box).toBeFocused();
  expect(seen.errors).toEqual([]);
});

test('the Call to action paragraph uses the box too', async ({ page, context }) => {
  await watch(context, page);
  await openMessage(page);
  await page.getByRole('radio', { name: /^Call to action/ }).check();
  const box = page.getByRole('textbox', { name: 'Paragraph' });
  await expect(box).toHaveAttribute('contenteditable', 'true');
  await box.focus();
  await page.keyboard.type(' Bring a chair.');
  await expect(frame(page, 390).locator('body')).toContainText('Bring a chair.');
});

test('other rich fields use the box too', async ({ page, context }) => {
  await watch(context, page);
  await openMessage(page);
  await page.getByRole('radio', { name: /^Link list/ }).check();
  await expect(page.getByRole('textbox', { name: 'Intro' })).toHaveAttribute(
    'contenteditable',
    'true',
  );
  await expect(page.locator('textarea.rich')).toHaveCount(0);
});
