/**
 * Shouting helper (build spec, section 7.4). Finds all-caps runs and repeated "!!" and turns them
 * into sentence case. The result is offered as a note for the user to check: sentence case cannot
 * know which words are names.
 */
import { capitalize } from './text';

/** Short forms that stay in capitals. */
const KEEP = new Set(['RSVP', 'TBD', 'BSA', 'CPA', 'PTA', 'NJ', 'USA', 'ASAP']);

interface Token {
  text: string;
  index: number;
  core: string;
  caps: boolean;
}

function tokens(text: string): Token[] {
  return [...text.matchAll(/\S+/g)].map((m) => {
    const core = m[0].replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
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
    const core = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
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
