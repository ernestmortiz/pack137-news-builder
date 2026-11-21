/**
 * Tags helper (build spec, section 7.4). Words such as Virtual, In person and TBD at the end of a
 * row become quiet tags; RSVP and Rescheduled become strong tags.
 */
import type { Tag } from '../forms';
import { isSeparatorCode, isSpaceCode } from './text';

/**
 * One tag word. `ends(text, lo, end)` gives every place at or after `lo` where the word, written
 * in any mix of capitals, can begin so that it stops exactly at `end`, leftmost first.
 */
interface TagDef {
  tag: Tag;
  /** The word as a regex source, used only at the start of a line. */
  pattern: string;
  ends: (text: string, lo: number, end: number) => number[];
}

/** Where `word` (lower case letters) begins when it stops at `end`, in any capitals, or -1. */
function wordBefore(text: string, lo: number, end: number, word: string): number {
  const begin = end - word.length;
  if (begin < lo) return -1;
  for (let i = 0; i < word.length; i++) {
    // Setting bit 5 turns A to Z into a to z and leaves a to z alone.
    if ((text.charCodeAt(begin + i) | 0x20) !== word.charCodeAt(i)) return -1;
  }
  return begin;
}

/** Steps back from `end` over whitespace, no further than `lo`. */
function beforeSpaces(text: string, lo: number, end: number): number {
  let at = end;
  while (at > lo && isSpaceCode(text.charCodeAt(at - 1))) at--;
  return at;
}

const word =
  (w: string) =>
  (text: string, lo: number, end: number): number[] => {
    const begin = wordBefore(text, lo, end, w);
    return begin < 0 ? [] : [begin];
  };

/** "in person" or "in-person". */
function inPerson(text: string, lo: number, end: number): number[] {
  const person = wordBefore(text, lo, end, 'person');
  if (person <= lo) return [];
  const gap = text.charCodeAt(person - 1);
  if (gap !== 0x2d && gap !== 0x20) return [];
  const begin = wordBefore(text, lo, person - 1, 'in');
  return begin < 0 ? [] : [begin];
}

/** "rsvp" or "please rsvp". With "please" comes first, as it begins further left. */
function rsvp(text: string, lo: number, end: number): number[] {
  const begin = wordBefore(text, lo, end, 'rsvp');
  if (begin < 0) return [];
  const gap = beforeSpaces(text, lo, begin);
  const please = gap < begin ? wordBefore(text, lo, gap, 'please') : -1;
  return please < 0 ? [begin] : [please, begin];
}

const DEFS: TagDef[] = [
  { pattern: 'virtual', ends: word('virtual'), tag: { text: 'Virtual', strength: 'quiet' } },
  { pattern: 'in[- ]person', ends: inPerson, tag: { text: 'In person', strength: 'quiet' } },
  { pattern: 'tbd', ends: word('tbd'), tag: { text: 'TBD', strength: 'quiet' } },
  { pattern: '(?:please\\s+)?rsvp', ends: rsvp, tag: { text: 'Please RSVP', strength: 'strong' } },
  {
    pattern: 'rescheduled',
    ends: word('rescheduled'),
    tag: { text: 'Rescheduled', strength: 'strong' },
  },
];

export const RESCHEDULED: Tag = { text: 'Rescheduled', strength: 'strong' };

/**
 * At the start only strong tags count, and only when punctuation or the end follows. The regex is
 * sticky: it reads the tag word (bare, or in brackets as group 1) at one position and never looks
 * further along. What follows the word is checked by hand in takeLeading.
 */
const LEADING = DEFS.filter((d) => d.tag.strength === 'strong').map((d) => ({
  tag: d.tag,
  re: new RegExp(`\\s*(?:(\\()\\s*${d.pattern}\\s*\\)|${d.pattern})`, 'iy'),
}));

const isBangOrDot = (code: number) => code === 0x21 || code === 0x2e;
/** One of ! . , : ; */
const isTagPunctuation = (code: number) =>
  code === 0x21 || code === 0x2e || code === 0x2c || code === 0x3a || code === 0x3b;

