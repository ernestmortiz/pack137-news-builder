import { describe, expect, it } from 'vitest';
import {
  chooseEncoding,
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
