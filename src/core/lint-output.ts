import { color } from '../config/tokens';

/**
 * Output linter (build spec, section 11.3). Every HTML string the tool emits must pass this.
 * Returns a list of problems; an empty list means the output meets the contract.
 *
 * The renderer escapes & < > in text and & " ' < > in attribute values, so in rendered output
 * every literal `<` starts a real tag. The linter therefore tokenizes tags and applies the
 * attribute rules to attribute names and the color rules to style values only; text such as
 * "user id=5" or "see #ABCDEF" is not a defect. The em dash rule covers the whole string.
 */
export interface LintOptions {
  /** Monthly letter may carry Outlook conditional comments, a preview-text div and a VML button. */
  monthly?: boolean;
}

/** Built from its code point so this file itself contains no em dash. */
export const EM_DASH = String.fromCharCode(0x2014);

const allowedColors = new Set(Object.values(color).map((c) => c.toUpperCase()));

interface Tag {
  name: string;
  closing: boolean;
  attrs: { name: string; value: string | undefined }[];
}

const isSpace = (ch: string | undefined): boolean => ch !== undefined && /\s/.test(ch);

/** Reads attributes from `start` up to the closing `>`; returns them and the index after it. */
function readAttributes(s: string, start: number): { attrs: Tag['attrs']; end: number } {
  const attrs: Tag['attrs'] = [];
  let i = start;
  while (i < s.length && s[i] !== '>') {
    if (isSpace(s[i]) || s[i] === '/') {
      i++;
      continue;
    }
    const nameStart = i;
    // A leading "=" is part of the name, as in the HTML tokenizer.
    i++;
    while (i < s.length && !isSpace(s[i]) && s[i] !== '=' && s[i] !== '>' && s[i] !== '/') i++;
    const name = s.slice(nameStart, i).toLowerCase();
    while (isSpace(s[i])) i++;
    let value: string | undefined;
    if (s[i] === '=') {
      i++;
      while (isSpace(s[i])) i++;
      const quote = s[i];
      if (quote === '"' || quote === "'") {
        const close = s.indexOf(quote, i + 1);
        const stop = close === -1 ? s.length : close;
        value = s.slice(i + 1, stop);
        i = close === -1 ? s.length : close + 1;
      } else {
        const valueStart = i;
        while (i < s.length && !isSpace(s[i]) && s[i] !== '>') i++;
        value = s.slice(valueStart, i);
      }
    }
    attrs.push({ name, value });
  }
  return { attrs, end: i < s.length ? i + 1 : i };
}

function tokenize(s: string): Tag[] {
  const tags: Tag[] = [];
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) break;
    if (s.startsWith('<!--', lt)) {
      const close = s.indexOf('-->', lt + 4);
      i = close === -1 ? s.length : close + 3;
      continue;
    }
    const closing = s[lt + 1] === '/';
    const nameStart = lt + (closing ? 2 : 1);
    if (!/[a-zA-Z]/.test(s[nameStart] ?? '')) {
      // Doctype, processing instruction or a stray "<": skip it.
      const gt = s.indexOf('>', lt + 1);
      i = gt === -1 ? s.length : gt + 1;
      continue;
    }
    let nameEnd = nameStart;
    while (nameEnd < s.length && !isSpace(s[nameEnd]) && s[nameEnd] !== '>' && s[nameEnd] !== '/')
      nameEnd++;
    const { attrs, end } = readAttributes(s, nameEnd);
    tags.push({ name: s.slice(nameStart, nameEnd).toLowerCase(), closing, attrs });
    i = end;
  }
  return tags;
}

const namedEntities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  tab: '\t',
  newline: '\n',
  num: '#',
  lpar: '(',
  rpar: ')',
};

/** Decodes the character references a browser would decode in an attribute value. */
function decode(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));?/g,
    (whole, dec, hex, name) => {
      if (dec !== undefined || hex !== undefined) {
        const code = dec !== undefined ? Number(dec) : parseInt(hex as string, 16);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      }
      return namedEntities[(name as string).toLowerCase()] ?? whole;
    },
  );
}

function attr(tag: Tag, name: string): string | undefined {
  return tag.attrs.find((a) => a.name === name)?.value;
}

function styleOf(tag: Tag): string {
  return tag.attrs
    .filter((a) => a.name === 'style')
    .map((a) => decode(a.value ?? ''))
    .join(';');
}

function declarations(style: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of style.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    if (prop && !map.has(prop)) map.set(prop, part.slice(colon + 1).trim());
  }
  return map;
}

