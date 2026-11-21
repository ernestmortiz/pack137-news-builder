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

/** Elements whose work waits for an element above them, so that it is done once and not per level. */
interface Waiting {
  /**
   * Inline elements (strong, em, s, a) that hold blocks and sit inside another such element.
   * The outermost one pushes the whole chain into the blocks in one go.
   */
  inlines: Set<Item>;
  /**
   * A `div` or `p` that held blocks and sits inside another `div` or `p`. Its children are all
   * blocks by now. The outermost one moves everything up in one go.
   */
  hollow: Set<Item>;
}

function isInlineWrapper(tag: string): boolean {
  return MARKS.has(tag) || tag === 'a';
}

/** True when `el` has a block child, or an inline child that is waiting with blocks of its own. */
function holdsBlocks(el: Item, waiting: Waiting): boolean {
  for (let child = el.first; child; child = child.next) {
    if (BLOCKS.has(child.tag) || waiting.inlines.has(child)) return true;
  }
  return false;
}

/**
 * True when `node` has text, an image or a rule somewhere in it. Without one, the pass that
 * removes empty elements takes it out later, together with any element that holds nothing else.
 */
function hasContent(node: Item): boolean {
  const stack: Item[] = [node];
  for (let item = stack.pop(); item; item = stack.pop()) {
    if (isText(item)) {
      if (/\S/.test(item.text)) return true;
      continue;
    }
    const tag = item.tag;
    if (tag === 'img' || tag === 'hr') return true;
    if (tag === 'br') continue;
    for (let child = item.first; child; child = child.next) stack.push(child);
  }
  return false;
}

/** A run of neighbours with no block between them. */
interface Run {
  first: Item;
  last: Item;
  /** Every node is blank text. Such a run is never wrapped. */
  blank: boolean;
  /** See `hasContent`. */
  content: boolean;
}

/** One inline element on the way down from the outermost one that is being pushed into blocks. */
interface Level {
  el: Item;
  /**
   * False for a mark that an element further out already gives (a `strong` inside a `strong`).
   * Its copy would be taken out again when nested marks are flattened, so it is not made.
   */
  real: boolean;
  /** The nearest level at or above this one that is `real`. */
  realUp: number;
  /** The next child of `el` to look at. */
  next: Item | null;
  /** The run that is open at this level, if any. */
  run: Run | null;
}

/** Moves the nodes of `run` into a new copy of `el` that takes their place. */
function wrapRun(el: Item, run: Run): Run {
  const parent = run.first.parent;
  if (!parent) return run;
  const copy = makeElement(el.tag, el.attributes);
  insertBefore(parent, copy, run.first);
  const end = run.last.next;
  for (let node = copy.next; node && node !== end; node = copy.next) appendChild(copy, node);
  return { first: copy, last: copy, blank: false, content: run.content };
}

/**
 * What one level does with a run that ends: wrap it in a copy of the level's element, or leave it.
 *
 * Every level used to wrap every run that was not blank, so a paste with thousands of nested
 * marks around thousands of blocks made that many copies for each block. The copies left out
 * here are exactly the ones the later passes take out again:
 * - a mark inside the same mark, which `flattenNestedMarks` unwraps;
 * - a second wrapper around an element with no text or image in it, which `removeEmptyElements`
 *   removes along with that element.
 */
function settleRun(level: Level, run: Run): Run {
  if (run.blank) return run;
  if (!run.content) {
    // One empty element meets the same end with or without another wrapper. A `br` does not:
    // on its own it would stay.
    if (run.first === run.last && run.first.tag !== 'br') return run;
    return wrapRun(level.el, run);
  }
  return level.real ? wrapRun(level.el, run) : run;
}

/**
 * Wraps what is in a block in copies of `chain`, outermost first. A paragraph or heading has all
 * its content wrapped. In a list, each run of inline content is wrapped and each block inside is
 * treated the same way.
 */
function wrapBlockContent(block: Item, chain: readonly Item[]): void {
  const wrapNodes = (parent: Item, nodes: Item[]): void => {
    const first = nodes[0];
    if (!first || nodes.every(isBlankText)) return;
    let holder = parent;
    for (const el of chain) {
      const copy = makeElement(el.tag, el.attributes);
      if (holder === parent) insertBefore(parent, copy, first);
      else appendChild(holder, copy);
      holder = copy;
    }
    if (holder === parent) return;
    for (const node of nodes) appendChild(holder, node);
  };
  const tag = block.tag;
  if (tag === 'hr') return;
  if (tag === 'p' || HEADINGS.has(tag)) {
    wrapNodes(block, childrenOf(block));
    return;
  }
  const containers: Item[] = [block];
  for (let container = containers.pop(); container; container = containers.pop()) {
    let run: Item[] = [];
    for (const child of childrenOf(container)) {
      const childTag = child.tag;
      if (!BLOCKS.has(childTag)) {
        run.push(child);
        continue;
      }
      wrapNodes(container, run);
      run = [];
      if (childTag === 'p' || HEADINGS.has(childTag)) wrapNodes(child, childrenOf(child));
      else if (childTag !== 'hr') containers.push(child);
    }
    wrapNodes(container, run);
  }
}

/**
 * An inline element (strong, em, s, a) that wraps blocks is pushed down into them, so
 * `<b><div>One</div><div>Two</div></b>` keeps both paragraphs bold.
 *
 * `top` is the outermost of a chain: the inline elements inside it that hold blocks have waited
 * for it (`waiting.inlines`). The whole chain is handled in one walk. Every node under it moves
 * once, to where `top` was, and each block is wrapped once in the elements above it. The cost
 * follows the number of nodes, not nodes times levels.
 *
 * The result is the one the elements would give by each pushing itself down in turn, innermost
 * first: at every level, each run of inline content between two blocks is wrapped in a copy of
 * that level's element. Only the copies that later passes remove anyway are left out (see
 * `settleRun`).
 */
