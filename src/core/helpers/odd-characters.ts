/**
 * Odd characters helper (owner decision: "aim to keep whatever is copy unless it's an odd
 * character"). The fill stage keeps every pasted word. It removes only:
 *
 * - invisible characters, anywhere: zero-width space, zero-width joiner and non-joiner, word
 *   joiner, byte order mark, soft hyphen, and the text direction marks, embeddings, overrides
 *   and isolates;
 * - the decorative symbols in SYMBOLS below, when they lead a line, when they are all a line
 *   holds, or when they stand alone at the end of a line (a space before them);
 * - an emoji, when it leads a line the way a bullet does.
 *
 * Kept: a symbol between two words ("Camping, then a star, then Hiking") or touching the end of a
 * word, an emoji inside or after a sentence, ordinary punctuation, letters in any script and
 * digits. A joiner inside an emoji, or between two letters of a script that spells with it
 * (Persian, Hindi and others), is part of the copy and stays.
 *
 * Pure. Every scan moves forward or backward over a line once, so the time grows in step with the
 * length of the text (tests/unit/fill-perf.test.ts).
 */
import type { Inline, TextRun } from '../model';
import { isSpaceCode } from './text';

export interface OddOptions {
  /** Clean only the start of the first line. Used before a date is read from a line. */
  leadOnly?: boolean;
}

export interface CleanText {
  text: string;
  /** Each distinct thing removed, once, in the order met. See oddCharactersMessage. */
  removed: string[];
}

export interface CleanRich {
  /** The same array when nothing was removed. Otherwise new runs that share nothing with it. */
  runs: Inline[];
  removed: string[];
}

const INVISIBLE_SPACE = 'an invisible space';
const INVISIBLE_JOINER = 'an invisible joiner';
const DIRECTION_MARK = 'an invisible text direction mark';
const SOFT_HYPHEN = 'a soft hyphen';
const NAMES = new Set([INVISIBLE_SPACE, INVISIBLE_JOINER, DIRECTION_MARK, SOFT_HYPHEN]);

const ZWNJ = 0x200c;
const ZWJ = 0x200d;
const KEYCAP = 0x20e3;

/** What an invisible character is called in a message, or undefined for any other character. */
function invisibleName(code: number): string | undefined {
  if (code === 0xad) return SOFT_HYPHEN;
  if (code < 0x61c) return undefined;
  if (code === 0x200b || code === 0xfeff) return INVISIBLE_SPACE;
  if (code === ZWNJ || code === ZWJ || code === 0x2060) return INVISIBLE_JOINER;
  if (
    code === 0x61c ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  )
    return DIRECTION_MARK;
  return undefined;
}

/** The decorative symbols, by code point. All of them are single UTF-16 code units. */
const SYMBOLS = new Set([
  0x2022, // bullet
  0x25e6, // white bullet
  0x25aa, // small black square
  0x25ab, // small white square
  0x25cf, // black circle
  0x25cb, // white circle
  0x25a0, // black square
  0x25a1, // white square
  0x25ba, // black right-pointing pointer
  0x25b6, // black right-pointing triangle
  0x27a4, // black right-pointing arrowhead
  0x2794, // heavy right arrow
  0x2192, // right arrow
  0x00bb, // right double angle quotation mark
  0x203a, // right single angle quotation mark
  0x2605, // black star
  0x2606, // white star
  0x2713, // check mark
  0x2714, // heavy check mark
  0x2717, // ballot x
  0x2718, // heavy ballot x
  0x2756, // black diamond minus white x
  0x25c6, // black diamond
  0x25c7, // white diamond
]);

/** The marks that choose the text or the emoji look of the symbol before them. */
const isVariation = (code: number) => code === 0xfe0e || code === 0xfe0f;
/** Whitespace that is not one of the invisible characters (the byte order mark is both). */
const isGap = (code: number) => isSpaceCode(code) && invisibleName(code) === undefined;

const isFlagLetter = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;
const isTag = (cp: number) => cp >= 0xe0020 && cp <= 0xe007f;
const PICTURE = /\p{Extended_Pictographic}/u;

/**
 * True for a code point that starts an emoji. Signs below U+2190 that Unicode also counts as
 * pictures (copyright, registered, trade mark, double exclamation) are ordinary copy here, and
 * so are digits, "#" and "*", which only become emoji with a keycap mark.
 */
function isEmojiStart(cp: number): boolean {
  if (cp < 0x2190) return false;
  return isFlagLetter(cp) || isSkinTone(cp) || PICTURE.test(String.fromCodePoint(cp));
}

const sizeOf = (cp: number) => (cp > 0xffff ? 2 : 1);

/** The code point at `at`, read no further than `end`. */
function pointAt(text: string, at: number, end: number): number {
  const cp = text.codePointAt(at) ?? 0;
  return at + sizeOf(cp) > end ? text.charCodeAt(at) : cp;
}

