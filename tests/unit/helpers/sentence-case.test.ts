import { describe, expect, it } from 'vitest';
import { packConfig } from '../../../src/config/pack.config';
import { toSentenceCase } from '../../../src/core/helpers/sentence-case';

const KEEP = packConfig.properNouns;
const sc = (text: string) => toSentenceCase(text, KEEP);

describe('sentence case helper', () => {
  it('keeps the first word capitalized and lowers the rest', () => {
    expect(sc('Take Action Now')).toBe('Take action now');
    expect(sc('Coming Soon')).toBe('Coming soon');
    expect(sc('Save the Date')).toBe('Save the date');
    expect(sc('Legal and Finance Help')).toBe('Legal and finance help');
    expect(sc('Additional Help Needed')).toBe('Additional help needed');
    expect(sc('coming Soon')).toBe('Coming soon');
  });

  it('returns text that is already sentence case unchanged', () => {
    for (const text of [
      'Coming soon',
      'Ongoing',
      'References',
      'Read all about it!',
      "I'm interested",
      'Upload your submissions here',
      'Bring your Pinewood Derby car on Saturday',
      '',
      '   ',
      '2026',
    ])
      expect(sc(text)).toBe(text);
  });

  it('keeps short words in all capitals', () => {
    expect(sc('Please RSVP By Friday')).toBe('Please RSVP by Friday');
    expect(sc('Date TBD For BSA And CPA Night')).toBe('Date TBD for BSA and CPA night');
    expect(sc('RSVP Now')).toBe('RSVP now');
  });

  it('keeps "I" and its short forms', () => {
    expect(sc('Yes, I Can Help')).toBe('Yes, I can help');
    expect(sc("Tell Us If I'm Needed")).toBe("Tell us if I'm needed");
  });

  it('keeps the names in the list, in their listed casing', () => {
    expect(sc('Pinewood Derby Weigh-In')).toBe('Pinewood Derby weigh-in');
    expect(sc('Blue and Gold Banquet Tickets')).toBe('Blue and Gold banquet tickets');
    expect(sc('Join Pack 137 At The Pinewood Derby')).toBe('Join Pack 137 at the Pinewood Derby');
    expect(sc('Sign Up On Signupgenius')).toBe('Sign up on SignUpGenius');
    expect(sc('News From tapinto')).toBe('News from TAPinto');
    expect(sc('Toys For Tots Drive')).toBe('Toys for Tots drive');
    expect(sc('Webelos And Bears Hike')).toBe('Webelos and Bears hike');
  });

  it('matches the longest name first, and names next to punctuation', () => {
    expect(sc('Meet At First Presbyterian Church Of Cranford')).toBe(
      'Meet at First Presbyterian Church of Cranford',
    );
    expect(sc('Cub Scouts Welcome (Cub Scout Families)')).toBe(
      'Cub Scouts welcome (Cub Scout families)',
    );
    expect(sc('Scouts BSA Visit: Arrow Of Light, Lions')).toBe(
      'Scouts BSA visit: Arrow of Light, Lions',
    );
    expect(sc("Pack 137's Big Day")).toBe("Pack 137's big day");
  });

  it('keeps month and weekday names capitalized', () => {
    expect(sc('Popcorn Sales End In December')).toBe('Popcorn sales end in December');
    expect(sc('Hike On Saturday, February 27')).toBe('Hike on Saturday, February 27');
    expect(sc('Camp Out May 3')).toBe('Camp out May 3');
    expect(sc('Sat Dec 6 Den Meeting')).toBe('Sat Dec 6 Den meeting');
    expect(sc('Parents May Attend')).toBe('Parents may attend');
  });

  it('keeps "Den" as a name, also in "den leader" (owner decision)', () => {
    expect(sc('Webelos Den 10 & Den 11 Upcoming Events')).toBe(
      'Webelos Den 10 & Den 11 upcoming events',
    );
    expect(sc('WEBELOS DEN 10 UPCOMING EVENTS')).toBe('Webelos Den 10 upcoming events');
    // The list cannot tell a den's name from the everyday word, so "den leader" gets a capital too.
    expect(sc('A Note From Your Den Leader')).toBe('A note from your Den leader');
    expect(sc('Ask your den leader')).toBe('Ask your Den leader');
    expect(sc("The Den's Big Day")).toBe("The Den's big day");
    // Only the whole word: "Dens", "Garden" and "Denver" are not the name.
    expect(sc('All Dens Meet In The Garden')).toBe('All dens meet in the garden');
  });

  it('capitalizes the first word after a colon', () => {
    expect(sc('Save The Date: blue and gold Banquet')).toBe('Save the date: Blue and Gold banquet');
    expect(sc('Reminder: bring Water')).toBe('Reminder: Bring water');
  });

  it('treats each part of a hyphenated word by the same rule', () => {
    expect(sc('First-Time Racer Overview')).toBe('First-time racer overview');
    expect(sc('Pinewood Derby First-Time Racer Overview')).toBe(
      'Pinewood Derby first-time racer overview',
    );
    expect(sc('Sign-Up For RSVP-Only Events')).toBe('Sign-up for RSVP-only events');
  });

  it('lowers text that is all in capitals, keeping known short forms', () => {
    expect(sc('SAVE THE DATE')).toBe('Save the date');
    expect(sc('PLEASE RSVP FOR PINEWOOD DERBY')).toBe('Please RSVP for Pinewood Derby');
  });

  it('leaves words with capitals inside them, links and email addresses alone', () => {
    expect(sc('Pay With PayPal')).toBe('Pay with PayPal');
    expect(sc('Write To Leader@Example.org')).toBe('Write to Leader@Example.org');
    expect(sc('See https://Example.org/Page Now')).toBe('See https://Example.org/Page now');
  });

  it('keeps the spacing and punctuation as typed', () => {
    expect(sc('  Take  Action   Now!  ')).toBe('  Take  action   now!  ');
    expect(sc('"Coming Soon"')).toBe('"Coming soon"');
  });

  it('gives the same answer when run on its own result', () => {
    for (const text of ['Take Action Now', 'SAVE THE DATE', 'Sign-Up For RSVP-Only Events: go Now'])
      expect(sc(sc(text))).toBe(sc(text));
  });

  it('is quick on very long text', () => {
    const started = performance.now();
    sc('Take Action Now '.repeat(60_000));
    sc('A'.repeat(1_000_000));
    sc('-'.repeat(1_000_000) + 'A');
    sc(' '.repeat(1_000_000) + 'A B');
    sc('pack '.repeat(200_000));
    expect(performance.now() - started).toBeLessThan(process.env.CI ? 6000 : 2000);
  });
});
