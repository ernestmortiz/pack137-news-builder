/**
 * Normalize stage (build spec, section 7.3).
 *
 * Takes the sanitized body and reduces it to a flat run of blocks: p, h1 to h6, ul, ol, hr and
 * stand-alone img. Wrappers and layout tables go, emphasis tags are unified, whitespace is tidied
 * and empty nodes are removed.
 *
 * The work is done on a plain copy of the tree (`Item`), not on the DOM. The DOM is read once,
 * emptied, and written once. In some DOM implementations moving a node costs time in proportion
 * to everything under it, and several DOM calls recurse (reading text, moving or removing a
 * subtree), so on the DOM itself thousands of nested wrappers take seconds or overflow the stack.
 * On the copy every move is a few pointer writes, and every walk uses an explicit stack.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

type Attribute = [name: string, value: string];

/** One node of the working copy: an element, or a text node when `tag` is empty. */
interface Item {
  tag: string;
  /** The characters of a text node. Empty on elements. */
  text: string;
  attributes: readonly Attribute[];
  parent: Item | null;
  previous: Item | null;
  next: Item | null;
  first: Item | null;
  last: Item | null;
}

const NO_ATTRIBUTES: readonly Attribute[] = [];

function makeItem(tag: string, text: string, attributes: readonly Attribute[]): Item {
  return {
    tag,
    text,
    attributes,
    parent: null,
    previous: null,
    next: null,
    first: null,
    last: null,
  };
}

function makeElement(tag: string, attributes: readonly Attribute[] = NO_ATTRIBUTES): Item {
  return makeItem(tag, '', attributes);
}

function makeText(text: string): Item {
  return makeItem('', text, NO_ATTRIBUTES);
}

function isText(node: Item): boolean {
  return node.tag === '';
}

function attributeOf(node: Item, name: string): string | null {
  for (const [key, value] of node.attributes) if (key === name) return value;
  return null;
}

/** A snapshot of the children, safe to loop over while the tree changes. */
function childrenOf(parent: Item): Item[] {
  const result: Item[] = [];
  for (let child = parent.first; child; child = child.next) result.push(child);
  return result;
}

function removeNode(node: Item): void {
  const parent = node.parent;
  if (!parent) return;
  if (node.previous) node.previous.next = node.next;
  else parent.first = node.next;
  if (node.next) node.next.previous = node.previous;
  else parent.last = node.previous;
  node.parent = null;
  node.previous = null;
  node.next = null;
}

/** Puts `node` in `parent` before `reference`, or at the end when `reference` is null. */
function insertBefore(parent: Item, node: Item, reference: Item | null): void {
  if (node === reference) return;
  removeNode(node);
  const previous = reference ? reference.previous : parent.last;
  node.parent = parent;
  node.previous = previous;
  node.next = reference;
  if (previous) previous.next = node;
  else parent.first = node;
  if (reference) reference.previous = node;
  else parent.last = node;
}

function appendChild(parent: Item, node: Item): void {
  insertBefore(parent, node, null);
}

/** Puts the children of `el` where `el` was. */
function unwrap(el: Item): void {
  const parent = el.parent;
  if (!parent) return;
  const { first, last } = el;
  if (!first || !last) {
    removeNode(el);
    return;
  }
  for (let child: Item | null = first; child; child = child.next) child.parent = parent;
  first.previous = el.previous;
  last.next = el.next;
  if (el.previous) el.previous.next = first;
  else parent.first = first;
  if (el.next) el.next.previous = last;
  else parent.last = last;
  el.first = null;
  el.last = null;
  el.parent = null;
  el.previous = null;
  el.next = null;
}

/** Moves every child of `from` to the end of `to`. */
function moveChildren(from: Item, to: Item): void {
  const { first, last } = from;
  if (!first || !last) return;
  for (let child: Item | null = first; child; child = child.next) child.parent = to;
  first.previous = to.last;
  if (to.last) to.last.next = first;
  else to.first = first;
  to.last = last;
  from.first = null;
  from.last = null;
}

/** Gives `el` another tag. Its children stay; its attributes belonged to the old tag and go. */
function rename(el: Item, tag: string): Item {
  el.tag = tag;
  el.attributes = NO_ATTRIBUTES;
  return el;
}

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
  node: Item;
  exit: boolean;
}

function isBlankText(node: Item): boolean {
  return isText(node) && !/\S/.test(node.text);
}

function hasBlockChild(el: Item): boolean {
  for (let child = el.first; child; child = child.next) {
    if (BLOCKS.has(child.tag)) return true;
  }
  return false;
}