/** The code point that ends just before `at`. */
function pointBefore(text: string, at: number): number {
  const low = text.charCodeAt(at - 1);
  if (low >= 0xdc00 && low <= 0xdfff && at >= 2) {
    const cp = text.codePointAt(at - 2) ?? low;
    if (cp > 0xffff) return cp;
  }
  return low;
}

/**
 * Where the symbol or (with `emoji`) the emoji that starts at `at` ends, or `at` when neither
 * starts there. An emoji takes its skin tone, its variation mark and the parts joined to it.
 */
function ornamentEnd(text: string, at: number, end: number, emoji: boolean): number {
  if (at >= end) return at;
  const code = text.charCodeAt(at);
  if (SYMBOLS.has(code)) {
    let e = at + 1;
    while (e < end && isVariation(text.charCodeAt(e))) e++;
    return e;
  }
  if (!emoji || code < 0x2190) return at;
  let cp = pointAt(text, at, end);
  if (!isEmojiStart(cp)) return at;
  let e = at + sizeOf(cp);
  // A flag is two flag letters.
  if (isFlagLetter(cp) && e < end && isFlagLetter(pointAt(text, e, end))) e += 2;
  while (e < end) {
    cp = pointAt(text, e, end);
    if (isVariation(cp) || cp === KEYCAP || isSkinTone(cp) || isTag(cp)) {
      e += sizeOf(cp);
      continue;
    }
    if (cp === ZWJ && e + 1 < end) {
      const next = pointAt(text, e + 1, end);
      if (isEmojiStart(next)) {
        e += 1 + sizeOf(next);
        continue;
      }
    }
    break;
  }
  return e;
}

const JOINED_LETTER = /[\p{L}\p{M}]/u;
/** True for a letter or a mark of a script from Hebrew on: the scripts that spell with joiners. */
const isJoinedLetter = (cp: number) => cp >= 0x590 && JOINED_LETTER.test(String.fromCodePoint(cp));

/** True when the joiner at `at` is part of an emoji or of a word in a script that spells with it. */
function joinerIsCopy(text: string, at: number, start: number, end: number): boolean {
  if (at <= start || at + 1 >= end) return false;
  const before = pointBefore(text, at);
  const after = pointAt(text, at + 1, end);
  if (isJoinedLetter(before) && isJoinedLetter(after)) return true;
  if (text.charCodeAt(at) !== ZWJ || !isEmojiStart(after)) return false;
  return isEmojiStart(before) || isVariation(before) || isSkinTone(before);
}

/** A stretch of text to remove: from `start` up to, not including, `end`. */
interface Cut {
  start: number;
  end: number;
}

/** The cuts for one line, in order. With `leadOnly`, only the cut at the start of the line. */
function cutsOfLine(text: string, from: number, to: number, leadOnly: boolean, out: Cut[]): void {
  // The start: ornaments, with the spaces and invisible characters around them.
  let lead = from;
  let found = false;
  for (;;) {
    let at = lead;
    while (at < to) {
      const code = text.charCodeAt(at);
      if (!isGap(code) && invisibleName(code) === undefined) break;
      at++;
    }
    const next = ornamentEnd(text, at, to, true);
    if (next === at) break;
    found = true;
    lead = next;
  }
  if (found) {
    while (lead < to) {
      const code = text.charCodeAt(lead);
      if (!isGap(code) && invisibleName(code) === undefined) break;
      lead++;
    }
    out.push({ start: from, end: lead });
  } else {
    lead = from;
  }
  if (leadOnly || lead >= to) return;

  // The end: symbols that stand alone after the last word, from the space before them.
  let tail = to;
  while (tail > lead) {
    const code = text.charCodeAt(tail - 1);
    if (
      !isGap(code) &&
      !isVariation(code) &&
      !SYMBOLS.has(code) &&
      invisibleName(code) === undefined
    )
      break;
    tail--;
  }
  let cutFrom = to;
  let gap = -1;
  for (let at = tail; at < to; at++) {
    const code = text.charCodeAt(at);
    if (gap < 0 && isGap(code)) gap = at;
    if (gap >= 0 && SYMBOLS.has(code)) {
      cutFrom = gap;
      break;
    }
  }

  // Between the two: invisible characters, each stretch of them as one cut.
  let at = lead;
  while (at < cutFrom) {
    if (invisibleName(text.charCodeAt(at)) === undefined || joinerIsCopy(text, at, lead, cutFrom)) {
      at++;
      continue;
    }
    const start = at;
    while (
      at < cutFrom &&
      invisibleName(text.charCodeAt(at)) !== undefined &&
      !joinerIsCopy(text, at, lead, cutFrom)
    )
      at++;
    out.push({ start, end: at });
  }
  if (cutFrom < to) out.push({ start: cutFrom, end: to });
}

