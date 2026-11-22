import { describe, expect, it } from 'vitest';
import { fitScale } from '../../src/ui/preview-scale';

describe('fitScale', () => {
  it('never scales up', () => {
    expect(fitScale(600, 1000)).toBe(1);
    expect(fitScale(600, 600)).toBe(1);
  });
  it('shrinks to fit', () => {
    expect(fitScale(600, 300)).toBe(0.5);
    expect(fitScale(600, 500)).toBe(0.833);
    expect(600 * fitScale(600, 500)).toBeLessThanOrEqual(500);
  });
  it('leaves hidden or bad measurements at 1', () => {
    expect(fitScale(600, 0)).toBe(1);
    expect(fitScale(600, -5)).toBe(1);
    expect(fitScale(0, 300)).toBe(1);
    expect(fitScale(600, Number.NaN)).toBe(1);
  });
});
