/**
 * Canonical components (build spec, section 6.1). Each function is pure: values in, an HTML string
 * out. Strings are joined by concatenation only, never by String.replace with a replacement string,
 * so user text such as "$&" comes out literally (ADR 0004, Renderer item 3).
 */
import { color, fontStack, radius, space } from '../config/tokens';
import { formatDate, formatRange, isValidDate, type CalendarDate } from '../core/dates';
import type { ButtonField, DateField, DateRow, ImageField, RichText, Tag } from '../core/forms';
import { EM_DASH, emDashesToCommas } from '../core/helpers/text';

/* ---------- text and URL safety ---------- */

/** Em dashes (with the spaces around them) become ", " and line breaks become spaces. */
export function cleanText(text: string): string {
  return emDashesToCommas(text).replace(/[\r\n]+/g, ' ');
}

/** Text content: escapes & < >. Apostrophes and quotes stay as typed. */
export function esc(text: string): string {
  return cleanText(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Attribute value: escapes & " ' < >. */
export function escAttr(text: string): string {
  return esc(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function encodeChar(ch: string): string {
  try {
    return encodeURIComponent(ch);
  } catch {
    // A lone surrogate cannot be encoded; use the replacement character.
    return '%EF%BF%BD';
  }
}

/** Percent-encodes every character not matched by `keep`, leaving existing %XX escapes alone. */
function percentEncode(text: string, keep: { test: (ch: string) => boolean }): string {
  return text
    .split(/(%[0-9A-Fa-f]{2})/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : Array.from(part)
            .map((ch) => (keep.test(ch) ? ch : encodeChar(ch)))
            .join(''),
    )
    .join('');
}

// Everything except whitespace, control characters (code points 0 to 31 and 127) and the em dash.
const URL_KEEP = {
  test: (ch: string): boolean => {
    const code = ch.codePointAt(0) ?? 0;
    return code > 31 && code !== 127 && !/\s/.test(ch) && ch !== EM_DASH;
  },
};

const MAILTO_ADDRESS_KEEP = /[A-Za-z0-9@.+_~,-]/;
const MAILTO_QUERY_KEEP = /[A-Za-z0-9._~-]/;

function encodeMailto(rest: string): string {
  const q = rest.indexOf('?');
  const address = q < 0 ? rest : rest.slice(0, q);
  const pairs = q < 0 ? [] : rest.slice(q + 1).split('&');
  const query = pairs
    .filter((pair) => pair !== '')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 0) return percentEncode(pair, MAILTO_QUERY_KEEP);
      return (
        percentEncode(pair.slice(0, eq), MAILTO_QUERY_KEEP) +
        '=' +
        percentEncode(pair.slice(eq + 1), MAILTO_QUERY_KEEP)
      );
    })
    .join('&');
  return percentEncode(address, MAILTO_ADDRESS_KEEP) + (query ? '?' + query : '');
}

/**
 * Returns the URL ready for an href (not yet attribute-escaped), or null when it is not an absolute
 * https://, http:// or mailto: URL. Spaces, control characters and em dashes are percent-encoded;
 * mailto query values are percent-encoded and existing %XX escapes are kept.
 */
export function safeUrl(raw: string): string | null {
  const url = raw.trim();
  const scheme = /^(https?:\/\/|mailto:)/i.exec(url)?.[0];
  if (scheme === undefined) return null;
  const rest = url.slice(scheme.length);
  if (rest === '' || /^\s/.test(rest)) return null;
  if (scheme.toLowerCase() === 'mailto:') return scheme + encodeMailto(rest);
  // Userinfo ("user@host") makes a link show one site and open another, so refuse it.
  const authority = /^[^/?#]*/.exec(rest)?.[0] ?? '';
  if (authority.includes('@')) return null;
  return scheme + percentEncode(rest, URL_KEEP);
}

/** Like safeUrl but only web URLs, for image sources. */
export function safeWebUrl(raw: string): string | null {
  const url = safeUrl(raw);
  return url !== null && !/^mailto:/i.test(url) ? url : null;
}

/* ---------- indentation ---------- */

/** Indents every non-empty line by `spaces`. Text never holds a newline, so this is safe. */
export function indent(html: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return html
    .split('\n')
    .map((line) => (line === '' ? line : pad + line))
    .join('\n');
}

function lines(...parts: (string | false | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').join('\n');
}

/* ---------- inline pieces ---------- */

const LINK_STYLE = `color:${color.navy};font-weight:700;text-decoration:underline;`;
const EVENT_LINK_STYLE = `${LINK_STYLE}font-size:16px;`;

/**
 * True when a link's visible text is a bare web address (spec 6.1, 2026-11-22). The rule: after
 * removing tags and trimming, the text starts with http://, https:// or www., or it has no
 * whitespace and holds both a dot and a slash. Such text has no break opportunities, so it gets
 * `word-break:break-all` and never widens the card on a phone. Ordinary words never match.
 */
export function looksLikeWebAddress(innerHtml: string): boolean {
  const text = innerHtml
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .trim();
  if (/^(https?:\/\/|www\.)/i.test(text)) return true;
  return !/\s/.test(text) && text.includes('.') && text.includes('/');
}

/** A link. Everything but mailto opens in a new tab with a safe rel. `href` must be from safeUrl. */
export function anchor(href: string, style: string, inner: string): string {
  const attrs = /^mailto:/i.test(href) ? '' : ' target="_blank" rel="noopener noreferrer"';
  const wrap =
    looksLikeWebAddress(inner) && !/word-break:/i.test(style) ? 'word-break:break-all;' : '';
  return `<a href="${escAttr(href)}"${attrs} style="${style}${wrap}">${inner}</a>`;
}

/** Rich text: marks, links and line breaks. A link with an unusable URL is plain text. */
export function richText(runs: RichText): string {
  return runs
    .map((run) => {
      if (run.kind === 'break') return '<br>';
      if (run.text === '') return '';
      let html = esc(run.text);
      if (run.marks.includes('strike')) html = `<s>${html}</s>`;
      if (run.marks.includes('em')) html = `<em>${html}</em>`;
      if (run.marks.includes('strong')) html = `<strong>${html}</strong>`;
      const href = run.href === undefined ? null : safeUrl(run.href);
      return href === null ? html : anchor(href, LINK_STYLE, html);
    })
    .join('');
}

export function isEmptyRich(runs: RichText): boolean {
  return !runs.some((run) => run.kind === 'text' && run.text.trim() !== '');
}

const PILL_BASE = 'display:inline-block;white-space:nowrap;';

/** Escaped text with every space written as &nbsp;, so a pill never wraps (Outlook ignores nowrap on spans). */
function nbspText(text: string): string {
  return esc(text).replace(/ /g, '&nbsp;');
}

/**
 * The gold label pill on navy, or the strong pill in a highlight panel. A one-cell table, because
 * Outlook for Windows ignores padding and background on a span.
 */
export function badge(text: string, tone: 'gold' | 'navy'): string {
  const bg = tone === 'gold' ? color.gold : color.navy;
  const fg = tone === 'gold' ? color.navy : color.goldLight;
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">' +
    `<tr><td bgcolor="${bg}" style="background-color:${bg};color:${fg};font-family:${fontStack};` +
    'font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;' +
    `padding:4px 10px;border-radius:${radius.control}px;">${nbspText(text)}</td></tr></table>`
  );
}

/**
 * A small tag after an event name. Quiet tags use white inside a colored panel, with a thin navy
 * outline so the tag still shows in mail apps that drop a white background (Outlook on a phone,
 * seen 2026-11-22; owner decision, option a). The padding loses the outline's 1px, so every tag
 * is the same size.
 */
export function tag(t: Tag, onPanel: boolean): string {
  const strong = t.strength === 'strong';
  const outlined = !strong && onPanel;
  const bg = strong ? color.navy : onPanel ? color.white : color.lavender;
  const fg = strong ? color.goldLight : color.navy;
  const box = outlined ? `border:1px solid ${color.navy};padding:1px 7px;` : 'padding:2px 8px;';
  return (
    `<span style="${PILL_BASE}background-color:${bg};color:${fg};font-size:11px;font-weight:700;` +
    `text-transform:uppercase;${box}border-radius:${radius.control}px;">${nbspText(t.text)}</span>`
  );
}

/* ---------- blocks ---------- */

/** A button table, or an empty string when the URL or the text is unusable. */
export function button(field: ButtonField | undefined, variant: 'primary' | 'secondary'): string {
  if (field === undefined || field.text.trim() === '') return '';
  const href = safeUrl(field.url);
  if (href === null) return '';
  // Gold (owner decision 2026-11-22) replaces either variant and always takes navy text.
  const gold = field.color === 'gold';
  const bg = gold ? color.gold : variant === 'primary' ? color.navy : color.lavender;
  const fg = gold || variant === 'secondary' ? color.navy : color.white;
  const style =
    `display:inline-block;padding:13px 22px;font-family:${fontStack};color:${fg};font-size:16px;font-weight:700;` +
    `line-height:18px;text-decoration:none;border-radius:${radius.control}px;`;
  return lines(
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0">',
    '  <tr>',
    `    <td bgcolor="${bg}" style="background-color:${bg};border-radius:${radius.control}px;mso-padding-alt:13px 22px;">`,
    `      ${anchor(href, style, esc(field.text))}`,
    '    </td>',
    '  </tr>',
    '</table>',
  );
}

/** A paragraph of rich text with the given margin, for example "0 0 14px 0". */
export function paragraph(runs: RichText, margin: string, extraStyle = ''): string {
  return `<p style="margin:${margin};${extraStyle}">${richText(runs)}</p>`;
}

/** An 80px image shown above the text. Left out without a usable web URL; empty alt is kept as alt="". */
export function image(field: ImageField | undefined): string {
  if (field === undefined) return '';
  const src = safeWebUrl(field.src);
  if (src === null) return '';
  return lines(
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0">',
    '  <tr>',
    '    <td style="padding:0 0 12px 0;">',
    `      <img src="${escAttr(src)}" width="80" alt="${escAttr(field.alt.trim())}" ` +
      `style="display:block;width:80px;max-width:100%;height:auto;border:0;">`,
    '    </td>',
    '  </tr>',
    '</table>',
  );
}

/** Section heading inside a card. */
export function sectionHeading(name: string): string {
  return `<p style="margin:20px 0 4px 0;color:${color.navy};font-size:17px;font-weight:700;">${esc(name)}</p>`;
}

/** A 20px gap, used before a panel that follows other content. */
export function spacer(height = 20): string {
  return `<div style="height:${height}px;line-height:${height}px;font-size:1px;mso-line-height-rule:exactly;">&nbsp;</div>`;
}

/** Font stack, ink color and body size for a td in a nested table; Outlook does not inherit them. */
const CELL_TEXT = `font-family:${fontStack};color:${color.ink};font-size:15px;line-height:1.5;`;

/** A full-width highlight or quiet panel holding `inner`. */
export function panel(bg: 'goldPale' | 'lavender', inner: string): string {
  return lines(
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">',
    '  <tr>',
    `    <td bgcolor="${color[bg]}" style="background-color:${color[bg]};border-radius:${radius.panel}px;padding:${space.panel}px;${CELL_TEXT}">`,
    indent(inner, 6),
    '    </td>',
    '  </tr>',
    '</table>',
  );
}

/**
 * Paragraphs with the optional yellow box (owner decision 2026-11-22). Empty paragraphs are
 * dropped first and never make a box. Consecutive boxed paragraphs share one goldPale panel, with
 * 14px between them and margin 0 on the last. Plain paragraphs keep the usual margins (14px, the
 * last 16px before a button). A box is followed by a 14px spacer when text or a button comes
 * after it, so nothing touches the box. Returns one HTML string per block.
 */
export function boxedParagraphs(
  items: { runs: RichText; boxed: boolean }[],
  hasButton: boolean,
): string[] {
  const shown = items.filter((item) => !isEmptyRich(item.runs));
  const blocks: string[] = [];
  let i = 0;
  while (i < shown.length) {
    const boxed = shown[i]?.boxed === true;
    let end = i;
    while (end + 1 < shown.length && (shown[end + 1]?.boxed === true) === boxed) end++;
    const group = shown.slice(i, end + 1);
    const hasNext = end + 1 < shown.length;
    if (boxed) {
      blocks.push(
        panel(
          'goldPale',
          lines(
            ...group.map((g, k) => paragraph(g.runs, k < group.length - 1 ? '0 0 14px 0' : '0')),
          ),
        ),
      );
      if (hasNext || hasButton) blocks.push(spacer(14));
    } else {
      group.forEach((g, k) => {
        const last = k === group.length - 1;
        const margin = !last || hasNext ? '0 0 14px 0' : hasButton ? '0 0 16px 0' : '0';
        blocks.push(paragraph(g.runs, margin));
      });
    }
    i = end + 1;
  }
  return blocks;
}

/** The card shell: navy header with the label pill and title, then the body cell. */
export function cardShell(label: string, title: string, body: string): string {
  const header = lines(
    label.trim() !== '' && badge(label, 'gold'),
    title.trim() !== '' &&
      `<p style="margin:8px 0 0 0;color:${color.white};font-size:20px;font-weight:700;line-height:1.3;">${esc(title)}</p>`,
  );
  return lines(
    `<table role="presentation" width="100%" align="center" cellpadding="0" cellspacing="0" border="0" bgcolor="${color.white}" style="max-width:600px;margin:0 auto;border-collapse:separate;background-color:${color.white};border:1px solid ${color.lavender};border-radius:${radius.panel}px;font-family:${fontStack};word-break:break-word;">`,
    '  <tr>',
    `    <td bgcolor="${color.navy}" style="background-color:${color.navy};border-radius:${radius.panel}px ${radius.panel}px 0 0;padding:${space.card}px;font-family:${fontStack};">`,
    indent(header, 6),
    '    </td>',
    '  </tr>',
    '  <tr>',
    `    <td style="padding:14px;font-family:${fontStack};color:${color.ink};font-size:15px;line-height:1.5;">`,
    indent(body, 6),
    '    </td>',
    '  </tr>',
    '</table>',
  );
}

/* ---------- date rows and link rows ---------- */

/** "Sat Nov 21", or "Sat Feb 27 to Sun Feb 28". Null when there is no usable start date. */
export function dateText(field: DateField | undefined): string | null {
  if (field === undefined || !isValidDate(field.start)) return null;
  const end = field.end;
  if (end !== undefined && isValidDate(end)) {
    const same =
      end.year === field.start.year &&
      end.month === field.start.month &&
      end.day === field.start.day;
    if (!same) return formatRange(field.start, end);
  }
  return formatDate(field.start);
}

/** A Date list row is shown when it has an event or a usable date. Shared with formWarnings. */
export function rowIsShown(row: DateRow): boolean {
  return row.event.trim() !== '' || dateText(row.date) !== null;
}

function eventHtml(row: DateRow): string {
  const href = safeUrl(row.url);
  return href === null
    ? `<span style="font-size:16px;">${esc(row.event)}</span>`
    : anchor(href, EVENT_LINK_STYLE, esc(row.event));
}

const ymd = (d: CalendarDate): number => d.year * 10000 + d.month * 100 + d.day;

/** The start, and the end when it is a real range (a different day). Null without a usable start. */
function dateSpan(
  field: DateField | undefined,
): { start: CalendarDate; end?: CalendarDate } | null {
  if (field === undefined || !isValidDate(field.start)) return null;
  const end = field.end;
  if (end !== undefined && isValidDate(end) && ymd(end) !== ymd(field.start)) {
    return { start: field.start, end };
  }
  return { start: field.start };
}

const upperNbsp = (d: CalendarDate): string => nbspText(formatDate(d).toUpperCase());

/**
 * The date above an event: a navy pill, "SUN FEB 1" (owner decision 2026-11-22, spec 6.1 Date
 * row). A range reads "SAT JAN 31 TO SUN FEB 1" and may wrap only around "TO"; a struck
 * (rescheduled) date is crossed out. Null when the row has no usable date.
 */
export function dateBlock(field: DateField | undefined): string | null {
  const span = dateSpan(field);
  if (span === null) return null;
  const words =
    span.end === undefined
      ? upperNbsp(span.start)
      : `${upperNbsp(span.start)} TO ${upperNbsp(span.end)}`;
  const text = field?.struck === true ? `<s>${words}</s>` : words;
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 6px 0;">' +
    `<tr><td bgcolor="${color.navy}" style="background-color:${color.navy};border-radius:${radius.control}px;padding:3px 10px;` +
    `font-family:${fontStack};font-size:12px;font-weight:700;letter-spacing:0.5px;color:${color.white};${span.end === undefined ? 'white-space:nowrap;' : ''}">` +
    `${text}</td></tr></table>`
  );
}

/** The lines inside a row cell. A row with a date is a date row; without one, a link row. */
export function rowBody(row: DateRow, onPanel: boolean): string {
  const tags = row.tags
    .filter((t) => t.text.trim() !== '')
    .map((t) => ` ${tag(t, onPanel)}`)
    .join('');
  const hasNote = !isEmptyRich(row.note);
  const date = dateBlock(row.date);
  if (date === null) {
    return lines(
      `${eventHtml(row)}${tags}`,
      hasNote &&
        `<p style="margin:2px 0 0 0;font-size:13px;color:${color.ink};">${richText(row.note)}</p>`,
    );
  }
  return lines(
    date,
    `<div>${eventHtml(row)}${tags}</div>`,
    hasNote &&
      `<p style="margin:4px 0 0 0;font-size:14px;color:${color.ink};">${richText(row.note)}</p>`,
  );
}

/**
 * A table of rows. Each row after the first has a top border in `separator`; `firstBorder` adds
 * one to the first row too (named plain sections).
 */
export function rowsTable(
  rows: DateRow[],
  options: {
    onPanel: boolean;
    separator: 'lavender' | 'white';
    firstBorder: boolean;
  },
): string {
  const cells = rows.map((row, i) => {
    const border =
      i > 0 || options.firstBorder ? `border-top:1px solid ${color[options.separator]};` : '';
    return lines(
      '  <tr>',
      `    <td style="padding:10px 0;${border}${CELL_TEXT}">`,
      indent(rowBody(row, options.onPanel), 6),
      '    </td>',
      '  </tr>',
    );
  });
  return lines(
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    ...cells,
    '</table>',
  );
}

export { lines };
