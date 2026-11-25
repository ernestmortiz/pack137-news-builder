/** Finish photos: TroopTrack's code with photos inserted comes back with descriptions and sizes. */
import { expect, test } from '@playwright/test';
import { lintOutput } from '../../src/core/lint-output';
import { clipboard, expectClean, guard, openLetter, panel } from './release-helpers';

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('two photo spots become two described, phone-sized photos', async ({ page, context }) => {
  const seen = await guard(context);
  await page.goto('/');
  await openLetter(page);

  const descriptions = ['Scouts at the campfire', 'A finished lanyard'];
  for (const alt of descriptions) {
    await panel(page)
      .getByLabel('Kind of block to add')
      .selectOption({ label: 'Photo: One picture with a caption' });
    await panel(page)
      .locator('section.letter-section')
      .filter({ has: page.getByRole('heading', { name: 'Feature story', exact: true }) })
      .getByRole('button', { name: 'Add block', exact: true })
      .click();
    await panel(page).getByLabel('Photo description (required)').last().fill(alt);
  }

  // The spots are listed, and copying is not blocked.
  await expect(panel(page).getByText('Photo 2 is a photo spot.')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Copy letter HTML' }).click();
  await expect(panel(page).getByText('Copied', { exact: true })).toBeVisible();
  const copied = await clipboard(page);
  const spots = copied.match(/<p [^>]*>Insert photo here: [^<]*<\/p>/g) ?? [];
  expect(spots).toHaveLength(2);

  // What TroopTrack's editor might give back: Froala-style images in place of the spots.
  let fromTrooptrack = copied;
  spots.forEach((spot, i) => {
    fromTrooptrack = fromTrooptrack.replace(
      spot,
      `<img src="https://trooptrack.example/photos/${i + 1}.jpg" style="width: 300px;" class="fr-fic fr-dib">`,
    );
  });
  await panel(page).getByLabel("Paste TroopTrack's code here").fill(fromTrooptrack);
  await expect(panel(page).getByRole('button', { name: 'Copy finished HTML' })).toBeEnabled();
  for (const width of [360, 390, 600]) {
    await expect(
      panel(page)
        .frameLocator(`iframe[title="Finished preview, ${width} pixels wide"]`)
        .locator('body'),
    ).toContainText('Hi Pack 137 families,');
  }

  await panel(page).getByRole('button', { name: 'Copy finished HTML' }).click();
  await expect(
    panel(page).locator('.finish-photos').getByText('Copied', { exact: true }),
  ).toBeVisible();
  const finished = await clipboard(page);

  const imgs = finished.match(/<img\b[^>]*>/g) ?? [];
  const photos = imgs.filter((tag) => tag.includes('trooptrack.example'));
  expect(photos).toHaveLength(2);
  expect(photos[0]).toContain(`alt="${descriptions[0]}"`);
  expect(photos[1]).toContain(`alt="${descriptions[1]}"`);
  for (const tag of photos) expect(tag).toMatch(/max-width:\s*\d+px/);
  expect(finished).not.toMatch(/\sclass\s*=/i);
  expect(finished).not.toContain('Insert photo here');
  expect(lintOutput(finished, { monthly: true })).toEqual([]);
  expectClean(seen);
});
