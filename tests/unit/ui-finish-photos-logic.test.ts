import { describe, expect, it } from 'vitest';
import {
  FINISH_STEPS,
  MAX_PASTE_BYTES,
  PASTE_TOO_BIG,
  pasteTooBig,
} from '../../src/ui/finish-photos-logic';

describe('pasteTooBig', () => {
  it('lets a normal letter through', () => {
    expect(pasteTooBig('')).toBe(false);
    expect(pasteTooBig('x'.repeat(100_000))).toBe(false);
    expect(pasteTooBig('x'.repeat(MAX_PASTE_BYTES))).toBe(false);
  });
  it('refuses more than 2 MB', () => {
    expect(pasteTooBig('x'.repeat(MAX_PASTE_BYTES + 1))).toBe(true);
  });
  it('counts bytes, not characters', () => {
    expect(pasteTooBig('é'.repeat(MAX_PASTE_BYTES / 2 + 1))).toBe(true);
    expect(pasteTooBig('é'.repeat(MAX_PASTE_BYTES / 2))).toBe(false);
  });
});

describe('copy', () => {
  it('has five steps and no em dashes', () => {
    expect(FINISH_STEPS).toHaveLength(5);
    expect(FINISH_STEPS.join(PASTE_TOO_BIG)).not.toContain(String.fromCharCode(0x2014));
  });
});
