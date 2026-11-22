import { describe, expect, it } from 'vitest';
import {
  chooseEncoding,
  declaredSize,
  isTooLarge,
  looksHeic,
  unreadableMessage,
  formatBytes,
  isTooBigFile,
  isTooManyPixels,
  MSG,
  qualitySteps,
  resultMessage,
  shrinkControl,
  shrunkFileName,
  targetSize,
} from '../../src/ui/photo-shrink';

describe('targetSize', () => {
  it('shrinks to 1104 wide and keeps the shape', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 1104, height: 828 });
  });
  it('never enlarges', () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('caps height at 2000', () => {
    expect(targetSize(1000, 4000)).toEqual({ width: 500, height: 2000 });
  });
  it('never returns zero', () => {
    expect(targetSize(10000, 1).height).toBe(1);
  });
});

describe('limits', () => {
  it('refuses files over 50 MB and images over 60 megapixels', () => {
    expect(isTooBigFile(50 * 1024 * 1024)).toBe(false);
    expect(isTooBigFile(50 * 1024 * 1024 + 1)).toBe(true);
    expect(isTooManyPixels(10_000, 6_000)).toBe(false);
    expect(isTooManyPixels(10_000, 6_001)).toBe(true);
  });
});

describe('qualitySteps and chooseEncoding', () => {
  it('steps 0.82 down to 0.58', () => {
    expect(qualitySteps()).toEqual([0.82, 0.74, 0.66, 0.58]);
  });
  it('stops at the first small enough result', async () => {
    const tried: number[] = [];
    const out = await chooseEncoding(async (q) => {
      tried.push(q);
      return new Blob([new Uint8Array(q > 0.7 ? 400_000 : 100_000)]);
    });
    expect(tried).toEqual([0.82, 0.74, 0.66]);
    expect(out?.quality).toBe(0.66);
    expect(out?.withinLimit).toBe(true);
  });
  it('keeps the lowest quality result when nothing is small enough', async () => {
    const out = await chooseEncoding(async () => new Blob([new Uint8Array(400_000)]));
    expect(out?.quality).toBe(0.58);
    expect(out?.withinLimit).toBe(false);
  });
  it('gives up when the browser cannot encode', async () => {
    expect(await chooseEncoding(async () => null)).toBeNull();
  });
});

describe('shrunkFileName', () => {
  it('drops the extension and adds -letter.jpg', () => {
    expect(shrunkFileName('campfire.HEIC')).toBe('campfire-letter.jpg');
  });
  it('makes odd names safe', () => {
    expect(shrunkFileName('Our Café / trip (1).png')).toBe('Our-Cafe-trip-1-letter.jpg');
    expect(shrunkFileName('../../x.y.jpg')).toBe('x-y-letter.jpg');
  });
  it('limits length and falls back to photo', () => {
    const name = shrunkFileName(`${'a'.repeat(100)}.jpg`);
    expect(name).toBe(`${'a'.repeat(60)}-letter.jpg`);
    expect(shrunkFileName('....png')).toBe('photo-letter.jpg');
    expect(shrunkFileName('')).toBe('photo-letter.jpg');
  });
});

describe('messages', () => {
  it('formats sizes', () => {
    expect(formatBytes(5 * 1024 * 1024 * 0.96)).toBe('4.8 MB');
    expect(formatBytes(210 * 1024)).toBe('210 KB');
    expect(formatBytes(10)).toBe('1 KB');
  });
  it('writes the result line', () => {
    const text = resultMessage({
      fileName: 'campfire-letter.jpg',
      beforeBytes: Math.round(4.8 * 1024 * 1024),
      afterBytes: 210 * 1024,
      width: 1104,
      height: 828,
      withinLimit: true,
    });
    expect(text).toBe(
      'Saved campfire-letter.jpg: 4.8 MB to 210 KB, 1104 by 828 pixels. Location and camera details were removed. Now upload it to TroopTrack and paste its address above.',
    );
    expect(
      resultMessage({
        fileName: 'a-letter.jpg',
        beforeBytes: 1,
        afterBytes: 400 * 1024,
        width: 1,
        height: 1,
        withinLimit: false,
      }),
    ).toContain('still bigger than 300 KB');
  });
  it('words the next step for a photo spot', () => {
    const text = resultMessage({
      fileName: 'a-letter.jpg',
      beforeBytes: 2048,
      afterBytes: 1024,
      width: 10,
      height: 10,
      withinLimit: true,
      next: 'spot',
    });
    expect(text).toContain(
      'Location and camera details were removed. Insert it in TroopTrack where the photo spot is, then use Finish photos.',
    );
    expect(text).not.toContain('address');
  });
  it('has no em dashes', () => {
    expect(Object.values(MSG).join('')).not.toMatch(/\u2014/);
  });
});

describe('shrinkControl', () => {
  it('builds a button and a file input that takes photos', () => {
    const root = shrinkControl('Shrink a photo');
    const button = root.querySelector('button');
    const input = root.querySelector('input');
    expect(button?.textContent).toBe('Shrink a photo');
    expect(input?.type).toBe('file');
    expect(input?.accept).toContain('image/heic');
  });
});

