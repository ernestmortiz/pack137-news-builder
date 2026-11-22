import { describe, expect, it } from 'vitest';
import { sentenceAround, firstSentenceEnd } from '../../../src/core/helpers/sentences';

const PARA =
  "For the Scouts that attend St. Michael's Church, they are also having a Scout Sunday on February 1st at the 9am mass. This is being coordinated by Troop 75's Asst. Scoutmaster Andy Koneski. All scouts attending are to meet at 8:45am.";

describe('sentences', () => {
  it('finds the sentence holding a position, past abbreviations such as St. and Asst.', () => {
    const at = PARA.indexOf('February');
    const s = sentenceAround(PARA, at);
    expect(PARA.slice(s.start, s.end)).toBe(
      "For the Scouts that attend St. Michael's Church, they are also having a Scout Sunday on February 1st at the 9am mass.",
    );
    const second = sentenceAround(PARA, PARA.indexOf('Koneski'));
    expect(PARA.slice(second.start, second.end)).toBe(
      "This is being coordinated by Troop 75's Asst. Scoutmaster Andy Koneski.",
    );
  });

  it('takes the whole text when there is one sentence', () => {
    const t = 'Scout Sunday on February 8th, 10am-11am.';
    expect(sentenceAround(t, 5)).toEqual({ start: 0, end: t.length });
  });

  it('gives the end of the first sentence', () => {
    expect(PARA.slice(0, firstSentenceEnd(PARA))).toMatch(/9am mass\.$/);
    expect(firstSentenceEnd('No full stop here')).toBe('No full stop here'.length);
  });

  it('does not split at a decimal or a time', () => {
    const t = 'Dues are $12.50 per scout. Meet at 8.45 sharp.';
    expect(t.slice(0, firstSentenceEnd(t))).toBe('Dues are $12.50 per scout.');
  });
});
