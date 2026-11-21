/**
 * Normalize stage (build spec, section 7.3).
 *
 * Takes the sanitized body and reduces it to a flat run of blocks: p, h1 to h6, ul, ol, hr and
 * stand-alone img. Wrappers and layout tables go, emphasis tags are unified, whitespace is tidied
 * and empty nodes are removed. Every walk uses an explicit stack, so deep nesting is safe.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const RENAME: Record<string, string> = {
  b: 'strong',
  i: 'em',
  strike: 's',
  del: 's',
  // Cells, quotes and centered blocks are block-level wrappers, so they follow the div rule.
  td: 'div',
  th: 'div',
  blockquote: 'div',
  center: 'div',
};

const UNWRAP = new Set([
  'u',
  'span',
  'font',
  'small',
  'sup',
  'sub',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
]);

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const BLOCKS = new Set(['p', 'div', 'ul', 'ol', 'li', 'hr', ...HEADINGS]);
const MARKS = new Set(['strong', 'em', 's']);
/** Blocks whose text is trimmed and whose leading and trailing `br` are removed. */
const TEXT_BLOCKS = new Set(['p', 'li', ...HEADINGS]);
/** Where a run of text ends for whitespace purposes. */
const TEXT_BOUNDARIES = new Set(['br', ...BLOCKS]);

const MARK_BITS: Record<string, number> = { strong: 1, em: 2, s: 4 };

interface Frame {
  node: Node;
  exit: boolean;
}

function tagOf(node: Node | null): string {
  return node && node.nodeType === ELEMENT_NODE ? (node as Element).tagName.toLowerCase() : '';
}

function isBlankText(node: Node): boolean {
  return node.nodeType === TEXT_NODE && !/\S/.test(node.nodeValue ?? '');
}

function removeNode(node: Node): void {
  node.parentNode?.removeChild(node);
}

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/** Replaces `el` with a new element of another tag that holds the same children. */
function rename(el: Element, tag: string): Element {
  const fresh = el.ownerDocument.createElement(tag);
  while (el.firstChild) fresh.appendChild(el.firstChild);
  el.parentNode?.replaceChild(fresh, el);
  return fresh;
}

function hasBlockChild(el: Element): boolean {
  for (let child = el.firstChild; child; child = child.nextSibling) {
    if (BLOCKS.has(tagOf(child))) return true;
  }
  return false;
}

function pushChildren(stack: Frame[], parent: Node): void {
  for (let child = parent.lastChild; child; child = child.previousSibling) {
    stack.push({ node: child, exit: false });
  }
}

/** Wraps each run of inline children in a `p`. Runs that are only whitespace are removed. */
function wrapInlineRuns(container: Element): void {
  let run: Node[] = [];
  const flush = (): void => {
    const first = run[0];
    if (!first) return;
    if (run.every(isBlankText)) {
      run.forEach(removeNode);
    } else {
      const p = container.ownerDocument.createElement('p');
      container.insertBefore(p, first);
      for (const node of run) p.appendChild(node);
    }
    run = [];
  };
  for (const child of Array.from(container.childNodes)) {
    if (BLOCKS.has(tagOf(child))) flush();
    else run.push(child);
  }
  flush();
}

/**
 * An inline element (strong, em, s, a) that wraps blocks is pushed down into them, so
 * `<b><div>One</div><div>Two</div></b>` keeps both paragraphs bold.
 */
function pushInlineIntoBlocks(inline: Element): void {
  const wrapNodes = (parent: Node, nodes: Node[]): void => {
    const first = nodes[0];
    if (!first || nodes.every(isBlankText)) return;
    const copy = inline.cloneNode(false);
    parent.insertBefore(copy, first);
    for (const node of nodes) copy.appendChild(node);
  };
  const containers: Element[] = [inline];
  for (let container = containers.pop(); container; container = containers.pop()) {
    let run: Node[] = [];
    for (const child of Array.from(container.childNodes)) {
      const tag = tagOf(child);
      if (!BLOCKS.has(tag)) {
        run.push(child);
        continue;
      }
      wrapNodes(container, run);
      run = [];
      if (tag === 'p' || HEADINGS.has(tag)) wrapNodes(child, Array.from(child.childNodes));
      else if (tag !== 'hr') containers.push(child as Element);
    }
    wrapNodes(container, run);
  }
  unwrap(inline);
}

