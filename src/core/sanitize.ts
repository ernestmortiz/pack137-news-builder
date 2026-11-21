/**
 * Sanitize stage (build spec, section 7.3 and 11.5).
 *
 * Pasted HTML is untrusted. It is parsed into an inert document with DOMParser and reduced to a
 * small allow-list of elements and attributes. Nothing here touches the live page.
 */
import type { Issue, IssueCode } from './model';

export interface SanitizeResult {
  /** The `<body>` of the inert document, cleaned in place. */
  root: HTMLElement;
  issues: Issue[];
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

/** Removed together with everything inside them. */
const DROPPED = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'noscript',
  'template',
  'link',
  'meta',
  'base',
  'title',
  'svg',
  'math',
  'video',
  'audio',
  'canvas',
]);

/** Kept. Every other element is unwrapped: its children stay, the element goes. */
const ALLOWED = new Set([
  'p',
  'div',
  'span',
  'font',
  'center',
  'br',
  'a',
  'img',
  'strong',
  'b',
  'em',
  'i',
  's',
  'strike',
  'del',
  'u',
  'sup',
  'sub',
  'small',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'hr',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'blockquote',
]);

/** Emphasis found in inline styles, carried down to the text it applies to. */
const BOLD = 1;
const ITALIC = 2;
const STRIKE = 4;

/** Elements that already carry an emphasis, so the style must not add it again. */
const TAG_EMPHASIS: Record<string, number> = {
  strong: BOLD,
  b: BOLD,
  em: ITALIC,
  i: ITALIC,
  s: STRIKE,
  strike: STRIKE,
  del: STRIKE,
};

/**
 * Dropped like the rest, but without a warning. They never hold content, and Chrome puts a
 * `<meta charset>` on every clipboard paste, so a warning would show on every paste.
 */
const QUIET = new Set(['meta', 'title', 'link', 'base']);

const MAX_DETAIL = 200;

/** One `property: value` pair from an inline style, both lower case, `!important` removed. */
type Declaration = [property: string, value: string];

interface StyleEmphasis {
  /** Bits the style turns on. */
  set: number;
  /** Bits the style turns off (`font-weight: normal`, `font-style: normal`). */
  clear: number;
}

interface Frame {
  node: Node;
  /** Emphasis inherited from styled ancestors that has not been turned into elements yet. */
  emphasis: number;
}

interface Wrapper {
  emphasis: number;
  /** The innermost emphasis element, where text goes. */
  inner: Element;
}

type UrlKind = 'https' | 'http' | 'mailto' | 'blocked' | 'none';

interface CleanUrl {
  kind: UrlKind;
  /** The address to keep or to show beside the warning. */
  value: string;
}

const NO_DECLARATIONS: Declaration[] = [];

function readDeclarations(style: string | null): Declaration[] {
  if (!style) return NO_DECLARATIONS;
  const result: Declaration[] = [];
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration
      .slice(colon + 1)
      .replace(/!\s*important/i, '')
      .trim()
      .toLowerCase();
    result.push([property, value]);
  }
  return result;
}

/**
 * True when the inline style hides the element from the reader: `display:none`, `mso-hide:all`,
 * `visibility:hidden`, or `max-height:0` together with `overflow:hidden`. Mail templates hide
 * their preview text this way. A later declaration of the same property wins, as in a browser.
 */
function isHidden(declarations: Declaration[]): boolean {
  if (declarations.length === 0) return false;
  let display = '';
  let visibility = '';
  let msoHide = '';
  let maxHeight = '';
  let overflow = '';
  for (const [property, value] of declarations) {
    if (property === 'display') display = value;
    else if (property === 'visibility') visibility = value;
    else if (property === 'mso-hide') msoHide = value;
    else if (property === 'max-height') maxHeight = value;
    else if (property === 'overflow') overflow = value;
  }
  if (display === 'none' || visibility === 'hidden' || msoHide === 'all') return true;
  return overflow === 'hidden' && /^0+(\.0+)?[a-z%]*$/.test(maxHeight);
}

/** A whole number of pixels from `width: Npx` or `height: Npx`. Percentages and `auto` give null. */
function readStyleSize(declarations: Declaration[], name: 'width' | 'height'): string | null {
  let size: string | null = null;
  for (const [property, value] of declarations) {
    if (property !== name) continue;
    const match = /^(\d+)px$/.exec(value);
    size = match ? (match[1] ?? null) : null;
  }
  return size;
}

