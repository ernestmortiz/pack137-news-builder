import { describe, expect, it } from 'vitest';
import { sourceNote, stripSiteName } from '../../../src/core/helpers/title-cleanup';

describe('title cleanup helper', () => {
  it('strips a trailing site name', () => {
    expect(stripSiteName('Scouts Collect 1,098 Bags of Food | Cranford, NJ News')).toEqual({
      text: 'Scouts Collect 1,098 Bags of Food',
      site: 'Cranford, NJ News',
    });
  });

  it('strips only the last part', () => {
    expect(stripSiteName('A | B | Site')?.text).toBe('A | B');
  });

  it('leaves other text alone', () => {
    expect(stripSiteName('Pack 137 Thank You Letter')).toBeNull();
    expect(stripSiteName('| Site')).toBeNull();
    expect(stripSiteName('Title | ')).toBeNull();
    expect(stripSiteName('A|B')).toBeNull();
  });

  it('names well-known sources', () => {
    expect(sourceNote('https://drive.google.com/file/d/1')).toBe('On Google Drive');
    expect(sourceNote('https://www.tapinto.net/towns/cranford')).toBe('TAPinto');
    expect(sourceNote('https://example.org/x')).toBe('');
    expect(sourceNote('mailto:a@b.test')).toBe('');
  });
});