const px = (value: string | undefined): number | undefined => {
  const m = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec((value ?? '').trim());
  if (!m) return undefined;
  return m[0].toLowerCase().endsWith('px') || Number(m[1]) === 0 ? Number(m[1]) : undefined;
};

/** Top and bottom padding in px from `padding` shorthand or longhands, or undefined if not in px. */
function verticalPadding(decl: Map<string, string>): number | undefined {
  let top: number | undefined;
  let bottom: number | undefined;
  const shorthand = decl.get('padding');
  if (shorthand !== undefined) {
    const parts = shorthand.split(/\s+/).filter(Boolean);
    if (parts.length >= 1 && parts.length <= 4) {
      const t = parts[0];
      const b = parts.length >= 3 ? parts[2] : parts[0];
      top = px(t);
      bottom = px(b);
    }
  }
  if (decl.has('padding-top')) top = px(decl.get('padding-top'));
  if (decl.has('padding-bottom')) bottom = px(decl.get('padding-bottom'));
  if (top === undefined || bottom === undefined) return undefined;
  return top + bottom;
}

export function lintOutput(html: string, options: LintOptions = {}): string[] {
  const problems: string[] = [];
  // Outlook conditional comments are checked separately; strip them before the general rules.
  const body = options.monthly ? html.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, '') : html;

  // The em dash rule applies to text as well as markup.
  if (body.includes(EM_DASH)) problems.push('contains an em dash');

  let divDepth = 0;
  for (const tag of tokenize(body)) {
    if (tag.name === 'div') {
      if (tag.closing) divDepth = Math.max(0, divDepth - 1);
      else {
        if (divDepth >= 1) problems.push('div nested inside another div');
        divDepth++;
      }
    }
    if (tag.closing) continue;

    if (tag.name === 'script') problems.push('contains <script>');
    if (tag.name === 'style') problems.push('contains <style>');

    for (const { name } of tag.attrs) {
      if (name === 'class') problems.push('contains a class attribute');
      else if (name === 'id') problems.push('contains an id attribute');
      else if (name.startsWith('data-')) problems.push('contains a data- attribute');
      else if (/^on[a-z]+$/.test(name)) problems.push('contains an event handler attribute');
    }

    const style = styleOf(tag);
    if (/calc\(/i.test(style)) problems.push('contains calc()');
    const colorValues = [
      style,
      ...tag.attrs
        .filter((a) => a.name === 'bgcolor' || a.name === 'color')
        .map((a) => decode(a.value ?? '')),
    ].join(';');
    for (const match of colorValues.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) {
      if (!allowedColors.has(match[0].toUpperCase()))
        problems.push(`color ${match[0]} is not a token`);
    }
    if (/rgba?\(/i.test(style)) problems.push('contains an rgb() color; use token hex values');

    if (tag.name === 'img') {
      if (!(attr(tag, 'alt') ?? '').trim()) problems.push('image without alt text');
      if (!/max-width:\s*(100%|\d+px)/i.test(style)) problems.push('image without max-width');
    }
    if (tag.name === 'a') {
      const raw = attr(tag, 'href');
      if (!raw) problems.push('link without href');
      else if (!/^(https:\/\/|http:\/\/|mailto:)/i.test(decode(raw)))
        problems.push(`link is not absolute: ${raw}`);

      const decl = declarations(style);
      if (/^inline-block$/i.test(decl.get('display') ?? '')) {
        const pad = verticalPadding(decl);
        if (pad !== undefined) {
          const lineHeight = /^(\d+(?:\.\d+)?)px$/i.exec(decl.get('line-height') ?? '');
          if (pad + (lineHeight ? Number(lineHeight[1]) : 0) < 44)
            problems.push('button shorter than 44px');
        }
      }
    }
    if (tag.name === 'table') {
      const widths = [...style.matchAll(/(?:^|[;\s])width:\s*(\d+(?:\.\d+)?)%/gi)].map((m) =>
        Number(m[1]),
      );
      const widthAttr = /^\s*(\d+(?:\.\d+)?)%\s*$/.exec(attr(tag, 'width') ?? '');
      if (widthAttr) widths.push(Number(widthAttr[1]));
      if (widths.some((w) => w !== 100))
        problems.push('layout table with a percentage width other than 100%');
    }
    if (tag.name === 'td' && (attr(tag, 'width') ?? '').trim() === '96')
      problems.push('retired two-column date row');
  }
  return [...new Set(problems)];
}