/** Runs when every descendant of `el` has already been restructured. */
function leaveElement(el: Element): void {
  const tag = tagOf(el);
  if (tag === 'div' || tag === 'p') {
    if (hasBlockChild(el)) {
      wrapInlineRuns(el);
      unwrap(el);
    } else if (tag === 'div') {
      rename(el, 'p');
    }
    return;
  }
  if (MARKS.has(tag) || tag === 'a') {
    if (hasBlockChild(el)) pushInlineIntoBlocks(el);
    return;
  }
  if (HEADINGS.has(tag)) {
    // A heading holds one line of text. Paragraphs inside it are flattened.
    for (const child of Array.from(el.childNodes)) {
      if (tagOf(child) !== 'p') continue;
      el.insertBefore(el.ownerDocument.createTextNode(' '), child);
      unwrap(child as Element);
    }
    return;
  }
  if (tag === 'ul' || tag === 'ol') {
    for (const child of Array.from(el.childNodes)) if (isBlankText(child)) removeNode(child);
    return;
  }
  if (tag === 'li') {
    // `<li><p>text</p></li>` is one line of text, not mixed content.
    let only: Element | null = null;
    for (let child = el.firstChild; child; child = child.nextSibling) {
      const childTag = tagOf(child);
      if (childTag === 'ul' || childTag === 'ol' || isBlankText(child)) continue;
      if (childTag !== 'p' || only) return;
      only = child as Element;
    }
    if (only) unwrap(only);
  }
}

/** Pass 1: rename, unwrap and flatten until only blocks sit under the root. */
function restructure(root: Element): void {
  const stack: Frame[] = [];
  pushChildren(stack, root);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { node } = frame;
    if (frame.exit) {
      leaveElement(node as Element);
      continue;
    }
    if (node.nodeType === TEXT_NODE) continue;
    if (node.nodeType !== ELEMENT_NODE) {
      removeNode(node);
      continue;
    }
    let el = node as Element;
    const tag = tagOf(el);
    if (UNWRAP.has(tag)) {
      pushChildren(stack, el);
      unwrap(el);
      continue;
    }
    const target = RENAME[tag];
    if (target) el = rename(el, target);
    stack.push({ node: el, exit: true });
    pushChildren(stack, el);
  }

  // List items that lost their list (the list tag was not closed, or sat in a dropped wrapper).
  let list: Element | null = null;
  for (const child of Array.from(root.childNodes)) {
    if (tagOf(child) === 'li') {
      if (!list) {
        list = root.ownerDocument.createElement('ul');
        root.insertBefore(list, child);
      }
      list.appendChild(child);
    } else if (!isBlankText(child)) {
      list = null;
    }
  }
  wrapInlineRuns(root);
}

/**
 * Pass 2a: remove elements with no text, image or rule in them. Children are judged before their
 * parent, so one walk settles a whole chain of empty wrappers.
 */
function removeEmptyElements(root: Element): void {
  const filled = new Set<Node>();
  const stack: Frame[] = [];
  pushChildren(stack, root);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { node } = frame;
    if (node.nodeType !== ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = tagOf(el);
    if (tag === 'br') continue;
    if (tag === 'img' || tag === 'hr') {
      filled.add(el);
      continue;
    }
    if (!frame.exit) {
      stack.push({ node: el, exit: true });
      pushChildren(stack, el);
      continue;
    }
    let hasContent = false;
    let hasSpace = false;
    for (let child = el.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === TEXT_NODE) {
        if (isBlankText(child)) hasSpace = hasSpace || (child.nodeValue ?? '') !== '';
        else hasContent = true;
      } else if (filled.has(child)) {
        hasContent = true;
      }
      if (hasContent) break;
    }
    if (hasContent) {
      filled.add(el);
    } else if (hasSpace && !BLOCKS.has(tag)) {
      // `a<b> </b>b` must keep the space between the words.
      el.parentNode?.replaceChild(el.ownerDocument.createTextNode(' '), el);
    } else {
      removeNode(el);
    }
  }
}

/** Removes `br` and blank text from one edge of a block. Returns true when a `br` was removed. */
function trimBlockEdge(block: Element, fromStart: boolean): boolean {
  let removed = false;
  let container = block;
  for (;;) {
    const edge = fromStart ? container.firstChild : container.lastChild;
    if (!edge) {
      // An inline element emptied by the trim goes too, and the trim carries on above it.
      const parent = container.parentNode;
      if (container === block || !parent) break;
      parent.removeChild(container);
      container = parent as Element;
      continue;
    }
    const tag = tagOf(edge);
    if (tag === 'br') {
      removeNode(edge);
      removed = true;
    } else if (isBlankText(edge)) {
      removeNode(edge);
    } else if (MARKS.has(tag) || tag === 'a') {
      container = edge as Element;
    } else {
      break;
    }
  }
  return removed;
}

/** Pass 2b: a `br` at the very start or end of a block carries no meaning. */
function trimBreaks(root: Element): boolean {
  let removed = false;
  const stack: Node[] = Array.from(root.childNodes);
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (node.nodeType !== ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = tagOf(el);
    if (TEXT_BLOCKS.has(tag)) {
      if (trimBlockEdge(el, true)) removed = true;
      if (trimBlockEdge(el, false)) removed = true;
    }
    if (tag === 'ul' || tag === 'ol' || tag === 'li') {
      for (let child = el.firstChild; child; child = child.nextSibling) stack.push(child);
    }
  }
  return removed;
}