function pushChildren(stack: Frame[], parent: Item): void {
  for (let child = parent.last; child; child = child.previous) {
    stack.push({ node: child, exit: false });
  }
}

/** Wraps each run of inline children in a `p`. Runs that are only whitespace are removed. */
function wrapInlineRuns(container: Item): void {
  let run: Item[] = [];
  const flush = (): void => {
    const first = run[0];
    if (!first) return;
    if (run.every(isBlankText)) {
      run.forEach(removeNode);
    } else {
      const p = makeElement('p');
      insertBefore(container, p, first);
      for (const node of run) appendChild(p, node);
    }
    run = [];
  };
  for (const child of childrenOf(container)) {
    if (BLOCKS.has(child.tag)) flush();
    else run.push(child);
  }
  flush();
}

/**
 * An inline element (strong, em, s, a) that wraps blocks is pushed down into them, so
 * `<b><div>One</div><div>Two</div></b>` keeps both paragraphs bold.
 */
function pushInlineIntoBlocks(inline: Item): void {
  const wrapNodes = (parent: Item, nodes: Item[]): void => {
    const first = nodes[0];
    if (!first || nodes.every(isBlankText)) return;
    const copy = makeElement(inline.tag, inline.attributes);
    insertBefore(parent, copy, first);
    for (const node of nodes) appendChild(copy, node);
  };
  const containers: Item[] = [inline];
  for (let container = containers.pop(); container; container = containers.pop()) {
    let run: Item[] = [];
    for (const child of childrenOf(container)) {
      const tag = child.tag;
      if (!BLOCKS.has(tag)) {
        run.push(child);
        continue;
      }
      wrapNodes(container, run);
      run = [];
      if (tag === 'p' || HEADINGS.has(tag)) wrapNodes(child, childrenOf(child));
      else if (tag !== 'hr') containers.push(child);
    }
    wrapNodes(container, run);
  }
  unwrap(inline);
}

/** Runs when every descendant of `el` has already been restructured. */
function leaveElement(el: Item): void {
  const tag = el.tag;
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
    for (const child of childrenOf(el)) {
      if (child.tag !== 'p') continue;
      insertBefore(el, makeText(' '), child);
      unwrap(child);
    }
    return;
  }
  if (tag === 'ul' || tag === 'ol') {
    for (const child of childrenOf(el)) if (isBlankText(child)) removeNode(child);
    return;
  }
  if (tag === 'li') {
    // `<li><p>text</p></li>` is one line of text, not mixed content.
    let only: Item | null = null;
    for (let child = el.first; child; child = child.next) {
      const childTag = child.tag;
      if (childTag === 'ul' || childTag === 'ol' || isBlankText(child)) continue;
      if (childTag !== 'p' || only) return;
      only = child;
    }
    if (only) unwrap(only);
  }
}

