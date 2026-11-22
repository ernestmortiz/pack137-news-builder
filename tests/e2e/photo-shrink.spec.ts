/** Shrink a photo: a real browser makes the smaller copy, saves it, and nothing leaves the device. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { guard, openLetter, panel } from './release-helpers';

/** Opens the letter and adds a photo block, so there is a photo address field to work beside. */
async function letterWithPhoto(page: Page) {
  await page.goto('/');
  await openLetter(page);
  await panel(page)
    .getByLabel('Kind of block to add')
    .selectOption({ label: 'Photo: One picture with a caption' });
  await panel(page)
    .locator('section.letter-section')
    .filter({ has: page.getByRole('heading', { name: 'Feature story', exact: true }) })
    .getByRole('button', { name: 'Add block', exact: true })
    .click();
}

function need<T>(value: T | null): T {
  if (value === null) throw new Error('missing value');
  return value;
}

/** Makes a file in the page: a canvas of the given size, as bytes. */
async function makeImage(
  page: Page,
  kind: 'noise' | 'scene' | 'transparent',
  width: number,
  height: number,
): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ kind, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no canvas');
      if (kind === 'noise') {
        const data = ctx.createImageData(width, height);
        for (let i = 0; i < data.data.length; i += 4) {
          data.data[i] = Math.random() * 256;
          data.data[i + 1] = Math.random() * 256;
          data.data[i + 2] = Math.random() * 256;
          data.data[i + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
      } else if (kind === 'scene') {
        // Smooth shapes with a little grain, closer to a real photo than pure noise.
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, 'rgb(40,90,160)');
        gradient.addColorStop(1, 'rgb(230,170,60)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'rgb(30,110,60)';
        ctx.beginPath();
        ctx.arc(width * 0.4, height * 0.6, height * 0.3, 0, Math.PI * 2);
        ctx.fill();
        const data = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < data.data.length; i += 4) {
          const grain = Math.random() * 12 - 6;
          data.data[i] = (data.data[i] ?? 0) + grain;
          data.data[i + 1] = (data.data[i + 1] ?? 0) + grain;
          data.data[i + 2] = (data.data[i + 2] ?? 0) + grain;
        }
        ctx.putImageData(data, 0, 0);
      } else {
        ctx.fillStyle = 'rgba(255,0,0,1)';
        ctx.fillRect(width / 2, height / 2, width / 4, height / 4);
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b === null ? reject(new Error('no blob')) : resolve(b)),
          kind === 'transparent' ? 'image/png' : 'image/jpeg',
          0.95,
        ),
      );
      const reader = new FileReader();
      const url = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
      return url.slice(url.indexOf(',') + 1);
    },
    { kind, width, height },
  );
  return Buffer.from(base64, 'base64');
}

async function inspect(page: Page, bytes: Buffer) {
  return page.evaluate(async (base64) => {
    const binary = atob(base64);
    const array = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const blob = new Blob([array]);
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no canvas');
    ctx.drawImage(bitmap, 0, 0);
    return {
      width: bitmap.width,
      height: bitmap.height,
      size: array.length,
      magic: Array.from(array.slice(0, 3)),
      corner: Array.from(ctx.getImageData(2, 2, 1, 1).data),
    };
  }, bytes.toString('base64'));
}

