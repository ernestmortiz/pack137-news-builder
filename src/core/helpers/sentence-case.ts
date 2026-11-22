/**
 * Sentence case helper (build spec, section 6: "Sentence case for headings and buttons").
 * "Take Action Now" becomes "Take action now". The result is offered as a suggestion and never
 * applied by the tool: sentence case cannot know every name.
 *
 * What stays as it is:
 * - the names in `keep` (from pack.config.ts), written the way the list writes them;
 * - a word of 2 to 5 letters in all capitals, such as RSVP or TBD;
 * - "I" and its short forms, such as "I'm";
 * - month and weekday names;
 * - a word with a capital inside it, such as "PayPal", and links and email addresses.
 * The first word, and the first word after a colon, start with a capital. Each part of a
 * hyphenated word follows the same rules, so "First-Time" becomes "First-time".
 *
 * Every step reads the text once from left to right, so long text stays quick.
 */
import { KEEP as KNOWN_SHORT_FORMS } from './shouting';

const FULL_NAMES = new Set([
  'january',
  'february',
  'april',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
/** Also everyday words ("you may", "march in"), so they count as months only beside a date. */
const UNSURE_MONTHS = new Set(['may', 'march']);
const SHORT_MONTHS = new Set([
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
]);
const SHORT_DAYS = new Set([
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
]);
/** Words that lead into a month, as in "by March" or "next May". */
const BEFORE_MONTH = new Set([
  'in',
  'on',
  'by',
  'of',
  'until',
  'till',
  'through',
  'since',
  'before',
  'after',
  'from',
  'to',
  'during',
  'this',
  'next',
  'last',
  'early',
  'late',
  'mid',
]);

const isMonthWord = (lower: string) =>
  FULL_NAMES.has(lower) || UNSURE_MONTHS.has(lower) || SHORT_MONTHS.has(lower);

/** True for a letter or a digit. Characters outside the basic plane count as punctuation. */
function isWordChar(text: string, at: number): boolean {
  const code = text.charCodeAt(at);
  if (code < 0x80)
    return (
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    );
  return /[\p{L}\p{N}]/u.test(text.charAt(at));
}

const isDigit = (code: number) => code >= 0x30 && code <= 0x39;
const hasLower = (text: string) => text !== text.toUpperCase();
const hasUpper = (text: string) => text !== text.toLowerCase();

/** How many letters that have a capital form the text holds, counted up to `limit`. */
function countLetters(text: string, limit: number): number {
  let count = 0;
  for (let i = 0; i < text.length && count <= limit; i++) {
    const ch = text.charAt(i);
    if (ch.toLowerCase() !== ch.toUpperCase()) count++;
  }
  return count;
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "pack 137's" gives "pack 137": a name may carry a possessive ending. */
function possessive(word: string): string {
  const tail = word.slice(-2).toLowerCase();
  return tail === "'s" || tail === '’s' ? word.slice(-2) : '';
}

/* ---------- the keep list ---------- */

interface Phrase {
  /** The words as listed. */
  words: string[];
  lower: string[];
  length: number;
}

interface KeepIndex {
  /** Phrases by their first word in lower case, the longest first. */
  byFirst: Map<string, Phrase[]>;
}

const indexes = new WeakMap<readonly string[], KeepIndex>();

function indexOf(keep: readonly string[]): KeepIndex {
  const known = indexes.get(keep);
  if (known !== undefined) return known;
  const byFirst = new Map<string, Phrase[]>();
  for (const entry of keep) {
    const words = entry.split(/\s+/).filter((w) => w !== '');
    const first = words[0];
    if (first === undefined) continue;
    const phrase = { words, lower: words.map((w) => w.toLowerCase()), length: entry.length };
    const list = byFirst.get(first.toLowerCase());
    if (list === undefined) byFirst.set(first.toLowerCase(), [phrase]);
    else list.push(phrase);
  }
  // More words first, then the longer text.
  for (const list of byFirst.values())
    list.sort((a, b) => b.words.length - a.words.length || b.length - a.length);
  const index = { byFirst };
  indexes.set(keep, index);
  return index;
}

/* ---------- words ---------- */

/** One run of characters between spaces: punctuation, the word itself, punctuation. */
interface Word {
  lead: string;
  core: string;
  trail: string;
  /** The gap of whitespace before it, as typed. */
  gap: string;
}

function wordsOf(text: string): { words: Word[]; tail: string } {
  const words: Word[] = [];
  let pos = 0;
  for (const m of text.matchAll(/\S+/g)) {
    const token = m[0];
    let start = 0;
    let end = token.length;
    while (start < end && !isWordChar(token, start)) start++;
    while (end > start && !isWordChar(token, end - 1)) end--;
    words.push({
      gap: text.slice(pos, m.index),
      lead: token.slice(0, start),
      core: token.slice(start, end),
      trail: token.slice(end),
    });
    pos = m.index + token.length;
  }
  return { words, tail: text.slice(pos) };
}

/** How the first letter of a word is treated. */
type Start = 'capital' | 'as-typed' | 'none';

interface Around {
  /** The whole text is in capitals, so a short word in capitals is not a sign of a short form. */
  allCaps: boolean;
  /** The word before, in lower case, or ''. */
  before: string;
  /** The word after, in lower case, or ''. */
  after: string;
}

function isDateName(lower: string, around: Around): boolean {
  if (FULL_NAMES.has(lower)) return true;
  const beforeNumber = isDigit(around.after.charCodeAt(0));
  if (UNSURE_MONTHS.has(lower)) return beforeNumber || BEFORE_MONTH.has(around.before);
  if (SHORT_MONTHS.has(lower)) return beforeNumber;
  if (SHORT_DAYS.has(lower)) return beforeNumber || isMonthWord(around.after);
  return false;
}

/** One word, or one part of a hyphenated word, in sentence case. */
function casePart(part: string, start: Start, around: Around, keep: KeepIndex): string {
  if (part === '' || (!hasLower(part) && !hasUpper(part))) return part;

  const own = possessive(part);
  const bare = own === '' ? part : part.slice(0, -own.length);
  const lower = bare.toLowerCase();

  const name = keep.byFirst.get(lower)?.find((p) => p.words.length === 1);
  if (name !== undefined) return (name.words[0] as string) + own.toLowerCase();

  if (part === 'I') return part;
  if (/^I['’]/.test(part)) return 'I' + part.slice(1).toLowerCase();
  if (isDateName(lower, around)) return capitalizeFirst(lower) + own.toLowerCase();

  if (!hasLower(part)) {
    const letters = countLetters(part, 5);
    const shortForm = letters >= 2 && letters <= 5;
    if (shortForm && (!around.allCaps || KNOWN_SHORT_FORMS.has(part))) return part;
  } else if (hasUpper(part.slice(1))) {
    // A capital inside the word, as in "PayPal": a name the list does not know.
    return part;
  }

  const lowered = part.toLowerCase();
  if (start === 'capital') return capitalizeFirst(lowered);
  if (start === 'as-typed') return part.charAt(0) + lowered.slice(1);
  return lowered;
}

/** A link or an email address is left alone. */
function isAddress(core: string): boolean {
  return core.includes('@') || core.includes('://') || /^www\./i.test(core);
}

function caseWord(core: string, start: Start, around: Around, keep: KeepIndex): string {
  if (isAddress(core)) return core;
  if (!core.includes('-') && !core.includes('/')) return casePart(core, start, around, keep);
  let first = true;
  return core
    .split(/([-/])/)
    .map((part, i) => {
      if (i % 2 === 1 || part === '') return part;
      const out = casePart(part, first ? start : 'none', around, keep);
      first = false;
      return out;
    })
    .join('');
}

/** How many words from `at` on are a name from the list, and that name. */
function phraseAt(words: Word[], at: number, keep: KeepIndex): Phrase | undefined {
  const head = words[at] as Word;
  const headLower = head.core.toLowerCase();
  const list =
    keep.byFirst.get(headLower) ??
    keep.byFirst.get(headLower.slice(0, headLower.length - possessive(headLower).length));
  if (list === undefined) return undefined;
  return list.find((p) => {
    const count = p.words.length;
    if (count === 1 || at + count > words.length) return false;
    for (let i = 0; i < count; i++) {
      const w = words[at + i] as Word;
      const last = i === count - 1;
      // Nothing but a space may stand between the words of a name.
      if (i > 0 && w.lead !== '') return false;
      if (!last && w.trail !== '') return false;
      const lower = w.core.toLowerCase();
      const bare = last ? lower.slice(0, lower.length - possessive(lower).length) : lower;
      if (bare !== p.lower[i]) return false;
    }
    return true;
  });
}

/** What a word's closing punctuation means for the word after it. */
function startAfter(word: Word): Start {
  const end = word.trail.replace(/["'’”)\]]+$/, '');
  const last = end.charAt(end.length - 1);
  if (last === ':') return 'capital';
  if (last === '.' || last === '!' || last === '?') return 'as-typed';
  return 'none';
}

/**
 * The text in sentence case. `keep` lists the names that keep their capitals, matched in any
 * capitals and written back as listed; a name of several words wins over a shorter one.
 * Returns the text unchanged when it is already sentence case.
 */
export function toSentenceCase(text: string, keep: readonly string[]): string {
  const index = indexOf(keep);
  const { words, tail } = wordsOf(text);
  const lettered = words.filter((w) => hasLower(w.core) || hasUpper(w.core)).length;
  const allCaps = lettered >= 2 && !hasLower(text);

  let out = '';
  let start: Start = 'capital';
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as Word;
    if (word.core === '') {
      // Punctuation by itself, such as a dash. A colon still starts a new part.
      out += word.gap + word.lead + word.trail;
      if (word.trail.endsWith(':') || word.lead.endsWith(':')) start = 'capital';
      continue;
    }

    const phrase = phraseAt(words, i, index);
    if (phrase !== undefined) {
      const lastAt = i + phrase.words.length - 1;
      for (let j = i; j <= lastAt; j++) {
        const w = words[j] as Word;
        const own = j === lastAt ? possessive(w.core).toLowerCase() : '';
        out += w.gap + w.lead + (phrase.words[j - i] as string) + own + w.trail;
      }
      start = startAfter(words[lastAt] as Word);
      i = lastAt;
      continue;
    }

    const around: Around = {
      allCaps,
      before: words[i - 1]?.core.toLowerCase() ?? '',
      after: words[i + 1]?.core.toLowerCase() ?? '',
    };
    out += word.gap + word.lead + caseWord(word.core, start, around, index) + word.trail;
    start = startAfter(word);
  }
  out += tail;
  return out === text ? text : out;
}
