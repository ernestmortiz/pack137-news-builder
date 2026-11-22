/**
 * Sentence boundaries in pasted prose, for building Date list rows from paragraphs (spec 7.4).
 * A sentence ends at ".", "!" or "?" followed by a space and a capital letter, a digit or an
 * opening quote, unless the word before the full stop is a known abbreviation ("St.", "Asst.").
 * Deterministic and approximate: the volunteer can always edit the result.
 */

const ABBREVIATIONS = new Set(
  [
    'st',
    'asst',
    'mr',
    'mrs',
    'ms',
    'dr',
    'jr',
    'sr',
    'mt',
    'ave',
    'rd',
    'blvd',
    'no',
    'vs',
    'etc',
    'approx',
    'dept',
    'rev',
    'capt',
    'lt',
    'sgt',
    'col',
    'gen',
    'gov',
    'jan',
    'feb',
    'mar',
    'apr',
    'jun',
    'jul',
    'aug',
    'sep',
    'sept',
    'oct',
    'nov',
    'dec',
    'mon',
    'tue',
    'tues',
    'wed',
    'thu',
    'thur',
    'thurs',
    'fri',
    'sat',
    'sun',
  ].map((w) => w.toLowerCase()),
);

/** Positions just after each sentence end, in order. The text's length is always the last. */
function ends(text: string): number[] {
  const out: number[] = [];
  const re = /[.!?]+["')\]]*(?=\s+["'(\p{Lu}\p{N}])/gu;
  for (const m of text.matchAll(re)) {
    const before = /([\p{L}.]+)$/u.exec(text.slice(0, m.index))?.[1] ?? '';
    const word = before.replace(/\./g, '').toLowerCase();
    // "St. Michael", "Asst. Scoutmaster", "a.m. on" and single initials do not end a sentence.
    if (
      m[0].startsWith('.') &&
      (ABBREVIATIONS.has(word) || word.length === 1 || before.includes('.'))
    )
      continue;
    out.push(m.index + m[0].length);
  }
  out.push(text.length);
  return out;
}

/** The sentence that holds `index`: [start, end), with the end after its full stop. */
export function sentenceAround(text: string, index: number): { start: number; end: number } {
  let start = 0;
  for (const end of ends(text)) {
    if (index < end) {
      while (start < end && /\s/.test(text[start] ?? '')) start += 1;
      return { start, end };
    }
    start = end;
  }
  return { start, end: text.length };
}

/** Where the first sentence ends. The whole text when it is one sentence. */
export function firstSentenceEnd(text: string): number {
  return ends(text)[0] ?? text.length;
}