async function readDownload(download: import('@playwright/test').Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

test('a big photo becomes a small JPEG, saved as a file, with nothing sent anywhere', async ({
  page,
  context,
}, testInfo) => {
  const seen = await guard(context);
  await letterWithPhoto(page);
  const bytes = await makeImage(page, 'scene', 4000, 3000);
  const button = page.getByRole('button', { name: 'Shrink a photo for the letter' }).first();
  await button.scrollIntoViewIfNeeded();
  expect(need(await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const holder = page.locator('.shrink').first();
  const downloadPromise = page.waitForEvent('download');
  await holder
    .locator('input[type=file]')
    .setInputFiles({ name: 'Camp fire.jpg', mimeType: 'image/jpeg', buffer: bytes });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Camp-fire-letter.jpg');
  const out = await inspect(page, await readDownload(download));
  testInfo.annotations.push({
    type: 'sizes',
    description: `in ${bytes.length} bytes, out ${out.size} bytes, ${out.width}x${out.height}`,
  });
  console.log(`photo-shrink: in ${bytes.length} B, out ${out.size} B, ${out.width}x${out.height}`);
  expect(out.magic).toEqual([0xff, 0xd8, 0xff]);
  expect(out.width).toBeLessThanOrEqual(1104);
  expect(out.width).toBe(1104);
  expect(out.height).toBe(828);
  expect(out.size).toBeLessThanOrEqual(300 * 1024);
  await expect(holder.locator('.shrink-note')).toContainText('Saved Camp-fire-letter.jpg');
  await expect(holder.locator('.shrink-note')).toContainText('Location and camera details');
  await expect(holder.locator('img.shrink-thumb')).toBeVisible();
  const loaded = await holder
    .locator('img.shrink-thumb')
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(loaded).toBe(true);
  await expect(button).toBeEnabled();
  expect(seen.remote).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test('a photo that cannot get under 300 KB is kept at the lowest quality, and the note says so', async ({
  page,
}, testInfo) => {
  await letterWithPhoto(page);
  const bytes = await makeImage(page, 'noise', 1104, 828);
  const holder = page.locator('.shrink').first();
  const downloadPromise = page.waitForEvent('download');
  await holder
    .locator('input[type=file]')
    .setInputFiles({ name: 'static.jpg', mimeType: 'image/jpeg', buffer: bytes });
  const out = await inspect(page, await readDownload(await downloadPromise));
  console.log(`photo-shrink (pure noise): in ${bytes.length} B, out ${out.size} B`);
  testInfo.annotations.push({ type: 'noise-sizes', description: `${bytes.length} to ${out.size}` });
  expect(out.width).toBe(1104);
  expect(out.size).toBeGreaterThan(300 * 1024);
  await expect(holder.locator('.shrink-note')).toContainText('still bigger than 300 KB');
});

test('a transparent PNG gets a white background', async ({ page, context }) => {
  const seen = await guard(context);
  await letterWithPhoto(page);
  const bytes = await makeImage(page, 'transparent', 600, 400);
  const holder = page.locator('.shrink').first();
  const downloadPromise = page.waitForEvent('download');
  await holder
    .locator('input[type=file]')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: bytes });
  const out = await inspect(page, await readDownload(await downloadPromise));
  expect(out.width).toBe(600);
  expect(out.corner[0]).toBeGreaterThan(245);
  expect(out.corner[1]).toBeGreaterThan(245);
  expect(out.corner[2]).toBeGreaterThan(245);
  expect(seen.remote).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test('a file that is not a photo gets a plain message and the form still works', async ({
  page,
  context,
}) => {
  const seen = await guard(context);
  await letterWithPhoto(page);
  const holder = page.locator('.shrink').first();
  await holder.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a picture'),
  });
  await expect(holder.locator('.shrink-note')).toContainText("This file can't be read as a photo");
  await expect(holder.getByRole('button')).toBeEnabled();
  await expect(holder.locator('img.shrink-thumb')).toBeHidden();
  await page.getByLabel('Photo description (required)').first().fill('Scouts at camp');
  expect(seen.remote).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test('the converter has the button and it fits at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const html = readFileSync(
    fileURLToPath(new URL('../fixtures/weekly/4-in-the-news.input.html', import.meta.url)),
    'utf8',
  );
  await page.getByLabel('Paste the old HTML here').fill(html);
  const button = page.getByRole('button', { name: 'Shrink a photo', exact: true });
  await expect(button).toBeVisible();
  const box = need(await button.boundingBox());
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
});

test('a tiny PNG that declares 30000 by 30000 pixels is refused quickly, with no download', async ({
  page,
}) => {
  await letterWithPhoto(page);
  let downloads = 0;
  page.on('download', () => (downloads += 1));
  const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const png = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...be32(13),
    0x49,
    0x48,
    0x44,
    0x52,
    ...be32(30000),
    ...be32(30000),
    8,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
  const holder = page.locator('.shrink').first();
  const started = Date.now();
  await holder
    .locator('input[type=file]')
    .setInputFiles({ name: 'bomb.png', mimeType: 'image/png', buffer: png });
  await expect(holder.locator('.shrink-note')).toHaveText(
    'This photo is too large to shrink on this device.',
  );
  expect(Date.now() - started).toBeLessThan(3000);
  expect(downloads).toBe(0);
  await expect(holder.getByRole('button')).toBeEnabled();
});

test('a JPEG with EXIF and GPS comes out without them', async ({ page }) => {
  await letterWithPhoto(page);
  const plain = await makeImage(page, 'scene', 1600, 1200);
  const payload = Buffer.concat([
    Buffer.from('Exif\0\0', 'latin1'),
    Buffer.from('GPSLatitude 41.12345 N GPSLongitude 87.54321 W Make TestCam', 'latin1'),
  ]);
  const segment = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 0]), payload]);
  segment.writeUInt16BE(payload.length + 2, 2);
  const withExif = Buffer.concat([plain.subarray(0, 2), segment, plain.subarray(2)]);
  expect(withExif.includes('GPSLatitude')).toBe(true);
  const holder = page.locator('.shrink').first();
  const downloadPromise = page.waitForEvent('download');
  await holder
    .locator('input[type=file]')
    .setInputFiles({ name: 'gps.jpg', mimeType: 'image/jpeg', buffer: withExif });
  const out = await readDownload(await downloadPromise);
  expect(out.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  expect(out.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(false);
  expect(out.includes('GPS')).toBe(false);
  expect(out.includes('TestCam')).toBe(false);
});

test('while one photo is shrunk, the other buttons are disabled', async ({ page }) => {
  await letterWithPhoto(page);
  await panel(page)
    .getByLabel('Kind of block to add')
    .selectOption({ label: 'Photo: One picture with a caption' });
  await page
    .locator('section.letter-section')
    .filter({ has: page.getByRole('heading', { name: 'Feature story', exact: true }) })
    .getByRole('button', { name: 'Add block', exact: true })
    .click();
  const holders = page.locator('.shrink');
  await expect(holders).toHaveCount(2);
  const bytes = await makeImage(page, 'scene', 6000, 4500);
  await holders
    .nth(0)
    .locator('input[type=file]')
    .setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: bytes });
  await expect(holders.nth(1).getByRole('button')).toBeDisabled();
  await expect(holders.nth(1)).toContainText('Another photo is being shrunk.');
  await expect(holders.nth(0).locator('.shrink-note')).toContainText('Saved big-letter.jpg');
  await expect(holders.nth(1).getByRole('button')).toBeEnabled();
});

test('the built page keeps its strict policy and allows blob images', async ({ page }) => {
  await page.goto('/');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("img-src 'self' data: blob:");
});
