/**
 * Extract stage (build spec, section 7.3). Reads the normalized body into the typed content model.
 * Input is the output of `normalize`: body children are p, h1 to h6, ul, ol, hr and img, and inline
 * content is text, strong, em, s, a, br and img. Anything else is read as a paragraph.
 */
import { matchLeadingDate } from './dates';
import type {
  Block,
  ContentModel,
  HeadingBlock,
  ImageBlock,
  Inline,
  ListBlock,
  ListItem,
  Mark,
  TextRun,
} from './model';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const MARK_OF: Record<string, Mark> = { strong: 'strong', em: 'em', s: 'strike' };
const HEADING_LEVEL: Record<string, HeadingBlock['level']> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

/** Longest line that may be promoted to a heading by the inferred-heading rule. */
const MAX_INFERRED_HEADING = 80;
/** Any fixed date works: only recognition matters here, not the year. */
const ANY_DAY = { year: 2001, month: 1, day: 1 };

type Piece = Inline | ImageBlock;

function tagOf(node: Node): string {
  return node.nodeType === ELEMENT_NODE ? (node as Element).tagName.toLowerCase() : '';
}

function positiveInt(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 ? n : undefined;
}

function imageFrom(el: Element, href: string | undefined): ImageBlock {
  const image: ImageBlock = {
    type: 'image',
    src: el.getAttribute('src') ?? '',
    alt: (el.getAttribute('alt') ?? '').trim(),
  };
  const width = positiveInt(el.getAttribute('width'));
  const height = positiveInt(el.getAttribute('height'));
  if (width !== undefined) image.width = width;
  if (height !== undefined) image.height = height;
  if (href !== undefined) image.href = href;
  return image;
}

function sameRun(a: TextRun, b: TextRun): boolean {
  return a.href === b.href && a.marks.join() === b.marks.join();
}

/** Appends a text run, merging it into the previous run when marks and link match. */
function pushText(out: Piece[], text: string, marks: Mark[], href: string | undefined): void {
  if (text === '') return;
  const last = out[out.length - 1];
  const run: TextRun = { kind: 'text', text, marks };
  if (href !== undefined) run.href = href;
  if (last && 'kind' in last && last.kind === 'text' && sameRun(last, run)) last.text += text;
  else out.push(run);
}

interface Frame {
  node: Node;
  marks: Mark[];
  href: string | undefined;
}

/**
 * Walks inline content in document order with an explicit stack. When `onList` is given, nested
 * ul and ol elements are not read; they are handed to `onList` instead. A p or heading inside the
 * container starts a new line.
 */
