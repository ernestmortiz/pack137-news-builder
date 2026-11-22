/**
 * Finish photos (build spec 8.2, Photos). The owner pastes the letter into TroopTrack, replaces
 * each photo spot with a photo in TroopTrack's editor, then pastes TroopTrack's code back here.
 * TroopTrack cannot set alt text and gives photos a fixed pixel width, so `finishPhotos` rewrites
 * every photo tag to the letter's photo pattern with the alt text from the matching spot.
 *
 * The pasted code is untrusted text. It is never parsed into a document and never reaches the
 * page: the function reads it as a string, changes only `<img>` start tags and copies every other
 * character through untouched, conditional comments, VML and the preview text included. The reader
 * follows the HTML standard's tokenizer closely enough that what it calls a tag is what a browser
 * calls a tag: it respects quotes, skips comments (Outlook conditional comments are comments) and
 * skips the text of script, style and similar elements. Where it is unsure (a tag or a comment
 * that never ends) it leaves the rest of the text alone.
 *
 * Every scan moves forward only, so the time taken grows in step with the size of the paste.
 */
import { cleanText, escAttr, safeWebUrl } from '../templates/components';

/** A photo spot in the letter, in letter order: the same shape `photoSpots(letter)` returns. */
export interface PhotoSpot {
  /** What the editor calls the spot, such as "Photo 2" or "Sidebar photo in block 5". */
  where: string;
  alt: string;
  /** The widest the photo may be in px, for a spot in a narrow box. Left out means 552. */
  maxWidth?: number;
}

export interface FinishOptions {
  /** The logo's address. The image with this address is left exactly as it was pasted. */
  logoUrl: string;
  /**
   * Addresses of photos the letter rendered itself (photo fields that had a usable address). They
   * already carry their alt text, so they are left alone and are not matched to a spot.
   */
  ownPhotoUrls?: string[];
}

export interface FinishResult {
  html: string;
  /** How many photo tags were rewritten. */
  fixed: number;
  /** Plain sentences for the owner, at most 20 and then "And N more." */
  notes: string[];
}

const SPOT_TEXT = 'Insert photo here:';
const MAX_WIDTH = 552;
const MIN_WIDTH = 40;
const MAX_NOTES = 20;
const MAX_WHERE = 60;

const TAB = 0x09;
const LF = 0x0a;
const FF = 0x0c;
const CR = 0x0d;
const SPACE = 0x20;
const BANG = 0x21;
const DQ = 0x22;
const SQ = 0x27;
const DASH = 0x2d;
const SLASH = 0x2f;
const EQ = 0x3d;
const GT = 0x3e;
const QUESTION = 0x3f;

/** Whitespace as the HTML tokenizer reads it. A no-break space is not whitespace there. */
const isWs = (c: number): boolean => c === SPACE || c === LF || c === TAB || c === CR || c === FF;
const isAlpha = (c: number): boolean => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
/** Lower-cases A to Z only, as the tokenizer does for tag and attribute names. */
const lowerAscii = (s: string): string => s.replace(/[A-Z]/g, (ch) => ch.toLowerCase());

/** Elements whose content is text, not tags, up to their own closing tag. */
const RAW_TEXT = ['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes'];
const rawTextEnd = new Map(
  RAW_TEXT.map((name) => [name, new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, 'gi')] as const),
);
const LONGEST_NAME = 9; // "plaintext"
const COMMENT_END = /--!?>/g;

/** The four attributes the rewrite reads, as written in the tag (not yet decoded). */
interface ImgAttrs {
  src?: string;
  width?: string;
  style?: string;
  alt?: string;
}

function keep(attrs: ImgAttrs, name: string, value: string): void {
  // The first of a repeated attribute wins, as in a browser.
  if (name === 'src') attrs.src ??= value;
  else if (name === 'width') attrs.width ??= value;
  else if (name === 'style') attrs.style ??= value;
  else if (name === 'alt') attrs.alt ??= value;
}

/**
 * Reads a tag's attributes from `from` (just after the tag name) and returns the index after the
 * closing `>`, or -1 when the tag never ends. With `attrs` it also collects src, width, style, alt.
 */