const ascii = (t: string) => [...t].map((c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

describe('declaredSize', () => {
  it('reads a PNG', () => {
    const png = [
      0x89,
      ...ascii('PNG'),
      13,
      10,
      26,
      10,
      ...be32(13),
      ...ascii('IHDR'),
      ...be32(30000),
      ...be32(20000),
    ];
    expect(declaredSize(new Uint8Array(png))).toEqual({ width: 30000, height: 20000 });
  });
  it('reads a GIF', () => {
    const gif = [...ascii('GIF89a'), ...le16(640), ...le16(480), 0, 0, 0];
    expect(declaredSize(new Uint8Array(gif))).toEqual({ width: 640, height: 480 });
  });
  it('reads a JPEG, skipping other segments and the tables that look like frames', () => {
    const app = [0xff, 0xe1, 0, 8, 1, 2, 3, 4, 5, 6];
    const dht = [0xff, 0xc4, 0, 4, 9, 9];
    const sof = (m: number) => [
      0xff,
      m,
      0,
      11,
      8,
      ...[3000 >> 8, 3000 & 255],
      ...[4000 >> 8, 4000 & 255],
      3,
      1,
      2,
      3,
    ];
    for (const marker of [0xc0, 0xc2, 0xc9, 0xcf]) {
      const jpeg = [0xff, 0xd8, ...app, 0xff, 0xff, ...dht.slice(1), ...sof(marker)];
      expect(declaredSize(new Uint8Array(jpeg))).toEqual({ width: 4000, height: 3000 });
    }
  });
  it('reads WebP VP8, VP8L and VP8X', () => {
    const riff = [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')];
    const vp8 = [
      ...riff,
      ...ascii('VP8 '),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0x9d,
      0x01,
      0x2a,
      ...le16(1200),
      ...le16(900),
    ];
    expect(declaredSize(new Uint8Array(vp8))).toEqual({ width: 1200, height: 900 });
    const bits = (1000 - 1) | ((700 - 1) << 14);
    const vp8l = [
      ...riff,
      ...ascii('VP8L'),
      0,
      0,
      0,
      0,
      0x2f,
      bits & 255,
      (bits >> 8) & 255,
      (bits >> 16) & 255,
      (bits >>> 24) & 255,
    ];
    expect(declaredSize(new Uint8Array(vp8l))).toEqual({ width: 1000, height: 700 });
    const vp8x = [
      ...riff,
      ...ascii('VP8X'),
      10,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ...le24(5000 - 1),
      ...le24(4000 - 1),
    ];
    expect(declaredSize(new Uint8Array(vp8x))).toEqual({ width: 5000, height: 4000 });
  });
  it('returns null for truncated and garbage input', () => {
    expect(declaredSize(new Uint8Array([]))).toBeNull();
    expect(declaredSize(new Uint8Array([0x89, ...ascii('PNG'), 13, 10, 26, 10, 0, 0]))).toBeNull();
    expect(declaredSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8]))).toBeNull();
    expect(declaredSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(declaredSize(new Uint8Array([...ascii('GIF89a'), 1]))).toBeNull();
    expect(
      declaredSize(new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')])),
    ).toBeNull();
    expect(declaredSize(new Uint8Array(ascii('hello, this is not a picture at all')))).toBeNull();
    expect(declaredSize(new Uint8Array(200).fill(0xff))).toBeNull();
  });
  it('does not loop on a JPEG segment with a zero length', () => {
    expect(declaredSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 1, 2]))).toBeNull();
  });
});

describe('size and format decisions', () => {
  it('refuses huge declared sizes', () => {
    expect(isTooLarge(30000, 30000)).toBe(true);
    expect(isTooLarge(30001, 1)).toBe(true);
    expect(isTooLarge(4000, 3000)).toBe(false);
  });
  it('only mentions Safari for HEIC or HEIF', () => {
    expect(looksHeic('a.HEIC', '')).toBe(true);
    expect(looksHeic('a', 'image/heif')).toBe(true);
    expect(looksHeic('a.png', 'image/png')).toBe(false);
    expect(unreadableMessage('a.heic', '')).toContain('Safari');
    expect(unreadableMessage('notes.txt', 'text/plain')).not.toContain('Safari');
    expect(unreadableMessage('notes.txt', 'text/plain')).toBe(
      "This file can't be read as a photo. Save or export it as a JPEG and try again.",
    );
  });
});

describe('one shrink at a time', () => {
  it('shows the other controls as enabled when nothing is running', () => {
    const a = shrinkControl('One');
    const b = shrinkControl('Two');
    document.body.append(a, b);
    expect(a.querySelector('button')?.disabled).toBe(false);
    expect(b.querySelector<HTMLElement>('.shrink-lock')?.hidden).toBe(true);
    a.remove();
    b.remove();
  });
});