export interface TagTake {
  tags: Tag[];
  /** What is left is `text.slice(start, end)`. */
  start: number;
  end: number;
}

/** Adds a tag unless one with the same text is already there. Returns a new list. */
export function addTag(tags: Tag[], tag: Tag, atStart = false): Tag[] {
  if (tags.some((t) => t.text === tag.text)) return tags;
  return atStart ? [{ ...tag }, ...tags] : [...tags, { ...tag }];
}

/** A tag word that stops at the end of the text, and where it (or its opening bracket) begins. */
interface Trailing {
  tag: Tag;
  begin: number;
}

/**
 * The tag words that stop at `end`, read from right to left: whitespace, then "!" and ".", then
 * the word, bare or in brackets. Whether one of them counts depends on what stands before it,
 * which takeTags checks, as that changes when a tag is taken off the start.
 */
function trailingAt(text: string, lo: number, end: number): Trailing[] {
  let stop = beforeSpaces(text, lo, end);
  while (stop > lo && isBangOrDot(text.charCodeAt(stop - 1))) stop--;
  const bracketed = stop > lo && text.charCodeAt(stop - 1) === 0x29;
  const wordEnd = bracketed ? beforeSpaces(text, lo, stop - 1) : stop;

  const out: Trailing[] = [];
  for (const def of DEFS) {
    for (const begin of def.ends(text, lo, wordEnd)) {
      if (!bracketed) {
        out.push({ tag: def.tag, begin });
        continue;
      }
      const open = beforeSpaces(text, lo, begin) - 1;
      if (open >= lo && text.charCodeAt(open) === 0x28) out.push({ tag: def.tag, begin: open });
    }
  }
  return out;
}

/** Where the text continues after a strong tag at `start`, or -1 when it does not start with one. */
function takeLeading(text: string, start: number, end: number): { tag: Tag; next: number } | null {
  for (const { tag, re } of LEADING) {
    re.lastIndex = start;
    const m = re.exec(text);
    if (m === null) continue;
    let next = start + m[0].length;
    if (next > end) continue;
    const afterWord = next;
    while (next < end && isTagPunctuation(text.charCodeAt(next))) next++;
    // In brackets the tag stands by itself. A bare word needs punctuation or the end after it.
    if (m[1] !== undefined || next > afterWord) return { tag, next };
    while (next < end && isSpaceCode(text.charCodeAt(next))) next++;
    if (next === end) return { tag, next };
  }
  return null;
}

/**
 * Takes tag words off the end of a line, and strong tags off its start.
 *
 * The line is read once from each end, so the time grows with its length. An earlier version ran
 * unanchored regexes over the whole line once per tag, which took minutes on a row that ended in
 * thousands of tag words.
 */
export function takeTags(text: string): TagTake {
  let start = 0;
  let end = text.length;
  let leading: Tag[] = [];
  let trailing: Tag[] = [];
  // The tag words that stop at `end`. Worked out again only when `end` moves.
  let found: Trailing[] | undefined;

  for (;;) {
    found ??= trailingAt(text, start, end);
    const from = start;
    // A tag at the end counts when it begins the text or follows whitespace.
    const last = found.find(
      (t) => t.begin === from || (t.begin > from && isSpaceCode(text.charCodeAt(t.begin - 1))),
    );
    if (last !== undefined) {
      end = last.begin === start ? start : last.begin - 1;
      while (end > start && isSeparatorCode(text.charCodeAt(end - 1))) end--;
      trailing = addTag(trailing, last.tag, true);
      found = undefined;
      continue;
    }
    const first = takeLeading(text, start, end);
    if (first === null) break;
    start = first.next;
    while (start < end && isSeparatorCode(text.charCodeAt(start))) start++;
    leading = addTag(leading, first.tag);
  }
  let tags = leading;
  for (const tag of trailing) tags = addTag(tags, tag);
  return { tags, start, end };
}
