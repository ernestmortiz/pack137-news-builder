import { describe, expect, it } from 'vitest';
import { isManageLink, unlinkedServices } from '../../../src/core/helpers/warnings';

describe('warnings helper', () => {
  it('spots a TroopTrack manage link', () => {
    expect(isManageLink('https://pack137.trooptrack.com/manage/troops/23117?tab=leadership')).toBe(
      true,
    );
    expect(isManageLink('https://pack137.trooptrack.com/plan/events/1836430')).toBe(false);
    expect(isManageLink('https://example.org/manage/x')).toBe(false);
  });

  it('spots a service named with no link to it', () => {
    expect(unlinkedServices('Please read and see SignUpGenius.', [])).toEqual(['SignUpGenius']);
    expect(unlinkedServices('see Sign Up Genius', ['https://pack137.trooptrack.com/x'])).toEqual([
      'SignUpGenius',
    ]);
    expect(unlinkedServices('see SignUpGenius', ['https://www.signupgenius.com/go/abc'])).toEqual(
      [],
    );
    expect(unlinkedServices('Pack Meeting', [])).toEqual([]);
  });
});
