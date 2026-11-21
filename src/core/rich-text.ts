/**
 * Rich text as a tiny markup a volunteer can type (Phase 3 UI). Pure functions, no DOM.
 *
 *   **bold**   _italic_   ~~struck~~   [link text](https://example.org)
 *
 * A newline is a line break. A backslash makes the next markup character plain text:
 * `\*`, `\_`, `\~`, `\[`, `\]`, `\\`. Marks switch on and off where they appear, so they can
 * combine (`**_both_**`) and sit inside a link (`[**bold link**](https://example.org)`).
 * `textToRich(richToText(runs))` equals `normalizeRich(runs)` for every RichText the renderer takes.
 */
import type { RichText } from './forms';
import type { Inline, Mark, TextRun } from './model';

const MARK_ORDER: Mark[] = ['strong', 'em', 'strike'];
const MARK_TOKEN: Record<Mark, string> = { strong: '**', em: '_', strike: '~~' };
const TEXT_SPECIALS = /[\\*_~[\]]/g;

function sameFormat(a: TextRun, b: TextRun): boolean {
  return a.href === b.href && a.marks.join() === b.marks.join();
}

/** Drops empty text runs and merges neighbours with the same marks and link. */
export function normalizeRich(runs: RichText): RichText {
  const out: Inline[] = [];
  for (const run of runs) {
    if (run.kind === 'break') {
      out.push({ kind: 'break' });
      continue;
    }
    if (run.text === '') continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.kind === 'text' && sameFormat(prev, run)) {
      out[out.length - 1] = { ...prev, text: prev.text + run.text };
    } else {
      out.push({ ...run, marks: [...run.marks].sort() });
    }
  }
  return out;
}

/* ---------- runs to text ---------- */

function escapeText(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(TEXT_SPECIALS, (ch) => '\\' + ch);
}

function escapeUrl(url: string): string {
  return url.replace(/[\\)]/g, (ch) => '\\' + ch);
}

export function richToText(runs: RichText): string {
  const list = normalizeRich(runs);
  let out = '';
  let open = new Set<Mark>();

  /** Closes and opens marks so exactly `want` is open. */
  const setMarks = (want: Mark[]): void => {
    for (const m of MARK_ORDER) if (open.has(m) && !want.includes(m)) out += MARK_TOKEN[m];
    for (const m of MARK_ORDER) if (!open.has(m) && want.includes(m)) out += MARK_TOKEN[m];
    open = new Set(want);
  };

  for (let i = 0; i < list.length; i++) {
    const run = list[i];
    if (run === undefined) continue;
    if (run.kind === 'break') {
      setMarks([]);
      out += '\n';
      continue;
    }
    if (run.href === undefined) {
      setMarks(run.marks);
      out += escapeText(run.text);
      continue;
    }
    // A link: marks are closed outside it and opened inside it, so the brackets stay balanced.
    setMarks([]);
    out += '[';
    let j = i;
    for (; j < list.length; j++) {
      const next = list[j];
      if (next === undefined || next.kind !== 'text' || next.href !== run.href) break;
      setMarks(next.marks);
      out += escapeText(next.text);
    }
    setMarks([]);
    out += `](${escapeUrl(run.href)})`;
    i = j - 1;
  }
  setMarks([]);
  return out;
}

/* ---------- text to runs ---------- */

/** Index of the unescaped `]` that closes a link text starting at `from`, or -1. */
function findClose(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '\\') i++;
    else if (ch === ']') return i;
    else if (ch === '[') return -1;
  }
  return -1;
}

/**
 * Reads a URL that starts at `from` (just after the "(") up to the unescaped ")". When there is
 * none, `stop` is where the search ended: at a line break or at the end of the text.
 */
function readUrl(text: string, from: number): { url: string; end: number } | { stop: number } {
  let url = '';
  for (let i = from; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '\\' && i + 1 < text.length) {
      url += text.charAt(i + 1);
      i++;
    } else if (ch === ')') return { url, end: i + 1 };
    else if (ch === '\n') return { stop: i };
    else url += ch;
  }
  return { stop: text.length };
}

export function textToRich(text: string): RichText {
  const source = text.replace(/\r\n?/g, '\n');
  const out: Inline[] = [];
  const marks = new Set<Mark>();

  const push = (value: string, href: string | undefined): void => {
    if (value === '') return;
    const run: TextRun = { kind: 'text', text: value, marks: [...marks].sort() };
    if (href !== undefined) run.href = href;
    out.push(run);
  };

  /** Reads `src` with the current marks. `href` is set while inside a link's text. */
  const scan = (src: string, href: string | undefined): void => {
    let buf = '';
    const flush = (): void => {
      push(buf, href);
      buf = '';
    };
    // A search for a link's ")" that failed found none up to `noUrlUntil`. A later "(" before
    // that point has none either, so it is not searched again. Without this, text made of
    // unclosed links is read to its end once for each of them.
    let noUrlUntil = -1;
    for (let i = 0; i < src.length; i++) {
      const ch = src.charAt(i);
      if (ch === '\\' && /[\\*_~[\]()]/.test(src.charAt(i + 1)) && i + 1 < src.length) {
        buf += src.charAt(i + 1);
        i++;
      } else if (ch === '\n') {
        flush();
        out.push({ kind: 'break' });
      } else if (src.startsWith('**', i)) {
        flush();
        toggle('strong');
        i++;
      } else if (src.startsWith('~~', i)) {
        flush();
        toggle('strike');
        i++;
      } else if (ch === '_') {
        flush();
        toggle('em');
      } else if (ch === '[' && href === undefined) {
        const close = findClose(src, i + 1);
        let url: { url: string; end: number } | null = null;
        if (close >= 0 && src.charAt(close + 1) === '(' && close + 2 > noUrlUntil) {
          const read = readUrl(src, close + 2);
          if ('stop' in read) noUrlUntil = read.stop;
          else url = read;
        }
        if (close >= 0 && url !== null) {
          flush();
          scan(src.slice(i + 1, close), url.url);
          i = url.end - 1;
        } else {
          buf += ch;
        }
      } else {
        buf += ch;
      }
    }
    flush();
  };

  const toggle = (mark: Mark): void => {
    if (marks.has(mark)) marks.delete(mark);
    else marks.add(mark);
  };

  scan(source, undefined);
  return normalizeRich(out);
}
