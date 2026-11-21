import { describe, expect, it } from 'vitest';
import { smallFixes } from '../../../src/core/helpers/small-fixes';

describe('small fixes helper', () => {
  it('offers "and" for "&"', () => {
    expect(smallFixes('Blue & Gold Banquet')).toEqual([
      { from: ' & ', to: ' and ', message: 'Change "&" to "and".' },
    ]);
    expect(smallFixes('AT&T')).toEqual([]);
  });

  it('offers "Ongoing" for "On going", keeping the case', () => {
    expect(smallFixes('On going')[0]).toMatchObject({ from: 'On going', to: 'Ongoing' });
    expect(smallFixes('it is on going')[0]).toMatchObject({ from: 'on going', to: 'ongoing' });
    expect(smallFixes('Move on, going home')).toEqual([]);
  });

  it('offers to remove doubled spaces', () => {
    expect(smallFixes('Pack  Meeting')[0]).toMatchObject({ from: '  ', to: ' ' });
  });

  it('offers nothing for clean text', () => {
    expect(smallFixes('Pack Meeting')).toEqual([]);
  });
});