function readTag(s: string, from: number, attrs: ImgAttrs | undefined): number {
  const n = s.length;
  let i = from;
  for (;;) {
    while (i < n && (isWs(s.charCodeAt(i)) || s.charCodeAt(i) === SLASH)) i++;
    if (i >= n) return -1;
    if (s.charCodeAt(i) === GT) return i + 1;
    // The first character belongs to the name whatever it is, an "=" or a quote included.
    const nameStart = i;
    i++;
    while (i < n) {
      const c = s.charCodeAt(i);
      if (isWs(c) || c === SLASH || c === GT || c === EQ) break;
      i++;
    }
    const nameEnd = i;
    while (i < n && isWs(s.charCodeAt(i))) i++;
    let valueStart = -1;
    let valueEnd = -1;
    if (i < n && s.charCodeAt(i) === EQ) {
      i++;
      while (i < n && isWs(s.charCodeAt(i))) i++;
      if (i >= n) return -1;
      const c = s.charCodeAt(i);
      if (c === DQ || c === SQ) {
        const close = s.indexOf(c === DQ ? '"' : "'", i + 1);
        if (close === -1) return -1;
        valueStart = i + 1;
        valueEnd = close;
        i = close + 1;
      } else if (c === GT) {
        valueStart = valueEnd = i;
      } else {
        valueStart = i;
        while (i < n && !isWs(s.charCodeAt(i)) && s.charCodeAt(i) !== GT) i++;
        valueEnd = i;
      }
    }
    if (attrs !== undefined && nameEnd - nameStart <= 5) {
      const value = valueStart === -1 ? '' : s.slice(valueStart, valueEnd);
      keep(attrs, lowerAscii(s.slice(nameStart, nameEnd)), value);
    }
  }
}

const NAMED: Record<string, string> = {
  amp: '&',
  AMP: '&',
  lt: '<',
  LT: '<',
  gt: '>',
  GT: '>',
  quot: '"',
  QUOT: '"',
  nbsp: ' ',
  apos: "'",
  colon: ':',
  sol: '/',
  Tab: '\t',
  NewLine: '\n',
};
/** The names a browser also reads without a closing semicolon. */
const NO_SEMICOLON = new Set(['amp', 'AMP', 'lt', 'LT', 'gt', 'GT', 'quot', 'QUOT', 'nbsp']);

/**
 * Decodes character references in an attribute value the way a browser does, for the names above.
 * A name this does not know stays as written and is then escaped, so the address the browser sees
 * is the one that was checked.
 */
function decode(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));?/g,
    (
      whole: string,
      dec: string | undefined,
      hex: string | undefined,
      name: string | undefined,
      offset: number,
    ) => {
      if (name !== undefined) {
        const char = Object.hasOwn(NAMED, name) ? NAMED[name] : undefined;
        if (char === undefined) return whole;
        if (whole.endsWith(';')) return char;
        if (!NO_SEMICOLON.has(name)) return whole;
        // In an attribute, "&amp=" and "&amp1" are not references.
        const next = value.charCodeAt(offset + whole.length);
        return next === EQ || (next >= 0x30 && next <= 0x39) ? whole : char;
      }
      const code = dec !== undefined ? Number(dec) : parseInt(hex ?? '', 16);
      const usable = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return usable ? String.fromCodePoint(code) : '�';
    },
  );
}

/** A whole number of px from "300", "300px" or, for CSS, "300px" only. */
function px(raw: string, needsUnit: boolean): number | undefined {
  const m = /^(\d{1,6}(?:\.\d{1,6})?)\s*(px)?$/i.exec(raw.trim());
  if (m === null || (needsUnit && m[2] === undefined)) return undefined;
  return Math.round(Number(m[1]));
}

/** The last valid `width` in px in a style value, as CSS would apply it. */
function styleWidth(style: string): number | undefined {
  let width: number | undefined;
  for (const part of style.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    if (part.slice(0, colon).trim().toLowerCase() !== 'width') continue;
    let value = part.slice(colon + 1);
    const bang = value.indexOf('!');
    if (bang !== -1) value = value.slice(0, bang);
    width = px(value, true) ?? width;
  }
  return width;
}

/** The width attribute, else the style width, when it is from 40 to `max`; otherwise `max`. */
function photoWidth(attrs: ImgAttrs, max: number): number {
  const ok = (w: number | undefined): w is number => w !== undefined && w >= MIN_WIDTH && w <= max;
  const fromAttr = attrs.width === undefined ? undefined : px(decode(attrs.width), false);
  if (ok(fromAttr)) return fromAttr;
  const fromStyle = attrs.style === undefined ? undefined : styleWidth(decode(attrs.style));
  return ok(fromStyle) ? fromStyle : max;
}