/** Every cut for a text of one or more lines, in order. */
function cutsOf(text: string, leadOnly: boolean): Cut[] {
  const out: Cut[] = [];
  let from = 0;
  while (from <= text.length) {
    let to = text.indexOf('\n', from);
    if (to < 0) to = text.length;
    cutsOfLine(text, from, to, leadOnly, out);
    if (leadOnly) break;
    from = to + 1;
  }
  return out;
}

/** Adds what a cut stretch held to `into`: each symbol and emoji as it looks, invisible ones by name. */
function nameRemoved(text: string, start: number, end: number, into: Set<string>): void {
  let at = start;
  while (at < end) {
    const code = text.charCodeAt(at);
    const name = invisibleName(code);
    if (name !== undefined) {
      into.add(name);
      at++;
      continue;
    }
    if (SYMBOLS.has(code)) {
      into.add(text.charAt(at));
      at++;
      continue;
    }
    const next = ornamentEnd(text, at, end, true);
    if (next > at) into.add(text.slice(at, next));
    at = next > at ? next : at + 1;
  }
}

/**
 * Removes the odd characters from plain text. Lines are split at line feeds. The text comes back
 * exactly as given when it holds none.
 */
export function cleanOddText(text: string, options: OddOptions = {}): CleanText {
  const cuts = cutsOf(text, options.leadOnly === true);
  if (cuts.length === 0) return { text, removed: [] };
  const removed = new Set<string>();
  const parts: string[] = [];
  let pos = 0;
  for (const cut of cuts) {
    parts.push(text.slice(pos, cut.start));
    nameRemoved(text, cut.start, cut.end, removed);
    pos = cut.end;
  }
  parts.push(text.slice(pos));
  return { text: parts.join(''), removed: [...removed] };
}

const hasInk = (text: string) => text.trim() !== '';

/**
 * Removes the odd characters from rich text. A line break ends a line, and so does a line feed
 * inside a run. Marks and links are kept. A line that held only ornaments goes, with its line
 * break. A link is never emptied: a link whose only text is a symbol stays as it is.
 */
export function cleanOddRich(runs: Inline[], options: OddOptions = {}): CleanRich {
  const joined = runs.map((r) => (r.kind === 'text' ? r.text : '\n')).join('');
  const cuts = cutsOf(joined, options.leadOnly === true);
  if (cuts.length === 0) return { runs, removed: [] };

  const removed = new Set<string>();
  /** The lines of the result, each with whether the pasted line showed anything. */
  const lines: { runs: TextRun[]; hadInk: boolean }[] = [{ runs: [], hadInk: false }];
  let line = lines[0] as (typeof lines)[number];
  let pos = 0;
  let next = 0;
  for (const run of runs) {
    if (run.kind === 'break') {
      line = { runs: [], hadInk: false };
      lines.push(line);
      pos += 1;
      continue;
    }
    const end = pos + run.text.length;
    // The cuts that touch this run. A cut may run on into the next run, so it stays current.
    const first = next;
    const parts: string[] = [];
    let at = pos;
    while (next < cuts.length && (cuts[next] as Cut).start < end) {
      const cut = cuts[next] as Cut;
      if (cut.start > at) parts.push(joined.slice(at, cut.start));
      at = Math.max(at, Math.min(cut.end, end));
      if (cut.end > end) break;
      next++;
    }
    parts.push(joined.slice(at, end));
    const text = parts.join('');
    const emptiedLink = run.href !== undefined && hasInk(run.text) && !hasInk(text);
    const kept = emptiedLink ? run.text : text;
    if (!emptiedLink)
      for (let i = first; i < cuts.length && (cuts[i] as Cut).start < end; i++) {
        const cut = cuts[i] as Cut;
        nameRemoved(joined, Math.max(cut.start, pos), Math.min(cut.end, end), removed);
      }
    if (hasInk(run.text)) line.hadInk = true;
    if (kept !== '') {
      const copy: TextRun = { kind: 'text', text: kept, marks: [...run.marks] };
      if (run.href !== undefined) copy.href = run.href;
      line.runs.push(copy);
    }
    pos = end;
  }

  if (removed.size === 0) return { runs, removed: [] };
  const out: Inline[] = [];
  let open = false;
  for (const l of lines) {
    if (l.hadInk && !l.runs.some((r) => hasInk(r.text))) continue;
    if (open) out.push({ kind: 'break' });
    for (const r of l.runs) out.push(r);
    open = true;
  }
  return { runs: out, removed: [...removed] };
}

/**
 * "Removed odd characters: (the symbols), an invisible space." Symbols and emoji are shown as
 * they look, then the invisible ones are named in words. `removed` is the list from cleanOddText
 * or cleanOddRich, or several of them joined; each entry is shown once.
 */
export function oddCharactersMessage(removed: readonly string[]): string {
  const all = [...new Set(removed)];
  const seen = all.filter((r) => !NAMES.has(r)).join(' ');
  const named = all.filter((r) => NAMES.has(r)).join(', ');
  return `Removed odd characters: ${[seen, named].filter((p) => p !== '').join(', ')}.`;
}
