/**
 * The DOM side of the rich text box: writing runs into the box, reading them back, and mapping the
 * caret to plain text offsets. Nothing here uses innerHTML. The box is written with createElement
 * and textContent only. It is read with a strict walk: only text, `br`, `strong`/`b`, `em`/`i`,
 * `s`/`strike`/`del` and `a` mean anything. Any other element (a `div` or `span` the browser adds,
 * or something pasted in) gives its text and nothing else. A block element ends a line.
 */
import type { RichText } from '../core/forms';
import type { Inline, Mark, TextRun } from '../core/model';
import { parse } from '../core/pipeline';
import { normalizeRich } from '../core/rich-text';
import { safeUrl } from '../templates/components';

const NBSP = new RegExp(String.raw`\u00a0`, 'g');
const ODD = new RegExp(String.raw`[\u0000-\u001f\u007f\u00a0]`, 'g');
const MARK_TAG: Record<Mark, 'strong' | 'em' | 's'> = { strong: 'strong', em: 'em', strike: 's' };
const MARK_OF_TAG: Record<string, Mark> = {
  STRONG: 'strong',
  B: 'strong',
  EM: 'em',
  I: 'em',
  S: 'strike',
  STRIKE: 'strike',
  DEL: 'strike',
};
/** Elements whose content is code or data, not words. They give nothing. */
const SILENT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'IFRAME']);
const BLOCKS = new Set([
  'DIV',
  'P',
  'LI',
  'UL',
  'OL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'TABLE',
  'TR',
  'SECTION',
  'ARTICLE',
]);

/* ---------- runs to DOM ---------- */

/** Replaces the content of `box` with `runs`. A trailing break gets one extra `br` so it shows. */
export function writeRuns(box: HTMLElement, runs: RichText): void {
  const doc = box.ownerDocument;
  const nodes: Node[] = [];
  const list = normalizeRich(runs);
  for (const run of list) {
    if (run.kind === 'break') {
      nodes.push(doc.createElement('br'));
      continue;
    }
    let node: Node = doc.createTextNode(run.text);
    for (const mark of ['strong', 'em', 'strike'] as const) {
      if (!run.marks.includes(mark)) continue;
      const wrap = doc.createElement(MARK_TAG[mark]);
      wrap.append(node);
      node = wrap;
    }
    // Only an address the email would also accept goes into the page; an unsafe one (from an old
    // draft, say) is shown as plain words, as the email shows it.
    const href = run.href === undefined ? null : safeUrl(run.href);
    if (href !== null) {
      const link = doc.createElement('a');
      link.setAttribute('href', href);
      link.setAttribute('title', href);
      link.append(node);
      node = link;
    }
    nodes.push(node);
  }
  if (list[list.length - 1]?.kind === 'break') nodes.push(doc.createElement('br'));
  box.replaceChildren(...nodes);
}

/* ---------- DOM to runs ---------- */

interface Walk {
  out: Inline[];
  /** Something has been written, so a new block starts a new line. */
  started: boolean;
  /** A block just ended, so the next words start a new line. */
  afterBlock: boolean;
  lastLeafWasBreak: boolean;
}

function pushText(w: Walk, text: string, marks: Mark[], href: string | undefined): void {
  if (text === '') return;
  if (w.afterBlock) {
    w.out.push({ kind: 'break' });
    w.afterBlock = false;
  }
  w.started = true;
  w.lastLeafWasBreak = false;
  const run: TextRun = { kind: 'text', text, marks };
  if (href !== undefined) run.href = href;
  w.out.push(run);
}

function pushBreak(w: Walk): void {
  if (w.afterBlock) {
    w.out.push({ kind: 'break' });
    w.afterBlock = false;
  }
  w.started = true;
  w.lastLeafWasBreak = true;
  w.out.push({ kind: 'break' });
}

function walk(node: Node, w: Walk, marks: Mark[], href: string | undefined): void {
  if (node.nodeType === 3) {
    const text = (node.nodeValue ?? '').replace(NBSP, ' ').replace(/\r\n?/g, '\n');
    const parts = text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) pushBreak(w);
      pushText(w, part, marks, href);
    });
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = (node as Element).tagName.toUpperCase();
  if (SILENT.has(tag)) return;
  if (tag === 'BR') {
    pushBreak(w);
    return;
  }
  let nextMarks = marks;
  let nextHref = href;
  const mark = MARK_OF_TAG[tag];
  if (mark !== undefined && !marks.includes(mark)) nextMarks = [...marks, mark];
  if (tag === 'A') {
    const raw = (node as Element).getAttribute('href');
    const safe = raw === null ? null : safeUrl(raw);
    // A link inside a link keeps the outer address; an unsafe address is dropped, the words stay.
    nextHref = href ?? safe ?? undefined;
  }
  const block = BLOCKS.has(tag);
  if (block) {
    if (w.started) w.afterBlock = true;
    w.started = true;
  }
  w.lastLeafWasBreak = false;
  for (let c = node.firstChild; c; c = c.nextSibling) walk(c, w, nextMarks, nextHref);
  if (block) {
    // A `br` last in a block only holds the line open. It is not a break of its own.
    if (w.lastLeafWasBreak) {
      w.out.pop();
      w.lastLeafWasBreak = false;
    }
    w.afterBlock = true;
  }
}

