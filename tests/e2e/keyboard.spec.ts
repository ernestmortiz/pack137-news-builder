/**
 * Keyboard-only operation (build spec 11.4): the converter flow and a short letter are completed
 * with Tab, Shift+Tab, Enter, Space and the arrow keys, with no pointer clicks after the page loads.
 * Every focus stop is also checked for a visible focus indicator (a computed outline or box-shadow).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { lintOutput } from '../../src/core/lint-output';
import { clipboard, expectClean, frame, guard, letterFrame, panel } from './release-helpers';

const input = readFileSync(
  fileURLToPath(new URL('../fixtures/weekly/1-pack-calendar.input.html', import.meta.url)),
  'utf8',
);

/** What the focused element is called, and whether it shows a focus indicator. */
interface Focus {
  name: string;
  tag: string;
  id: string;
  indicator: boolean;
  detail: string;
}

const focused = (page: Page): Promise<Focus> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { name: '', tag: '', id: '', indicator: false, detail: 'no focus' };
    const label = (el as HTMLInputElement).labels?.[0]?.textContent ?? '';
    const name = (
      el.getAttribute('aria-label') ||
      label ||
      el.getAttribute('title') ||
      el.textContent ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();
    const s = getComputedStyle(el);
    const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    const shadow = s.boxShadow !== 'none';
    // Radios and switches may show the indicator on the box or label that wraps them.
    const wrap = el.closest('label, .choice, .layout-option, .switch') as HTMLElement | null;
    const ws = wrap ? getComputedStyle(wrap) : null;
    const wrapped = ws
      ? (ws.outlineStyle !== 'none' && parseFloat(ws.outlineWidth) > 0) || ws.boxShadow !== 'none'
      : false;
    return {
      name,
      tag: el.tagName.toLowerCase(),
      id: el.id,
      // A date field has inner parts. On the last Tab stop the browser's own calendar button holds
      // focus, the input is still document.activeElement but is no longer :focus-visible, and
      // Chromium draws its native ring on that button. The earlier stops show the app's ring.
      indicator:
        outline ||
        shadow ||
        wrapped ||
        (el instanceof HTMLInputElement && el.type === 'date' && !el.matches(':focus-visible')),
      detail: `outline=${s.outlineStyle} ${s.outlineWidth} shadow=${s.boxShadow}`,
    };
  });

/** Presses Tab (or Shift+Tab) until the focused control's name matches, checking each stop. */
async function tabTo(
  page: Page,
  name: RegExp | string,
  opts: { back?: boolean; max?: number; stops?: Focus[] } = {},
): Promise<Focus> {
  const max = opts.max ?? 250;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(opts.back ? 'Shift+Tab' : 'Tab');
    const f = await focused(page);
    opts.stops?.push(f);
    const hit = typeof name === 'string' ? f.name === name : name.test(f.name);
    if (hit) return f;
  }
  throw new Error(`Never reached "${String(name)}" with the keyboard in ${max} presses`);
}

function expectIndicators(stops: Focus[]) {
  const missing = stops
    .filter((s) => !s.indicator)
    .map((s) => `${s.tag}#${s.id} "${s.name}" (${s.detail})`);
  expect(missing).toEqual([]);
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('converter: the whole flow with the keyboard, and every stop shows focus', async ({
  page,
  context,
}) => {
  const seen = await guard(context);
  await page.goto('/');
  await page.evaluate((text) => navigator.clipboard.writeText(text), input);
  const stops: Focus[] = [];

  // The tabs: Tab lands on the selected one, the arrow keys move between them.
  const skip = await tabTo(page, /./, { stops });
  expect(skip.name).toBe('Skip to the editor');
  await tabTo(page, 'Weekly announcement', { stops });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Monthly letter' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Monthly letter' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Weekly announcement' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expectIndicators([await focused(page)]);

  // Paste into the paste box with Ctrl+V.
  await tabTo(page, 'Paste the old HTML here', { stops });
  await page.keyboard.press('Control+v');
  await expect(page.getByRole('heading', { name: 'Edit the announcement' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Date list/ })).toBeChecked();

  // Pick a layout with the arrow keys.
  await tabTo(page, /^Date list/, { stops });
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /^Help wanted/ })).toBeFocused();
  await expect(page.getByRole('radio', { name: /^Help wanted/ })).toBeChecked();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('radio', { name: /^Date list/ })).toBeChecked();
  // Date list is the right one for this paste. Move off and back with Shift+Tab and Tab.
  await page.keyboard.press('Shift+Tab');
  const before = await focused(page);
  expect(before.name).not.toMatch(/^Date list/);
  await page.keyboard.press('Tab');
  expect((await focused(page)).name).toMatch(/^Date list/);

  // Edit the label.
  await tabTo(page, 'Label (the small tag at the top)', { stops });
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Keyboard news');
  await expect(frame(page, 375).locator('body')).toContainText('Keyboard news');

  // Show the code with Space, then copy with Enter.
  await tabTo(page, 'Copy new HTML', { stops, max: 900 });
  await page.keyboard.press('Enter');
  await expect(page.getByText('Copied', { exact: true })).toBeVisible();
  const copied = await clipboard(page);
  expect(copied).toContain('Keyboard&nbsp;news');
  expect(lintOutput(copied)).toEqual([]);
  await tabTo(page, 'Show the code', { stops });
  await page.keyboard.press('Space');
  await expect(page.locator('#code-box')).toBeVisible();
  expect(await page.locator('#code-box').inputValue()).toBe(copied);

  expectIndicators(stops);
  expectClean(seen);
});

