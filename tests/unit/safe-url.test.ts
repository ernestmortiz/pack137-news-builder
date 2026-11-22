import { describe, expect, it } from 'vitest';
import { safeUrl, safeWebUrl } from '../../src/templates/components';

describe('safeUrl and safeWebUrl userinfo', () => {
  it.each(['https://www.cubpack137.com@evil.example/', 'https://user:pass@host/', 'http://a@b'])(
    'refuses %s',
    (url) => {
      expect(safeUrl(url)).toBeNull();
      expect(safeWebUrl(url)).toBeNull();
    },
  );

  it.each(['https://example.org/path@x', 'https://example.org/?a=b@c', 'https://example.org/#x@y'])(
    'still accepts %s',
    (url) => {
      expect(safeUrl(url)).toBe(url);
      expect(safeWebUrl(url)).toBe(url);
    },
  );

  it('accepts mailto with @', () => {
    expect(safeUrl('mailto:den@example.org')).toBe('mailto:den@example.org');
    expect(safeWebUrl('mailto:den@example.org')).toBeNull();
  });
});