function readStyleEmphasis(declarations: Declaration[]): StyleEmphasis {
  const result: StyleEmphasis = { set: 0, clear: 0 };
  for (const [property, value] of declarations) {
    if (property === 'font-weight') {
      const bold = value === 'bold' || (/^\d+(\.\d+)?$/.test(value) && Number(value) >= 600);
      const plain = value === 'normal' || (/^\d+(\.\d+)?$/.test(value) && Number(value) < 600);
      if (bold) {
        result.set |= BOLD;
        result.clear &= ~BOLD;
      } else if (plain) {
        result.clear |= BOLD;
        result.set &= ~BOLD;
      }
    } else if (property === 'font-style') {
      if (value === 'italic') {
        result.set |= ITALIC;
        result.clear &= ~ITALIC;
      } else if (value === 'normal') {
        result.clear |= ITALIC;
        result.set &= ~ITALIC;
      }
    } else if (property === 'text-decoration' || property === 'text-decoration-line') {
      if (/(^|\s)line-through(\s|$)/.test(value)) result.set |= STRIKE;
    }
  }
  return result;
}

/**
 * Cleans a URL and says what kind it is. Control characters are removed everywhere. The scheme is
 * judged with every space removed too, so `java script:` cannot slip past. Spaces left inside a
 * kept address are written as `%20` so a mailto subject typed with spaces keeps its words.
 */