test('letter: a short letter with the keyboard, add a story block, undo and redo', async ({
  page,
  context,
}) => {
  const seen = await guard(context);
  await page.goto('/');
  const stops: Focus[] = [];

  await tabTo(page, 'Weekly announcement', { stops });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Monthly letter' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(panel(page).getByRole('heading', { name: 'Edit the letter' })).toBeVisible();

  await tabTo(page, 'Summary line', { stops });
  await page.keyboard.type('Typed with the keyboard');
  await tabTo(page, 'Story title', { stops });
  await page.keyboard.type('A keyboard story');
  await expect(letterFrame(page, 600).locator('body')).toContainText('A keyboard story');

  // Choose a block kind with the arrow keys, add it with Enter.
  const kind = await tabTo(page, 'Kind of block to add', { stops });
  expect(kind.tag).toBe('select');
  await page.keyboard.press('ArrowDown');
  const add = await tabTo(page, 'Add block', { stops });
  expect(add.tag).toBe('button');
  await page.keyboard.press('Enter');
  const group = panel(page).getByRole('group', { name: /^Block 1:/ });
  await expect(group).toBeVisible();

  // The app moves focus to the first field of the new block (a photo address for the second kind).
  const addr = panel(page).getByLabel('Photo address');
  await expect(addr).toBeFocused();
  expectIndicators([await focused(page)]);
  await page.keyboard.type('ab');
  await expect(addr).toHaveValue('ab');

  // Ctrl+Z takes back the typing first, then the block itself. Ctrl+Shift+Z brings both back.
  await page.keyboard.press('Control+z');
  await expect(addr).toHaveValue('a');
  await page.keyboard.press('Control+z');
  await expect(addr).toHaveValue('');
  await expect(group).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(group).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(group).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(addr).toHaveValue('a');

  // Copy with Space.
  await tabTo(page, 'Copy letter HTML', { stops });
  await page.keyboard.press('Space');
  await expect(panel(page).getByText('Copied', { exact: true })).toBeVisible();
  const copied = await clipboard(page);
  expect(copied).toContain('Typed with the keyboard');
  expect(copied).toContain('A keyboard story');
  expect(lintOutput(copied, { monthly: true })).toEqual([]);

  expectIndicators(stops);
  expectClean(seen);
});

test('settings tab: reachable and operable by keyboard with visible focus', async ({
  page,
  context,
}) => {
  const seen = await guard(context);
  await page.goto('/');
  const stops: Focus[] = [];
  await tabTo(page, 'Weekly announcement', { stops });
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await tabTo(page, 'Contact email', { stops });
  await page.keyboard.press('Control+a');
  await page.keyboard.type('keys@example.org');
  await expect(page.locator('#panel-settings').getByText(/mailto:keys@example\.org/)).toBeVisible();
  expectIndicators(stops);
  expectClean(seen);
});

test('canary: the focus probe does fail when the focus ring is removed', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({
    content: '*:focus, *:focus-visible { outline: none !important; box-shadow: none !important; }',
  });
  const stops: Focus[] = [];
  await tabTo(page, 'Weekly announcement', { stops });
  expect(stops.every((s) => !s.indicator)).toBe(true);
  expect(() => expectIndicators(stops)).toThrow();
});
