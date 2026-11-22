/**
 * The other-tab warning. Two pages share one browser context, so they share device storage.
 * A change made in tab B must warn tab A and stop tab A saving over it, until the person
 * chooses "Keep my version here".
 */
import { expect, test } from '@playwright/test';
import { expectClean, guard, openLetter, panel } from './release-helpers';

const readKey = (page: import('@playwright/test').Page, key: string) =>
  page.evaluate((k) => window.localStorage.getItem(k), key);

test('a change in tab B warns tab A, A does not overwrite it, Keep my version here saves', async ({
  context,
}) => {
  const seen = await guard(context);
  const a = await context.newPage();
  await a.goto('/');
  await openLetter(a);
  const summary = panel(a).getByLabel('Summary line', { exact: true });
  await summary.fill('First version from A');
  await expect(panel(a).getByText(/^Saved on this device at /)).toBeVisible();
  expect(await readKey(a, 'pack137:letter-draft')).toContain('First version from A');

  const warning = a.getByText('changed in another tab', { exact: false });
  await expect(warning).toBeHidden();

  // Tab B changes the contact email.
  const b = await context.newPage();
  await b.goto('/');
  await b.getByRole('tab', { name: 'Settings' }).click();
  await b
    .locator('#panel-settings')
    .getByLabel('Contact email', { exact: true })
    .fill('tabb@example.org');
  await expect.poll(() => readKey(b, 'pack137:settings')).toContain('tabb@example.org');

  await expect(warning).toBeVisible();
  await expect(a.getByRole('button', { name: 'Keep my version here' })).toBeVisible();

  // A keeps typing. Its autosave is held back, so the stored draft stays as it was
  // and B's settings are not overwritten.
  await a.bringToFront();
  await summary.fill('Second version from A');
  await a.waitForTimeout(1800);
  expect(await readKey(a, 'pack137:letter-draft')).toContain('First version from A');
  expect(await readKey(a, 'pack137:letter-draft')).not.toContain('Second version from A');
  expect(await readKey(a, 'pack137:settings')).toContain('tabb@example.org');
  await expect(warning).toBeVisible();

  // Keep my version here: A's letter and settings are saved now, and the warning goes.
  await a.getByRole('button', { name: 'Keep my version here' }).click();
  await expect(warning).toBeHidden();
  await expect.poll(() => readKey(a, 'pack137:letter-draft')).toContain('Second version from A');
  expect(await readKey(a, 'pack137:settings')).not.toContain('tabb@example.org');

  // And autosave works again afterwards.
  await summary.fill('Third version from A');
  await expect
    .poll(() => readKey(a, 'pack137:letter-draft'), { timeout: 6000 })
    .toContain('Third version from A');
  expectClean(seen);
});

test('Reload in the warning shows what tab B saved', async ({ context }) => {
  const seen = await guard(context);
  const a = await context.newPage();
  await a.goto('/');
  const b = await context.newPage();
  await b.goto('/');
  await b.getByRole('tab', { name: 'Settings' }).click();
  await b
    .locator('#panel-settings')
    .getByLabel('Contact email', { exact: true })
    .fill('reload@example.org');
  await expect(a.getByText('changed in another tab', { exact: false })).toBeVisible();
  await a.getByRole('button', { name: 'Reload' }).click();
  await a.getByRole('tab', { name: 'Settings' }).click();
  await expect(
    a.locator('#panel-settings').getByLabel('Contact email', { exact: true }),
  ).toHaveValue('reload@example.org');
  expectClean(seen);
});