/** Pass 1: rename, unwrap and flatten until only blocks sit under the root. */
function restructure(root: Item): void {
  const stack: Frame[] = [];
  pushChildren(stack, root);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { node } = frame;
    if (frame.exit) {
      leaveElement(node);
      continue;
    }
    if (isText(node)) continue;
    const tag = node.tag;
    if (UNWRAP.has(tag)) {
      // The children move up one level and are then visited in their new place.
      pushChildren(stack, node);
      unwrap(node);
      continue;
    }
    const target = RENAME[tag];
    if (target) rename(node, target);
    stack.push({ node, exit: true });
    pushChildren(stack, node);
  }

  // List items that lost their list (the list tag was not closed, or sat in a dropped wrapper).
  let list: Item | null = null;
  for (const child of childrenOf(root)) {
    if (child.tag === 'li') {
      if (!list) {
        list = makeElement('ul');
        insertBefore(root, list, child);
      }
      appendChild(list, child);
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
function removeEmptyElements(root: Item): void {
  const filled = new Set<Item>();
  const stack: Frame[] = [];
  pushChildren(stack, root);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const el = frame.node;
    if (isText(el)) continue;
    const tag = el.tag;
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
    for (let child = el.first; child; child = child.next) {
      if (isText(child)) {
        if (isBlankText(child)) hasSpace = hasSpace || child.text !== '';
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
      if (el.parent) insertBefore(el.parent, makeText(' '), el);
      removeNode(el);
    } else {
      removeNode(el);
    }
  }
}

/** Removes `br` and blank text from one edge of a block. Returns true when a `br` was removed. */
function trimBlockEdge(block: Item, fromStart: boolean): boolean {
  let removed = false;
  let container = block;
  for (;;) {
    const edge = fromStart ? container.first : container.last;
    if (!edge) {
      // An inline element emptied by the trim goes too, and the trim carries on above it.
      const parent = container.parent;
      if (container === block || !parent) break;
      removeNode(container);
      container = parent;
      continue;
    }
    const tag = edge.tag;
    if (tag === 'br') {
      removeNode(edge);
      removed = true;
    } else if (isBlankText(edge)) {
      removeNode(edge);
    } else if (MARKS.has(tag) || tag === 'a') {
      container = edge;
    } else {
      break;
    }
  }
  return removed;
}

/**
 * Pass 2b: a `br` at the very start or end of a block carries no meaning. Returns true when
 * something was removed, so the caller can check once more for elements left empty.
 *
 * Inner blocks are trimmed before the list item that holds them, and a block or list the trim
 * left with nothing in it is removed on the spot. A chain such as an item that ends in a break,
 * then a list whose only item is a break, therefore settles in this one walk, however deep.
 */
function trimBreaks(root: Item): boolean {
  let removed = false;
  const stack: Frame[] = [];
  pushChildren(stack, root);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const el = frame.node;
    if (isText(el)) continue;
    const tag = el.tag;
    const holdsBlocks = tag === 'ul' || tag === 'ol' || tag === 'li';
    if (holdsBlocks && !frame.exit) {
      stack.push({ node: el, exit: true });
      pushChildren(stack, el);
      continue;
    }
    const trimmed = TEXT_BLOCKS.has(tag);
    if (trimmed) {
      if (trimBlockEdge(el, true)) removed = true;
      if (trimBlockEdge(el, false)) removed = true;
    }
    if ((trimmed || holdsBlocks) && !el.first) {
      removeNode(el);
      removed = true;
    }
  }
  return removed;
}

/** Pass 3a: `<strong><em><strong>x</strong></em></strong>` needs only the outer strong. */
function flattenNestedMarks(root: Item): void {
  const stack: { node: Item; active: number }[] = [];
  const push = (parent: Item, active: number): void => {
    for (let child = parent.last; child; child = child.previous) {
      stack.push({ node: child, active });
    }
  };
  push(root, 0);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const el = frame.node;
    if (isText(el)) continue;
    const tag = el.tag;
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

function sameInline(a: Item, b: Item | null): boolean {
  const tag = a.tag;
  if (!b || tag === '' || b.tag !== tag) return false;
  if (MARKS.has(tag)) return true;
  return tag === 'a' && attributeOf(a, 'href') === attributeOf(b, 'href');
}

/** Pass 3b: join neighbours such as `<strong>a</strong><strong>b</strong>` and split text nodes. */
function mergeAdjacent(root: Item): void {
  const parents: Item[] = [root];
  for (let parent = parents.pop(); parent; parent = parents.pop()) {
    let node = parent.first;
    while (node) {
      const next: Item | null = node.next;
      if (isText(node) && next && isText(next)) {
        // Collect the whole run first: joining one piece at a time would copy the text each time.
        const parts = [node.text];
        let after: Item | null = next;
        while (after && isText(after)) {
          parts.push(after.text);
          const following: Item | null = after.next;
          removeNode(after);
          after = following;
        }
        node.text = parts.join('');
        continue;
      }
      if (next && sameInline(node, next)) {
        moveChildren(next, node);
        removeNode(next);
        continue;
      }
      // Emphasis either side of a space is one emphasised phrase.
      if (next && MARKS.has(node.tag) && isBlankText(next) && sameInline(node, next.next)) {
        appendChild(node, next);
        continue;
      }
      if (!isText(node)) parents.push(node);
      node = next;
    }
  }
}

/**
 * Pass 4: non-breaking spaces become spaces, whitespace runs collapse to one space, and each block
 * (and each line either side of a `br`) loses its leading and trailing space.
 */
function tidyText(root: Item): void {
  // True at the start of a block or after a space: the next leading space is dropped.
  let afterSpace = true;
  let trailing: Item | null = null;
  const endRun = (): void => {
    if (trailing) {
      const text = trailing.text.replace(/ $/, '');
      if (text === '') removeNode(trailing);
      else trailing.text = text;
    }
    trailing = null;
    afterSpace = true;
  };

  const stack: Frame[] = [];
  pushChildren(stack, root);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { node } = frame;
    if (isText(node)) {
      let text = node.text.replace(/[ \t\n\r\f\u00a0]+/g, ' ');
      if (afterSpace && text.startsWith(' ')) text = text.slice(1);
      if (text === '') {
        removeNode(node);
        continue;
      }
      node.text = text;
      afterSpace = text.endsWith(' ');
      trailing = afterSpace ? node : null;
      continue;
    }
    const tag = node.tag;
    if (TEXT_BOUNDARIES.has(tag)) {
      endRun();
    } else if (tag === 'img') {
      afterSpace = false;
      trailing = null;
    }
    if (!frame.exit && node.first) {
      stack.push({ node, exit: true });
      pushChildren(stack, node);
    }
  }
  endRun();
}

/** Pass 5: a paragraph that holds nothing but one image is an image block. */
function liftLoneImages(root: Item): void {
  for (const child of childrenOf(root)) {
    if (child.tag !== 'p') continue;
    const only = child.first;
    if (only && only === child.last && only.tag === 'img') {
      insertBefore(root, only, child);
      removeNode(child);
    }
  }
}

/**
 * A snapshot of the DOM children. Stepping from sibling to sibling can cost a search of the parent
 * on every step, which adds up when one element has tens of thousands of children.
 */
function domChildrenOf(parent: Node): Node[] {
  const first = parent.firstChild;
  if (!first) return [];
  if (first === parent.lastChild) return [first];
  return Array.from(parent.childNodes);
}

/** Copies the element and text nodes under `root` into a working tree. The DOM is only read. */
function readTree(root: Node): Item {
  const top = makeElement('#root');
  const stack: { node: Node; parent: Item }[] = [];
  const push = (domParent: Node, parent: Item): void => {
    // One snapshot per parent. Sibling pointers can cost a search of the parent on every step.
    const children = domChildrenOf(domParent);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const node = children[i];
      if (node) stack.push({ node, parent });
    }
  };
  push(root, top);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { node, parent } = frame;
    if (node.nodeType === TEXT_NODE) {
      appendChild(parent, makeText(node.nodeValue ?? ''));
      continue;
    }
    // Comments and anything else that is not content are left out.
    if (node.nodeType !== ELEMENT_NODE) continue;
    const el = node as Element;
    const attributes: Attribute[] = [];
    if (el.hasAttributes()) {
      for (const attribute of Array.from(el.attributes)) {
        attributes.push([attribute.name, attribute.value]);
      }
    }
    const item = makeElement(
      el.tagName.toLowerCase(),
      attributes.length > 0 ? attributes : NO_ATTRIBUTES,
    );
    appendChild(parent, item);
    push(el, item);
  }
  return top;
}