function readInline(container: Element, onList?: (list: Element) => void): Piece[] {
  const out: Piece[] = [];
  const stack: Frame[] = [];
  const pushChildren = (parent: Node, marks: Mark[], href: string | undefined) => {
    for (let c = parent.lastChild; c; c = c.previousSibling) stack.push({ node: c, marks, href });
  };
  pushChildren(container, [], undefined);

  while (stack.length > 0) {
    const { node, marks, href } = stack.pop() as Frame;
    if (node.nodeType === TEXT_NODE) {
      pushText(out, (node.nodeValue ?? '').replace(/\s+/g, ' '), marks, href);
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = tagOf(el);
    if (tag === 'br') {
      out.push({ kind: 'break' });
    } else if (tag === 'img') {
      out.push(imageFrom(el, href));
    } else if (onList && (tag === 'ul' || tag === 'ol')) {
      onList(el);
    } else if (tag === 'a') {
      pushChildren(el, marks, el.getAttribute('href') ?? undefined);
    } else {
      if ((tag === 'p' || tag in HEADING_LEVEL) && out.length > 0) out.push({ kind: 'break' });
      const mark = MARK_OF[tag];
      const next = mark && !marks.includes(mark) ? [...marks, mark].sort() : marks;
      pushChildren(el, next, href);
    }
  }
  return out;
}

/** Trims the outer edges of a run list and drops breaks left at either end. */
function tidyRuns(runs: Inline[]): Inline[] {
  const out = [...runs];
  while (out[0]?.kind === 'break') out.shift();
  while (out[out.length - 1]?.kind === 'break') out.pop();
  const first = out[0];
  if (first?.kind === 'text') first.text = first.text.trimStart();
  const last = out[out.length - 1];
  if (last?.kind === 'text') last.text = last.text.trimEnd();
  // Trim beside breaks too, then drop anything left empty.
  for (let i = 0; i < out.length; i++) {
    const run = out[i];
    if (run?.kind !== 'text') continue;
    if (out[i - 1]?.kind === 'break') run.text = run.text.trimStart();
    if (out[i + 1]?.kind === 'break') run.text = run.text.trimEnd();
  }
  return out.filter((r) => r.kind === 'break' || r.text !== '');
}

/** Splits inline pieces at images: text before, the image, text after. */
function splitAtImages(pieces: Piece[]): (Inline[] | ImageBlock)[] {
  const parts: (Inline[] | ImageBlock)[] = [];
  let current: Inline[] = [];
  for (const piece of pieces) {
    if ('type' in piece) {
      parts.push(current, piece);
      current = [];
    } else current.push(piece);
  }
  parts.push(current);
  return parts
    .map((p) => (Array.isArray(p) ? tidyRuns(p) : p))
    .filter((p) => !Array.isArray(p) || p.length > 0);
}

function readTextBlock(el: Element, make: (runs: Inline[]) => Block): Block[] {
  return splitAtImages(readInline(el)).map((part) => (Array.isArray(part) ? make(part) : part));
}

/** Reads one li: its own runs, plus the lists nested in it, without descending into them. */
function readItem(li: Element, images: ImageBlock[]): { runs: Inline[]; nested: Element[] } {
  const nested: Element[] = [];
  const runs: Inline[] = [];
  for (const piece of readInline(li, (list) => nested.push(list))) {
    if ('type' in piece) images.push(piece);
    else runs.push(piece);
  }
  return { runs: tidyRuns(mergeRuns(runs)), nested };
}

function liChildren(list: Element): Element[] {
  return Array.from(list.children).filter((c) => tagOf(c) === 'li');
}

/**
 * Reads a list. Nested lists become `children` of their item; lists nested deeper are lifted to
 * that first level, breadth first. Images inside items are returned separately so they are not
 * lost; the caller places them after the list. No recursion and no cloning, so depth is safe.
 */
function readList(listEl: Element, images: ImageBlock[]): ListBlock {
  const list: ListBlock = { type: 'list', ordered: tagOf(listEl) === 'ol', items: [] };

  for (const li of liChildren(listEl)) {
    const { runs, nested } = readItem(li, images);
    const item: ListItem = { runs, children: [] };

    const queue = nested;
    for (let q = 0; q < queue.length; q++) {
      const sub = queue[q] as Element;
      const flat: ListBlock = { type: 'list', ordered: tagOf(sub) === 'ol', items: [] };
      for (const subLi of liChildren(sub)) {
        const read = readItem(subLi, images);
        queue.push(...read.nested);
        if (read.runs.length > 0) flat.items.push({ runs: read.runs, children: [] });
      }
      if (flat.items.length > 0) item.children.push(flat);
    }

    if (item.runs.length > 0 || item.children.length > 0) list.items.push(item);
  }
  return list;
}

/** Re-merges runs that became neighbours after pieces were joined. */
function mergeRuns(runs: Inline[]): Inline[] {
  const out: Piece[] = [];
  for (const run of runs) {
    if (run.kind === 'break') out.push(run);
    else pushText(out, run.text, run.marks, run.href);
  }
  return out as Inline[];
}

function plainText(runs: Inline[]): string {
  return runs.map((r) => (r.kind === 'text' ? r.text : '\n')).join('');
}

function isWhollyDate(text: string): boolean {
  const m = matchLeadingDate(text, ANY_DAY, 9);
  return m !== null && m.raw === text.trim();
}

/** Can this paragraph be a heading at all? Links, breaks, long lines and dates rule it out. */
function headingCandidate(runs: Inline[]): string | null {
  if (runs.some((r) => r.kind === 'break' || r.href !== undefined)) return null;
  const text = plainText(runs).trim();
  if (text === '' || text.length > MAX_INFERRED_HEADING || isWhollyDate(text)) return null;
  return text;
}

function isEntirelyBold(runs: Inline[]): boolean {
  return runs.every(
    (r) => r.kind === 'text' && (r.text.trim() === '' || r.marks.includes('strong')),
  );
}

/** Section 7.3: a paragraph that is entirely bold, or unpunctuated and followed by a list. */
function inferHeadings(blocks: Block[]): Block[] {
  return blocks.map((block, i) => {
    if (block.type !== 'paragraph') return block;
    const text = headingCandidate(block.runs);
    if (text === null) return block;
    const bold = isEntirelyBold(block.runs);
    const beforeList = blocks[i + 1]?.type === 'list' && !/[.!?:;,]$/.test(text);
    if (!bold && !beforeList) return block;
    const runs = bold
      ? mergeRuns(
          block.runs.map((r) =>
            r.kind === 'text' ? { ...r, marks: r.marks.filter((m) => m !== 'strong') } : r,
          ),
        )
      : block.runs;
    return { type: 'heading', level: 3, source: 'inferred', runs };
  });
}

export function extract(root: Element): ContentModel {
  const blocks: Block[] = [];

  for (const child of Array.from(root.childNodes)) {
    const tag = tagOf(child);
    if (child.nodeType === TEXT_NODE) {
      if ((child.nodeValue ?? '').trim() !== '') {
        const holder = child.ownerDocument?.createElement('p');
        if (holder) {
          holder.appendChild(child.cloneNode());
          blocks.push(...readTextBlock(holder, (runs) => ({ type: 'paragraph', runs })));
        }
      }
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const el = child as Element;
    const level = HEADING_LEVEL[tag];

    if (level !== undefined) {
      blocks.push(
        ...readTextBlock(el, (runs) => ({ type: 'heading', level, source: 'tag', runs })),
      );
    } else if (tag === 'ul' || tag === 'ol') {
      const images: ImageBlock[] = [];
      const list = readList(el, images);
      if (list.items.length > 0) blocks.push(list);
      blocks.push(...images);
    } else if (tag === 'hr') {
      blocks.push({ type: 'rule' });
    } else if (tag === 'img') {
      blocks.push(imageFrom(el, undefined));
    } else {
      blocks.push(...readTextBlock(el, (runs) => ({ type: 'paragraph', runs })));
    }
  }

  return { blocks: inferHeadings(blocks) };
}