interface Spot {
  where: string;
  alt: string;
  max: number;
}

function cleanSpots(spots: unknown): Spot[] {
  if (!Array.isArray(spots)) return [];
  return spots.map((raw: unknown, i): Spot => {
    const spot = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<PhotoSpot>;
    const where = typeof spot.where === 'string' ? cleanText(spot.where).trim() : '';
    const max =
      typeof spot.maxWidth === 'number' && Number.isFinite(spot.maxWidth)
        ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(spot.maxWidth)))
        : MAX_WIDTH;
    return {
      where: where === '' ? `Photo ${i + 1}` : where.slice(0, MAX_WHERE),
      alt: typeof spot.alt === 'string' ? spot.alt.trim() : '',
      max,
    };
  });
}

/** The addresses to leave alone, as written and as the renderer writes them. */
function keptAddresses(options: unknown): Set<string> {
  const kept = new Set<string>();
  const o = (typeof options === 'object' && options !== null ? options : {}) as Partial<
    Record<keyof FinishOptions, unknown>
  >;
  const own: unknown[] = Array.isArray(o.ownPhotoUrls) ? o.ownPhotoUrls : [];
  for (const raw of [o.logoUrl, ...own]) {
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    kept.add(raw.trim());
    const safe = safeWebUrl(raw);
    if (safe !== null) kept.add(safe);
  }
  return kept;
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function finish(s: string, spots: Spot[], kept: Set<string>): FinishResult {
  const n = s.length;
  const out: string[] = [];
  let copied = 0;
  let nextSpot = 0;
  let photos = 0;
  let fixed = 0;
  let alreadyRight = 0;
  let noSpot = 0;
  const notes: string[] = [];
  let noteCount = 0;
  const note = (text: string): void => {
    noteCount++;
    if (notes.length < MAX_NOTES) notes.push(text);
  };

  /** Counts the spot boxes still in the text from `from` to `to`; each one uses up a spot. */
  let nextBox = -2;
  const text = (from: number, to: number): void => {
    let at = from;
    for (;;) {
      // Look again only once the last find is behind us, so the whole scan stays one pass.
      if (nextBox !== -1 && nextBox < at) nextBox = s.indexOf(SPOT_TEXT, at);
      if (nextBox === -1 || nextBox + SPOT_TEXT.length > to) return;
      const spot = spots[nextSpot++];
      note(
        spot === undefined
          ? 'An Insert photo here box has no photo spot in the letter. Put a photo in its place or delete it in TroopTrack.'
          : `The spot for ${spot.where} still has no photo. Insert it in TroopTrack, then finish the photos again.`,
      );
      at = nextBox + SPOT_TEXT.length;
    }
  };

  /** The tag to write in place of a photo tag, or undefined to leave it as it is. */
  const photo = (tag: string, attrs: ImgAttrs): string | undefined => {
    const src = decode(attrs.src ?? '');
    const url = safeWebUrl(src);
    if (kept.has(src.trim()) || (url !== null && kept.has(url))) return undefined;
    photos++;
    const spot = spots[nextSpot++];
    if (spot === undefined) noSpot++;
    const label = spot === undefined ? `Photo ${photos}` : spot.where;
    if (url === null) {
      note(
        `${label} has an address that cannot be used, so it was removed. Insert it again in TroopTrack.`,
      );
      return '';
    }
    const w = photoWidth(attrs, spot === undefined ? MAX_WIDTH : spot.max);
    let alt = spot === undefined ? '' : spot.alt;
    if (alt === '') alt = decode(attrs.alt ?? '').trim();
    if (alt === '')
      note(
        spot === undefined
          ? `${label} has no description. Add a photo spot for it in the letter, or it will be read as nothing.`
          : `${label} has no description. Add its alt text in the letter, then finish the photos again, or it will be read as nothing.`,
      );
    const rewritten =
      `<img src="${escAttr(url)}" width="${w}" alt="${escAttr(alt)}" ` +
      `style="display:block;width:100%;max-width:${w}px;height:auto;border:0;">`;
    if (rewritten === tag) {
      alreadyRight++;
      return undefined;
    }
    fixed++;
    return rewritten;
  };

  let pos = 0;
  while (pos < n) {
    const lt = s.indexOf('<', pos);
    if (lt === -1) {
      text(pos, n);
      break;
    }
    text(pos, lt);
    const c1 = s.charCodeAt(lt + 1);

    if (c1 === BANG && s.startsWith('--', lt + 2)) {
      // A comment. "<!-->" and "<!--->" are whole comments; "--!>" also closes one.
      const j = lt + 4;
      let end: number;
      if (s.charCodeAt(j) === GT) end = j + 1;
      else if (s.charCodeAt(j) === DASH && s.charCodeAt(j + 1) === GT) end = j + 2;
      else {
        COMMENT_END.lastIndex = j;
        const m = COMMENT_END.exec(s);
        end = m === null ? -1 : m.index + m[0].length;
      }
      if (end === -1) break;
      pos = end;
      continue;
    }

    const closing = c1 === SLASH;
    const nameStart = lt + (closing ? 2 : 1);
    if (!isAlpha(s.charCodeAt(nameStart))) {
      if (c1 === BANG || c1 === QUESTION || (closing && nameStart < n)) {
        // A doctype, "<![endif]>", "<?...>" or "</3": all read as a comment up to the next ">".
        const gt = s.indexOf('>', lt + 2);
        if (gt === -1) break;
        pos = gt + 1;
      } else pos = lt + 1; // A "<" that is only text.
      continue;
    }

    let i = nameStart;
    while (i < n) {
      const c = s.charCodeAt(i);
      if (isWs(c) || c === SLASH || c === GT) break;
      i++;
    }
    const name = i - nameStart <= LONGEST_NAME ? lowerAscii(s.slice(nameStart, i)) : '';
    // A browser turns an <image> tag into an img, so it is a photo too.
    const attrs: ImgAttrs | undefined =
      !closing && (name === 'img' || name === 'image') ? {} : undefined;
    const end = readTag(s, i, attrs);
    if (end === -1) break;
    if (attrs !== undefined) {
      const replacement = photo(s.slice(lt, end), attrs);
      if (replacement !== undefined) {
        out.push(s.slice(copied, lt), replacement);
        copied = end;
      }
    }
    pos = end;
    if (closing) continue;
    if (name === 'plaintext') break;
    const rawEnd = rawTextEnd.get(name);
    if (rawEnd !== undefined) {
      rawEnd.lastIndex = pos;
      const m = rawEnd.exec(s);
      if (m === null) break;
      pos = m.index;
    }
  }
  out.push(s.slice(copied));

  const head: string[] = [];
  const already =
    alreadyRight === 0 ? '' : ` ${count(alreadyRight, 'more was', 'more were')} already right.`;
  if (photos === 0) head.push('No photos were found in the pasted code.');
  else if (fixed > 0) head.push(`Fixed ${count(fixed, 'photo', 'photos')}.${already}`);
  else if (alreadyRight === photos)
    head.push(
      photos === 1
        ? 'The photo was already right. Nothing was changed.'
        : `All ${photos} photos were already right. Nothing was changed.`,
    );
  else head.push(`No photos were fixed.${already}`);
  if (noSpot > 0)
    head.push(
      noSpot === 1
        ? 'The last photo in the pasted code has no photo spot in the letter.'
        : `The last ${noSpot} photos in the pasted code have no photo spot in the letter.`,
    );

  const all = [...head, ...notes];
  const total = head.length + noteCount;
  const shown = all.slice(0, MAX_NOTES);
  if (total > MAX_NOTES) shown.push(`And ${total - MAX_NOTES} more.`);
  return { html: out.join(''), fixed, notes: shown };
}

/**
 * Rewrites the photo tags in code pasted back from TroopTrack. `spots` is `photoSpots(letter)` for
 * the letter that was pasted there. Photos and any spot boxes still in the code are matched to the
 * spots in the order they appear, so a box left unfilled keeps its own spot and the photos after
 * it still get their own alt text. Never throws.
 */
export function finishPhotos(
  html: string,
  spots: PhotoSpot[],
  options: FinishOptions,
): FinishResult {
  const input = typeof html === 'string' ? html : '';
  try {
    return finish(input, cleanSpots(spots), keptAddresses(options));
  } catch {
    return {
      html: input,
      fixed: 0,
      notes: ['The photos could not be checked, so the code was left as it was.'],
    };
  }
}