/** A subtree this many levels tall is cut loose on its own while the root is being emptied. */
const MAX_REMOVAL_HEIGHT = 200;

/**
 * Empties `root`. Removing a node can recurse through everything under it, so a very tall subtree
 * is first cut into pieces of a bounded height, deepest piece first.
 */
function removeAllChildren(root: Node): void {
  const heights = new Map<Node, number>();
  const stack: { node: Node; children: Node[] | null }[] = [{ node: root, children: null }];
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { node } = frame;
    if (!frame.children) {
      const children = domChildrenOf(node);
      if (children.length === 0) continue;
      stack.push({ node, children });
      for (const child of children) stack.push({ node: child, children: null });
      continue;
    }
    // Every child has been visited. A child that was cut loose no longer counts.
    let height = 0;
    for (const child of frame.children) {
      const below = heights.get(child);
      if (below !== undefined) {
        height = Math.max(height, below + 1);
        heights.delete(child);
      } else if (child.parentNode === node) {
        height = Math.max(height, 1);
      }
    }
    if (height >= MAX_REMOVAL_HEIGHT && node !== root) node.parentNode?.removeChild(node);
    else heights.set(node, height);
  }
  while (root.firstChild) root.removeChild(root.firstChild);
}

/**
 * Builds the DOM for the working tree under `root`. Each node is attached while it is still
 * empty, parent before child, so no call ever has to walk an existing subtree.
 */
function writeTree(top: Item, root: Node): void {
  const doc = root.ownerDocument;
  if (!doc) return;
  const stack: { item: Item; parent: Node }[] = [];
  const push = (from: Item, parent: Node): void => {
    for (let child = from.last; child; child = child.previous) stack.push({ item: child, parent });
  };
  push(top, root);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { item, parent } = frame;
    if (isText(item)) {
      parent.appendChild(doc.createTextNode(item.text));
      continue;
    }
    const el = doc.createElement(item.tag);
    for (const [name, value] of item.attributes) el.setAttribute(name, value);
    parent.appendChild(el);
    push(item, el);
  }
}

/** Replaces the content of `root` with its normalized form and returns `root`. */
export function normalize(root: HTMLElement): HTMLElement {
  const top = readTree(root);
  restructure(top);
  do removeEmptyElements(top);
  while (trimBreaks(top));
  flattenNestedMarks(top);
  mergeAdjacent(top);
  tidyText(top);
  liftLoneImages(top);
  removeAllChildren(root);
  writeTree(top, root);
  return root;
}
