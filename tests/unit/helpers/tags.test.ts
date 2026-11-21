import { describe, expect, it } from 'vitest';
import { addTag, takeTags } from '../../../src/core/helpers/tags';

function take(text: string) {
  const r = takeTags(text);
  return { rest: text.slice(r.start, r.end), tags: r.tags.map((t) => `${t.text}:${t.strength}`) };
}

describe('tags helper', () => {
  it.each([
    ['Parent Planning Meeting Virtual', 'Parent Planning Meeting', ['Virtual:quiet']],
    ['Racer Overview (In Person)', 'Racer Overview', ['In person:quiet']],
    ['Racer Overview (Virtual)', 'Racer Overview', ['Virtual:quiet']],
    ['Racer Overview In person', 'Racer Overview', ['In person:quiet']],
    ['Rock Climbing TBD', 'Rock Climbing', ['TBD:quiet']],
    ['Pack Meeting RSVP', 'Pack Meeting', ['Please RSVP:strong']],
    ['Pack Meeting Please RSVP!', 'Pack Meeting', ['Please RSVP:strong']],
    ['Pack Meeting - Virtual', 'Pack Meeting', ['Virtual:quiet']],
  ])('%s', (text, rest, tags) => {
    expect(take(text)).toEqual({ rest, tags });
  });

  it('takes several tags and keeps their order', () => {
    expect(take('Pack Meeting Virtual Please RSVP!')).toEqual({
      rest: 'Pack Meeting',
      tags: ['Virtual:quiet', 'Please RSVP:strong'],
    });
  });

  it('takes a strong tag from the start when punctuation follows', () => {
    expect(take('Please RSVP! LAST CHANCE FOR DONATIONS')).toEqual({
      rest: 'LAST CHANCE FOR DONATIONS',
      tags: ['Please RSVP:strong'],
    });
    expect(take('RESCHEDULED!! Please read.')).toEqual({
      rest: 'Please read.',
      tags: ['Rescheduled:strong'],
    });
  });

  it('leaves tag words inside a sentence alone', () => {
    expect(take('RSVP by Dec 1 to Jen')).toEqual({ rest: 'RSVP by Dec 1 to Jen', tags: [] });
    expect(take('Virtual meeting details below')).toEqual({
      rest: 'Virtual meeting details below',
      tags: [],
    });
    expect(take('Meet the new TBDs team')).toEqual({ rest: 'Meet the new TBDs team', tags: [] });
  });

  it('does not add the same tag twice', () => {
    const one = addTag([], { text: 'Virtual', strength: 'quiet' });
    expect(addTag(one, { text: 'Virtual', strength: 'quiet' })).toHaveLength(1);
  });
});