function pushInlineIntoBlocks(top: Item, waiting: Waiting): void {
  const destination = top.parent;
  if (!destination) return;
  const levels: Level[] = [];
  /** The levels that have a run open, outermost first. */
  const open: number[] = [];
  /** The `real` levels, outermost first: what a block's content is wrapped in. */
  const chain: Item[] = [];
  const marksInUse = new Map<string, number>();

  const enter = (el: Item): void => {
    const tag = el.tag;
    const uses = marksInUse.get(tag) ?? 0;
    const real = uses === 0;
    marksInUse.set(tag, uses + 1);
    if (real) chain.push(el);
    const index = levels.length;
    const above = levels[index - 1];
    levels.push({
      el,
      real,
      realUp: real || !above ? index : above.realUp,
      next: el.first,
      run: null,
    });
  };

  /** Adds `run` to the end of the run that is open at level `index`, or opens one with it. */
  const join = (index: number, run: Run): Run => {
    const level = levels[index];
    if (!level) return run;
    const before = level.run;
    if (!before) {
      level.run = run;
      open.push(index);
      return run;
    }
    before.last = run.last;
    before.blank = before.blank && run.blank;
    before.content = before.content || run.content;
    return before;
  };

  /** Ends the run at level `index` (the innermost open one) and returns what is left of it. */
  const end = (index: number): Run | null => {
    const level = levels[index];
    if (!level?.run) return null;
    const run = settleRun(level, level.run);
    level.run = null;
    open.pop();
    return run;
  };

  /** A block ends the open run of every level. Levels with nothing to do are stepped over. */
  const endAllRuns = (): void => {
    let run: Run | null = null;
    // The next level, going outward, that `run` has to pass.
    let index = levels.length - 1;
    for (;;) {
      const innermostOpen = open[open.length - 1] ?? -1;
      if (!run) {
        if (innermostOpen < 0) return;
        run = end(innermostOpen);
        index = innermostOpen - 1;
        continue;
      }
      // Which level does something with this run? One with a run of its own always does.
      let target = innermostOpen;
      if (!run.blank) {
        if (run.content) target = Math.max(target, levels[index]?.realUp ?? -1);
        else if (run.first !== run.last || run.first.tag === 'br') target = index;
      }
      if (target < 0) return;
      const level = levels[target];
      if (!level) return;
      if (target === innermostOpen) {
        join(target, run);
        run = end(target);
      } else {
        run = settleRun(level, run);
      }
      index = target - 1;
    }
  };

  enter(top);
  for (let level = levels[levels.length - 1]; level; level = levels[levels.length - 1]) {
    const index = levels.length - 1;
    const child = level.next;
    if (!child) {
      // The end of this element ends its own run. What is left joins the run of the level above.
      const run = open[open.length - 1] === index ? end(index) : null;
      levels.pop();
      const tag = level.el.tag;
      marksInUse.set(tag, (marksInUse.get(tag) ?? 1) - 1);
      if (level.real) chain.pop();
      if (run && index > 0) join(index - 1, run);
      continue;
    }
    level.next = child.next;
    if (BLOCKS.has(child.tag)) {
      endAllRuns();
      insertBefore(destination, child, top);
      wrapBlockContent(child, chain);
    } else if (waiting.inlines.delete(child)) {
      // Stays where it is, as a shell. It goes when `top` goes.
      enter(child);
    } else {
      insertBefore(destination, child, top);
      const blank = isBlankText(child);
      join(index, { first: child, last: child, blank, content: !blank && hasContent(child) });
    }
  }
  removeNode(top);
}

/**
 * Puts what is under `top` where `top` was. A `div` or `p` inside it that waited (`waiting.hollow`)
 * is stepped through, so each node moves once however many wrappers were around it.
 */
function dissolve(top: Item, waiting: Waiting): void {
  const destination = top.parent;
  if (!destination) return;
  if (waiting.hollow.size === 0) {
    unwrap(top);
    return;
  }
  const pending: Item[] = [];
  for (let child = top.last; child; child = child.previous) pending.push(child);
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (waiting.hollow.delete(node)) {
      for (let child = node.last; child; child = child.previous) pending.push(child);
    } else {
      insertBefore(destination, node, top);
    }
  }
  removeNode(top);
}

/** Runs when every descendant of `el` has already been restructured. */
function leaveElement(el: Item, waiting: Waiting): void {
  const tag = el.tag;
  if (tag === 'div' || tag === 'p') {
    if (hasBlockChild(el)) {
      wrapInlineRuns(el);
      // Inside another `div` or `p` it waits: that one holds a block now, so it goes too, and
      // moving the children up one level at a time would move them once per level.
      const above = el.parent?.tag;
      if (above === 'div' || above === 'p') waiting.hollow.add(el);
      else dissolve(el, waiting);
    } else if (tag === 'div') {
      rename(el, 'p');
    }
    return;
  }
  if (isInlineWrapper(tag)) {
    if (!holdsBlocks(el, waiting)) return;
    // Inside another inline element it waits: that one holds blocks now, so it is pushed down
    // too, and the two are pushed down together.
    if (el.parent && isInlineWrapper(el.parent.tag)) waiting.inlines.add(el);
    else pushInlineIntoBlocks(el, waiting);
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
  const waiting: Waiting = { inlines: new Set(), hollow: new Set() };
  const stack: Frame[] = [];
  pushChildren(stack, root);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { node } = frame;
    if (frame.exit) {
      leaveElement(node, waiting);
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