/**
 * The runs in `root`. For the whole box (`partial` false) a `br` at the very end is the browser's
 * placeholder and is not counted. `partial` is for a copy of part of the box, for offsets.
 */
export function readRuns(root: Node, partial = false): RichText {
  const w: Walk = { out: [], started: false, afterBlock: false, lastLeafWasBreak: false };
  for (let c = root.firstChild; c; c = c.nextSibling) walk(c, w, [], undefined);
  if (!partial && w.lastLeafWasBreak) w.out.pop();
  return normalizeRich(w.out);
}

/* ---------- caret and selection ---------- */

function plainLen(runs: RichText): number {
  let n = 0;
  for (const run of runs) n += run.kind === 'break' ? 1 : run.text.length;
  return n;
}

/** Plain text offset of a point inside `box`. */
function offsetOf(box: HTMLElement, node: Node, at: number): number {
  const range = box.ownerDocument.createRange();
  range.selectNodeContents(box);
  range.setEnd(node, at);
  const holder = box.ownerDocument.createElement('div');
  holder.append(range.cloneContents());
  return plainLen(readRuns(holder, true));
}

/** The selection as plain text offsets, or null when it is not inside the box. */
export function getOffsets(box: HTMLElement): [number, number] | null {
  const sel = box.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!box.contains(range.startContainer) || !box.contains(range.endContainer)) return null;
  const a = offsetOf(box, range.startContainer, range.startOffset);
  const b = offsetOf(box, range.endContainer, range.endOffset);
  return [Math.min(a, b), Math.max(a, b)];
}

/** The DOM point for a plain text offset in a box written by `writeRuns`. */
function pointAt(box: HTMLElement, offset: number): [Node, number] {
  let left = Math.max(0, offset);
  let found: [Node, number] | null = null;
  const visit = (parent: Node): void => {
    for (let c = parent.firstChild; c && found === null; c = c.nextSibling) {
      if (c.nodeType === 3) {
        const len = (c.nodeValue ?? '').length;
        if (left <= len) found = [c, left];
        else left -= len;
      } else if (c.nodeName === 'BR') {
        if (left === 0) found = [parent, Array.prototype.indexOf.call(parent.childNodes, c)];
        else left -= 1;
      } else {
        visit(c);
      }
    }
  };
  visit(box);
  return found ?? [box, box.childNodes.length];
}

/** Selects plain text offsets [start, end] in the box. */
export function setOffsets(box: HTMLElement, start: number, end: number): void {
  const doc = box.ownerDocument;
  const sel = doc.getSelection();
  if (!sel) return;
  const range = doc.createRange();
  const [n1, o1] = pointAt(box, start);
  const [n2, o2] = pointAt(box, end);
  range.setStart(n1, o1);
  range.setEnd(n2, o2);
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ---------- paste ---------- */

/** Plain text as runs: every newline is a break. Other control characters become spaces. */
export function runsFromText(text: string): RichText {
  const out: Inline[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, i) => {
    if (i > 0) out.push({ kind: 'break' });
    const clean = line.replace(ODD, ' ');
    if (clean !== '') out.push({ kind: 'text', text: clean, marks: [] });
  });
  return normalizeRich(out);
}

/**
 * Pasted HTML as runs, through the same clean-up the big paste box uses. Only the text, bold,
 * italic, struck words and safe links of each block survive; blocks are joined with breaks.
 */
export function runsFromHtml(html: string): RichText {
  const { model } = parse(html);
  const lines: Inline[][] = [];
  const addList = (items: { runs: Inline[]; children: { items: unknown[] }[] }[]): void => {
    for (const item of items) {
      lines.push(item.runs);
      for (const child of item.children) {
        addList(child.items as Parameters<typeof addList>[0]);
      }
    }
  };
  for (const block of model.blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') lines.push(block.runs);
    else if (block.type === 'list') addList(block.items);
  }
  const out: Inline[] = [];
  for (const line of lines) {
    const runs = normalizeRich(line);
    if (runs.length === 0) continue;
    if (out.length > 0) out.push({ kind: 'break' });
    out.push(...runs);
  }
  return normalizeRich(out);
}