function cleanUrl(raw: string): CleanUrl {
  let visible = '';
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) continue;
    visible += raw.charAt(i);
  }
  visible = visible.trim();
  const compact = visible.replace(/ /g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  if (!scheme) return { kind: 'none', value: compact };

  const name = (scheme[1] ?? '').toLowerCase();
  const rest = compact.slice(name.length + 1);
  if (name === 'https' || name === 'http') {
    // Must be absolute: two slashes then a host.
    if (!/^\/\/[^/?#\\]/.test(rest)) return { kind: 'blocked', value: compact };
  } else if (name === 'mailto') {
    if (rest === '') return { kind: 'none', value: compact };
  } else {
    return { kind: 'blocked', value: compact };
  }

  // Keep inner spaces as %20 when the scheme itself was written without any.
  const encoded = visible.replace(/ /g, '%20');
  const body = encoded.slice(0, name.length + 1).toLowerCase() === `${name}:` ? encoded : compact;
  const start = name === 'mailto' ? `${name}:` : `${name}://`;
  if (!body.toLowerCase().startsWith(start)) return { kind: name, value: `${name}:${rest}` };
  return { kind: name, value: `${name}:${body.slice(name.length + 1)}` };
}

function shorten(text: string): string {
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}...` : text;
}

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function removeNode(node: Node): void {
  node.parentNode?.removeChild(node);
}

function hasVisibleText(el: Element): boolean {
  return /\S/.test(el.textContent ?? '');
}

/** A positive whole number, with or without `px`, or 0 when the text is anything else. */
function readSize(raw: string | null): number {
  const match = raw === null ? null : /^\s*(\d+)(?:px)?\s*$/i.exec(raw);
  const size = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(size) && size > 0 ? size : 0;
}

/**
 * Keeps a size only when it is a positive whole number. The attribute is used when it is valid;
 * otherwise the size the inline style gave in pixels, if any.
 */
function cleanSize(
  el: Element,
  name: 'width' | 'height',
  attribute: string | null,
  fromStyle: string | null,
): void {
  const size = readSize(attribute) || readSize(fromStyle);
  if (size > 0) el.setAttribute(name, String(size));
}

export function sanitize(html: string): SanitizeResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;
  const issues: Issue[] = [];
  const seen = new Set<string>();
  const wrappers = new WeakMap<Node, Wrapper>();

  const report = (code: IssueCode, message: string, detail: string): void => {
    const key = `${code}\n${detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ code, message, detail });
  };

  const reportDropped = (tag: string): void => {
    report(
      'dropped-element',
      `Some "${tag}" content was removed because it cannot be used in an email.`,
      tag,
    );
  };

  // The parser moves a leading script, style, meta or title into the head. They never reach the
  // result, but the person should still hear that a script or style was left out.
  if (doc.head) {
    for (const el of Array.from(doc.head.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase();
      if (DROPPED.has(tag) && !QUIET.has(tag)) reportDropped(tag);
    }
  }

  /** Wraps a text node in the emphasis elements its styled ancestors asked for. */
  const applyEmphasis = (text: Node, emphasis: number): void => {
    const before = text.previousSibling;
    const run = before ? wrappers.get(before) : undefined;
    if (before && run && run.emphasis === emphasis) {
      // Continue the run started by the previous text node.
      run.inner.appendChild(text);
      return;
    }
    if (!/\S/.test(text.nodeValue ?? '')) return;
    const parent = text.parentNode;
    if (!parent) return;
    const tags: string[] = [];
    if (emphasis & BOLD) tags.push('strong');
    if (emphasis & ITALIC) tags.push('em');
    if (emphasis & STRIKE) tags.push('s');
    let outer: Element | null = null;
    let inner: Element | null = null;
    for (const tag of tags) {
      const el: Element = doc.createElement(tag);
      if (inner) inner.appendChild(el);
      else outer = el;
      inner = el;
    }
    if (!outer || !inner) return;
    parent.insertBefore(outer, text);
    inner.appendChild(text);
    wrappers.set(outer, { emphasis, inner });
  };

  const stack: Frame[] = [];
  const pushChildren = (parent: Node, emphasis: number): void => {
    // Last child first, so the first child is popped first and work runs in document order.
    for (let child = parent.lastChild; child; child = child.previousSibling) {
      stack.push({ node: child, emphasis });
    }
  };

  /** Checks a link. Returns false when the link has to be unwrapped. */
  const cleanLink = (el: Element, raw: string | null): boolean => {
    if (raw === null) {
      // An anchor that was never a link (a named anchor, or one the editor left behind).
      if (hasVisibleText(el)) {
        report('link-no-destination', 'A link had no destination. The words were kept.', '');
      }
      return false;
    }
    const url = cleanUrl(raw);
    if (url.kind === 'none') {
      report(
        'link-no-destination',
        url.value === ''
          ? 'A link had no destination. The words were kept.'
          : 'This link does not start with https:// so it does not lead anywhere. The link was removed and the words were kept.',
        shorten(url.value),
      );
      return false;
    }
    if (url.kind === 'blocked') {
      report(
        'blocked-url',
        'This link is not a web or email address, so it was removed. The words were kept.',
        shorten(url.value),
      );
      return false;
    }
    if (url.kind === 'http') {
      report('insecure-url', 'This link starts with http: rather than https:.', url.value);
    }
    el.setAttribute('href', url.value);
    return true;
  };

  /** Checks an image. Returns false when the image has to be removed. */
  const cleanImage = (
    el: Element,
    src: string | null,
    alt: string | null,
    width: string | null,
    height: string | null,
    declarations: Declaration[],
  ): boolean => {
    if (src === null || src.trim() === '') {
      report('blocked-url', 'A picture had no address, so it was removed.', '');
      return false;
    }
    const url = cleanUrl(src);
    if (url.kind !== 'https' && url.kind !== 'http') {
      report(
        'blocked-url',
        'This picture does not have a web address that starts with https://, so it was removed.',
        shorten(url.value),
      );
      return false;
    }
    if (url.kind === 'http') {
      report('insecure-url', 'This picture starts with http: rather than https:.', url.value);
    }
    el.setAttribute('src', url.value);
    if (alt === null || alt.trim() === '') {
      report(
        'image-no-alt',
        'This picture has no description for people who cannot see it.',
        url.value,
      );
      el.setAttribute('alt', '');
    } else {
      el.setAttribute('alt', alt);
    }
    cleanSize(el, 'width', width, readStyleSize(declarations, 'width'));
    cleanSize(el, 'height', height, readStyleSize(declarations, 'height'));
    return true;
  };

  pushChildren(root, 0);
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { node } = frame;
    const type = node.nodeType;

    if (type === TEXT_NODE) {
      if (frame.emphasis !== 0) applyEmphasis(node, frame.emphasis);
      continue;
    }
    if (type !== ELEMENT_NODE) {
      // Comments (Outlook conditional blocks included) and anything else that is not content.
      if (type !== COMMENT_NODE || node.parentNode) removeNode(node);
      continue;
    }

    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROPPED.has(tag)) {
      if (!QUIET.has(tag)) reportDropped(tag);
      removeNode(el);
      continue;
    }

    const declarations = readDeclarations(el.getAttribute('style'));
    if (isHidden(declarations)) {
      // Hidden preview text and the like. Not content, so it goes without a warning.
      removeNode(el);
      continue;
    }

    const style = readStyleEmphasis(declarations);
    const own = TAG_EMPHASIS[tag] ?? 0;
    // A `b` styled as normal weight is a wrapper, not emphasis (Google Docs pastes one).
    const cancelled = (own & style.clear) !== 0;
    const emphasis = ((frame.emphasis & ~style.clear) | style.set) & ~(cancelled ? 0 : own);

    if (!ALLOWED.has(tag) || cancelled) {
      pushChildren(el, emphasis);
      unwrap(el);
      continue;
    }

    const href = tag === 'a' ? el.getAttribute('href') : null;
    const src = tag === 'img' ? el.getAttribute('src') : null;
    const alt = tag === 'img' ? el.getAttribute('alt') : null;
    const width = tag === 'img' ? el.getAttribute('width') : null;
    const height = tag === 'img' ? el.getAttribute('height') : null;
    for (const attribute of Array.from(el.attributes)) el.removeAttribute(attribute.name);

    if (tag === 'img') {
      if (!cleanImage(el, src, alt, width, height, declarations)) removeNode(el);
      continue;
    }
    if (tag === 'a' && !cleanLink(el, href)) {
      pushChildren(el, emphasis);
      unwrap(el);
      continue;
    }
    pushChildren(el, emphasis);
  }

  return { root, issues };
}
