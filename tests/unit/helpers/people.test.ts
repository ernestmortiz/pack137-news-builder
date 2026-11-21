import { describe, expect, it } from 'vitest';
import { contactNote, readContact } from '../../../src/core/helpers/people';

describe('people helper', () => {
  it('reads the name after a dash', () => {
    expect(readContact(' - Jen and Tess')).toBe('Jen and Tess');
    expect(readContact(' - David Gannon')).toBe('David Gannon');
    expect(readContact(' – David Gannon ')).toBe('David Gannon');
    expect(readContact(` ${String.fromCharCode(0x2014)} David Gannon`)).toBe('David Gannon');
  });

  it('ignores text that is not a dash and a short name', () => {
    expect(readContact(' Jen and Tess')).toBeNull();
    expect(readContact(' - sign up by Dec 1')).toBeNull();
    expect(readContact(' - this one is a long sentence about the event today')).toBeNull();
    expect(readContact(' - ')).toBeNull();
  });

  it('writes the contact note', () => {
    expect(contactNote('Jen and Tess')).toBe('Contact: Jen and Tess');
  });
});
