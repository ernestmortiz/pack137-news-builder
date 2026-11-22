/**
 * Shouting helper (build spec, section 7.4). Finds all-caps runs and repeated "!!" and turns them
 * into sentence case. The result is offered as a note for the user to check: sentence case cannot
 * know which words are names.
 */
import { capitalize } from './text';

/** Short forms that stay in capitals. */
export const KEEP = new Set(['RSVP', 'TBD', 'BSA', 'CPA', 'PTA', 'NJ', 'USA', 'ASAP']);

interface Token {
  text: string;
  index: number;
  core: string;
  caps: boolean;
}

function isLetterCode(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

/**
 * The word without the characters that are not A to Z at its two ends. A loop, not a regex: an
 * end-anchored class tried from every position is slow on one very long word.
 */
function coreOf(word: string): string {
  let start = 0;
  let end = word.length;
  while (start < end && !isLetterCode(word.charCodeAt(start))) start++;
  while (end > start && !isLetterCode(word.charCodeAt(end - 1))) end--;
  return word.slice(start, end);
}

function tokens(text: string): Token[] {
  return [...text.matchAll(/\S+/g)].map((m) => {
    const core = coreOf(m[0]);
    const letters = core.replace(/[^A-Za-z]/g, '');
    return {
      text: m[0],
      index: m.index,
      core,
      caps: letters.length >= 2 && letters === letters.toUpperCase(),
    };
  });
}

/**
 * Where the shouting starts, or -1. Shouting is "!!" or two or more all-caps words in a row, one
 * of them four letters or longer (so "RSVP" or "TBD" alone is not shouting).
 */
export function shoutStart(text: string): number {
  const list = tokens(text);
  for (let i = 0; i < list.length; i++) {
    const t = list[i] as Token;
    if (/!{2,}/.test(t.text)) {
      let first = i;
      while (first > 0 && (list[first - 1] as Token).caps) first--;
      return (list[first] as Token).index;
    }
    if (!t.caps) continue;
    let j = i;
    let long = false;
    while (j < list.length && (list[j] as Token).caps) {
      if ((list[j] as Token).core.length >= 4 && !KEEP.has((list[j] as Token).core)) long = true;
      j++;
    }
    if (j - i >= 2 && long) return t.index;
    i = j - 1;
  }
  return -1;
}

export function isShouting(text: string): boolean {
  return shoutStart(text) !== -1;
}

/** "LAST CHANCE FOR DONATIONS!!" becomes "Last chance for donations!". Other text is unchanged. */
export function toSentenceCase(text: string): string {
  if (!isShouting(text)) return text;
  const lowered = text.replace(/\S+/g, (word) => {
    const core = coreOf(word);
    const letters = core.replace(/[^A-Za-z]/g, '');
    if (core === 'A') return word.toLowerCase();
    if (letters.length < 2 || letters !== letters.toUpperCase() || KEEP.has(core)) return word;
    return word.toLowerCase();
  });
  return lowered
    .replace(/!{2,}/g, '!')
    .split(/(?<=[.!?])\s+/)
    .map(capitalize)
    .join(' ');
}
