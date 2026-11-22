/**
 * Canonical components (build spec, section 6.1). Each function is pure: values in, an HTML string
 * out. Strings are joined by concatenation only, never by String.replace with a replacement string,
 * so user text such as "$&" comes out literally (ADR 0004, Renderer item 3).
 */
import { color, fontStack, radius, space } from '../config/tokens';
import { formatDate, formatRange, isValidDate } from '../core/dates';
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

/** A link. Everything but mailto opens in a new tab with a safe rel. `href` must be from safeUrl. */
export function anchor(href: string, style: string, inner: string): string {
  const attrs = /^mailto:/i.test(href) ? '' : ' target="_blank" rel="noopener noreferrer"';
  return `<a href="${escAttr(href)}"${attrs} style="${style}">${inner}</a>`;
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

/** The gold label pill on navy, or the strong pill in a highlight panel. */
export function badge(text: string, tone: 'gold' | 'navy'): string {
  const bg = tone === 'gold' ? color.gold : color.navy;
  const fg = tone === 'gold' ? color.navy : color.goldLight;
  return (
    `<span style="${PILL_BASE}background-color:${bg};color:${fg};font-size:11px;font-weight:700;` +
    `letter-spacing:1px;text-transform:uppercase;padding:4px 10px;border-radius:${radius.control}px;">` +
    `${esc(text)}</span>`
  );
}

/** A small tag after an event name. Quiet tags use white inside a colored panel. */
export function tag(t: Tag, onPanel: boolean): string {
  const quietBg = onPanel ? color.white : color.lavender;
  const bg = t.strength === 'strong' ? color.navy : quietBg;
  const fg = t.strength === 'strong' ? color.goldLight : color.navy;
  return (
    `<span style="${PILL_BASE}background-color:${bg};color:${fg};font-size:11px;font-weight:700;` +
    `text-transform:uppercase;padding:2px 8px;border-radius:${radius.control}px;">${esc(t.text)}</span>`
  );
}

/* ---------- blocks ---------- */

/** A button table, or an empty string when the URL or the text is unusable. */
export function button(field: ButtonField | undefined, variant: 'primary' | 'secondary'): string {
  if (field === undefined || field.text.trim() === '') return '';
  const href = safeUrl(field.url);
  if (href === null) return '';
  const bg = variant === 'primary' ? color.navy : color.lavender;
  const fg = variant === 'primary' ? color.white : color.navy;
  const style =
    `display:inline-block;padding:13px 22px;color:${fg};font-size:16px;font-weight:700;` +
    `line-height:18px;text-decoration:none;border-radius:${radius.control}px;`;
  return lines(
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0">',
    '  <tr>',
    `    <td style="background-color:${bg};border-radius:${radius.control}px;mso-padding-alt:13px 22px;">`,
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
  return (
    `<img src="${escAttr(src)}" width="80" alt="${escAttr(field.alt.trim())}" ` +
    `style="display:block;width:80px;max-width:100%;height:auto;border:0;margin:0 0 12px 0;">`
  );
}

/** Section heading inside a card. */
export function sectionHeading(name: string): string {
  return `<div style="color:${color.navy};font-size:17px;font-weight:700;padding:20px 0 4px 0;">${esc(name)}</div>`;
}

/** A 20px gap, used before a panel that follows other content. */
export function spacer(): string {
  return '<div style="height:20px;line-height:20px;font-size:1px;">&nbsp;</div>';
}

/** A full-width highlight or quiet panel holding `inner`. */
export function panel(bg: 'goldPale' | 'lavender', inner: string): string {
  return lines(
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">',
    '  <tr>',
    `    <td style="background-color:${color[bg]};border-radius:${radius.panel}px;padding:${space.panel}px;">`,
    indent(inner, 6),
    '    </td>',
    '  </tr>',
    '</table>',
  );
}

/** The card shell: navy header with the label pill and title, then the body cell. */
export function cardShell(label: string, title: string, body: string): string {
  const header = lines(
    label.trim() !== '' && badge(label, 'gold'),
    title.trim() !== '' &&
      `<div style="color:${color.white};font-size:20px;font-weight:700;line-height:1.3;padding-top:8px;">${esc(title)}</div>`,
  );
  return lines(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;border-collapse:separate;background-color:${color.white};border:1px solid ${color.lavender};border-radius:${radius.panel}px;font-family:${fontStack};">`,
    '  <tr>',
    `    <td style="background-color:${color.navy};border-radius:${radius.panel}px ${radius.panel}px 0 0;padding:${space.card}px;">`,
    indent(header, 6),
    '    </td>',
    '  </tr>',
    '  <tr>',
    `    <td style="padding:14px;color:${color.ink};font-size:15px;line-height:1.5;">`,
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

/** The lines inside a row cell. A row with a date is a date row; without one, a link row. */
export function rowBody(row: DateRow, onPanel: boolean): string {
  const tags = row.tags
    .filter((t) => t.text.trim() !== '')
    .map((t) => ` ${tag(t, onPanel)}`)
    .join('');
  const hasNote = !isEmptyRich(row.note);
  const date = dateText(row.date);
  if (date === null) {
    return lines(
      `${eventHtml(row)}${tags}`,
      hasNote &&
        `<div style="font-size:13px;color:${color.ink};padding-top:2px;">${richText(row.note)}</div>`,
    );
  }
  const shown = row.date?.struck === true ? `<s>${esc(date)}</s>` : esc(date);
  return lines(
    `<div style="font-size:13px;font-weight:700;color:${color.navy};padding-bottom:2px;">${shown}</div>`,
    `<div>${eventHtml(row)}${tags}</div>`,
    hasNote &&
      `<div style="font-size:14px;color:${color.ink};padding-top:4px;">${richText(row.note)}</div>`,
  );
}

/**
 * A table of rows. Each row after the first has a top border in `separator`; `firstBorder` adds
 * one to the first row too (named plain sections).
 */
export function rowsTable(
  rows: DateRow[],
  options: { onPanel: boolean; separator: 'lavender' | 'white'; firstBorder: boolean },
): string {
  const cells = rows.map((row, i) => {
    const border =
      i > 0 || options.firstBorder ? `border-top:1px solid ${color[options.separator]};` : '';
    return lines(
      '  <tr>',
      `    <td style="padding:10px 0;${border}">`,
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
