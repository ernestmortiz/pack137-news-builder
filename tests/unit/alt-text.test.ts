import { describe, expect, it } from 'vitest';
import { altTextProblems } from '../../src/core/alt-text';

const codes = (alt: string, caption?: string): string[] =>
  altTextProblems(alt, caption).map((p) => p.code);

describe('altTextProblems', () => {
  it('accepts a good description', () => {
    expect(altTextProblems('Cub Scouts roasting marshmallows at camp')).toEqual([]);
    expect(altTextProblems('Cub Scouts at camp', 'Fall campout')).toEqual([]);
  });

  it('accepts a non-English description', () => {
    expect(altTextProblems('Los niños exploran el bosque con linternas')).toEqual([]);
    expect(altTextProblems('夕暮れのキャンプでマシュマロを焼く子どもたち')).toEqual([]);
  });

  it('flags missing', () => {
    expect(codes('')).toEqual(['missing']);
    expect(codes('  \n ')).toEqual(['missing']);
  });

  it('flags redundant prefixes in any case', () => {
    for (const alt of [
      'Image of scouts',
      'photo of scouts',
      'PICTURE OF scouts',
      'Graphic of a flag',
      'Photograph of the den',
      'A photo of scouts',
      'an image of scouts',
      '  Photo of scouts',
    ]) {
      expect(codes(alt)).toEqual(['redundant-prefix']);
    }
    expect(codes('Photographs hang on the wall')).toEqual([]);
    expect(codes('Imagery of fire')).toEqual([]);
  });

  it('flags file names and addresses', () => {
    for (const alt of [
      'camp.jpg',
      'Camp.JPEG',
      'a.png',
      'a.gif',
      'a.webp',
      'a.heic',
      'a.svg',
      'IMG_1234',
      'DSC01234',
      'PXL_20260101_123456',
      'https://example.org/a',
    ]) {
      expect(codes(alt)).toContain('file-name');
    }
    expect(codes('Scouts by the png river')).toEqual([]);
  });

  it('flags a repeated caption', () => {
    expect(codes('Fall campout!', ' fall campout ')).toEqual(['repeats-caption']);
    expect(codes('Fall campout.', 'Fall Campout')).toEqual(['repeats-caption']);
    expect(codes('Fall campout', undefined)).toEqual([]);
    expect(codes('Fall campout', '')).toEqual([]);
  });

  it('flags too long', () => {
    expect(codes('a'.repeat(125))).toEqual([]);
    expect(codes('a'.repeat(126))).toEqual(['too-long']);
  });

  it('writes plain one sentence messages with no em dashes', () => {
    const all = [
      ...altTextProblems(''),
      ...altTextProblems('Photo of x'),
      ...altTextProblems('a.jpg'),
      ...altTextProblems('x', 'x'),
      ...altTextProblems('a'.repeat(200)),
    ];
    expect(all.length).toBe(5);
    for (const p of all) {
      expect(p.message).not.toMatch(/\u2014|\u2013/);
      expect(p.message.length).toBeGreaterThan(10);
    }
  });
});
