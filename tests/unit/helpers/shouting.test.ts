import { describe, expect, it } from 'vitest';
import { isShouting, shoutStart, toSentenceCase } from '../../../src/core/helpers/shouting';

describe('shouting helper', () => {
  it('spots all-caps runs and repeated exclamation marks', () => {
    expect(isShouting('LAST CHANCE FOR DONATIONS TO TOYS FOR TOTS')).toBe(true);
    expect(isShouting('RESCHEDULED!! Please read')).toBe(true);
    expect(isShouting('Bring a snack!!')).toBe(true);
  });

  it('leaves short forms and normal text alone', () => {
    expect(isShouting('Please RSVP')).toBe(false);
    expect(isShouting('Rock Climbing TBD')).toBe(false);
    expect(isShouting('Ask a CPA in NJ')).toBe(false);
    expect(isShouting('Pack Meeting!')).toBe(false);
  });

  it('finds where the shouting starts', () => {
    expect(shoutStart('Webelos Meeting RESCHEDULED!! Please read')).toBe(16);
    expect(shoutStart('Pack Meeting LAST CHANCE')).toBe(13);
    expect(shoutStart('Pack Meeting')).toBe(-1);
  });

  it('turns shouting into sentence case', () => {
    expect(toSentenceCase('LAST CHANCE FOR DONATIONS TO TOYS FOR TOTS')).toBe(
      'Last chance for donations to toys for tots',
    );
    expect(toSentenceCase('BRING A SNACK!! see you there. PLEASE RSVP')).toBe(
      'Bring a snack! See you there. Please RSVP',
    );
    expect(toSentenceCase('Please read and see SignUpGenius.')).toBe(
      'Please read and see SignUpGenius.',
    );
  });
});