/** Pass 3a: `<strong><em><strong>x</strong></em></strong>` needs only the outer strong. */
function flattenNestedMarks(root: Element): void {
  const stack: { node: Node; active: number }[] = [];
  const push = (parent: Node, active: number): void => {
    for (let child = parent.lastChild; child; child = child.previousSibling) {
      stack.push({ node: child, active });
    }
  };
  push(root, 0);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    if (frame.node.nodeType !== ELEMENT_NODE) continue;
    const el = frame.node as Element;
    const tag = tagOf(el);
    const bit = MARK_BITS[tag] ?? 0;
    if (bit !== 0 && (frame.active & bit) !== 0) {
      push(el, frame.active);
      unwrap(el);
      continue;
    }
    // Emphasis does not carry from one block into another.
    push(el, BLOCKS.has(tag) ? 0 : frame.active | bit);
  }
}

function sameInline(a: Node, b: Node | null): b is Element {
  const tag = tagOf(a);
  if (!b || tag === '' || tagOf(b) !== tag) return false;
  if (MARKS.has(tag)) return true;
  return tag === 'a' && (a as Element).getAttribute('href') === (b as Element).getAttribute('href');
}

/** Pass 3b: join neighbours such as `<strong>a</strong><strong>b</strong>` and split text nodes. */
function mergeAdjacent(root: Element): void {
  const parents: Element[] = [root];
  for (let parent = parents.pop(); parent; parent = parents.pop()) {
    let node = parent.firstChild;
    while (node) {
      const next: ChildNode | null = node.nextSibling;
      if (node.nodeType === TEXT_NODE && next && next.nodeType === TEXT_NODE) {
        node.nodeValue = (node.nodeValue ?? '') + (next.nodeValue ?? '');
        removeNode(next);
        continue;
      }
      if (sameInline(node, next)) {
        while (next.firstChild) node.appendChild(next.firstChild);
        removeNode(next);
        continue;
      }
      // Emphasis either side of a space is one emphasised phrase.
      if (
        next &&
        MARKS.has(tagOf(node)) &&
        isBlankText(next) &&
        sameInline(node, next.nextSibling)
      ) {
        node.appendChild(next);
        continue;
      }
      if (node.nodeType === ELEMENT_NODE) parents.push(node as Element);
      node = next;
    }
  }
}

/**
 * Pass 4: non-breaking spaces become spaces, whitespace runs collapse to one space, and each block
 * (and each line either side of a `br`) loses its leading and trailing space.
 */
function tidyText(root: Element): void {
  // True at the start of a block or after a space: the next leading space is dropped.
  let afterSpace = true;
  let trailing: Node | null = null;
  const endRun = (): void => {
    if (trailing) {
      const text = (trailing.nodeValue ?? '').replace(/ $/, '');
      if (text === '') removeNode(trailing);
      else trailing.nodeValue = text;
    }
    trailing = null;
    afterSpace = true;
  };

  const stack: Frame[] = [];
  pushChildren(stack, root);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { node } = frame;
    if (node.nodeType === TEXT_NODE) {
      let text = (node.nodeValue ?? '').replace(/[ \t\n\r\f\u00a0]+/g, ' ');
      if (afterSpace && text.startsWith(' ')) text = text.slice(1);
      if (text === '') {
        removeNode(node);
        continue;
      }
      if (text !== node.nodeValue) node.nodeValue = text;
      afterSpace = text.endsWith(' ');
      trailing = afterSpace ? node : null;
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) continue;
    const tag = tagOf(node);
    if (TEXT_BOUNDARIES.has(tag)) {
      endRun();
    } else if (tag === 'img') {
      afterSpace = false;
      trailing = null;
    }
    if (!frame.exit && node.firstChild) {
      stack.push({ node, exit: true });
      pushChildren(stack, node);
    }
  }
  endRun();
}

/** Pass 5: a paragraph that holds nothing but one image is an image block. */
function liftLoneImages(root: Element): void {
  for (const child of Array.from(root.childNodes)) {
    if (tagOf(child) !== 'p') continue;
    const only = child.firstChild;
    if (only && only === child.lastChild && tagOf(only) === 'img') {
      root.replaceChild(only, child);
    }
  }
}

/** Mutates `root` in place and returns it. */
export function normalize(root: HTMLElement): HTMLElement {
  restructure(root);
  do removeEmptyElements(root);
  while (trimBreaks(root));
  flattenNestedMarks(root);
  mergeAdjacent(root);
  tidyText(root);
  liftLoneImages(root);
  return root;
}
