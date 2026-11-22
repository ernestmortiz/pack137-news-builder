/**
 * Shared pieces for the monthly letter templates (build spec, sections 6 and 8.2): row cells, the
 * link styles, photos and the badge. Text and URL safety come from ../components.
 */
import { color, fontStack, radius } from '../../config/tokens';
import type { LinkField, PhotoField } from '../../core/letter';
import { anchor, esc, escAttr, indent, lines, safeUrl, safeWebUrl } from '../components';

/** Inner width of the card: 600 less 24px side padding on each side. */
export const CARD_INNER = 552;

/** Text style of a body row. */
export function bodyText(lineHeight = '1.6', fg: string = color.ink, size = 16): string {
  return `font-family:${fontStack};color:${fg};font-size:${size}px;line-height:${lineHeight};`;
}

export const BODY_TEXT = bodyText();

/** A card row: one `<tr><td>` with the given padding and extra style. */
export function row(padding: string, inner: string, extraStyle = ''): string {
  return lines(
    '<tr>',
    `  <td style="padding:${padding};${extraStyle}">`,
    indent(inner, 4),
    '  </td>',
    '</tr>',
  );
}

/** A panel row: a full-width table with a colored, rounded cell. */
export function panelTable(
  bg: 'goldPale' | 'lavender' | 'greyPage' | 'navy',
  cellStyle: string,
  inner: string,
  cellAttrs = '',
): string {
  const hex = color[bg];
  return lines(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${hex}" style="background-color:${hex};border-radius:${radius.panel}px;width:100%;border-collapse:separate;">`,
    '  <tr>',
    `    <td${cellAttrs} style="${cellStyle}">`,
    indent(inner, 6),
    '    </td>',
    '  </tr>',
    '</table>',
  );
}

const LINK = `font-weight:700;text-decoration:underline;`;

/** Link style on a light background (navy) or on the navy footer (gold-light). */
export function linkStyle(on: 'light' | 'navy', extra = ''): string {
  return `color:${on === 'light' ? color.navy : color.goldLight};${LINK}${extra}`;
}

/** The link, or an empty string when the text is empty or the address is not usable. */
export function linkHtml(field: LinkField, on: 'light' | 'navy' = 'light', extra = ''): string {
  if (field.text.trim() === '') return '';
  const href = safeUrl(field.url);
  return href === null ? '' : anchor(href, linkStyle(on, extra), esc(field.text));
}

/** "Lead:" in bold. The colon is added unless the lead already ends with one. Empty lead gives nothing. */
export function leadHtml(lead: string): string {
  const text = lead.trim();
  if (text === '') return '';
  return `<strong>${esc(text.endsWith(':') ? text : text + ':')}</strong>`;
}

/** A date such as "Sun Dec 6, 8:00 pm" in bold with a colon, or nothing when the date is invalid. */
export function boldLabel(label: string | null): string {
  return label === null ? '' : `<strong>${esc(label)}:</strong>`;
}

/** The pill in front of a contributor or the Coming up panel. */
export function pill(parts: string[]): string {
  const text = parts
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => esc(p.toUpperCase()))
    .join(' &middot; ');
  if (text === '') return '';
  const hex = color.navy;
  return lines(
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    '  <tr>',
    `    <td bgcolor="${hex}" style="background-color:${hex};border-radius:${radius.control}px;padding:4px 10px;">`,
    `      <span style="color:${color.white};font-family:${fontStack};font-size:12px;font-weight:700;letter-spacing:0.5px;">${text}</span>`,
    '    </td>',
    '  </tr>',
    '</table>',
  );
}

/**
 * Whole pixels from 40 to `max`; no width, or one that is not a number, is `max`. Nothing narrower
 * than 40 is drawn: it could not be seen and would only serve to track who opens the letter.
 */
export function photoWidth(width: number | undefined, max: number): number {
  if (width === undefined || !Number.isFinite(width)) return max;
  return Math.min(max, Math.max(40, Math.round(width)));
}

/**
 * The photo, or an empty string without a usable web address. An empty alt is kept as alt="".
 * `margin` is an optional CSS margin for photos inside a panel.
 */
export function photoImg(photo: PhotoField, max: number, margin = ''): string {
  const src = safeWebUrl(photo.src);
  if (src === null) return '';
  const w = photoWidth(photo.width, max);
  return (
    `<img src="${escAttr(src)}" width="${w}" alt="${escAttr(photo.alt.trim())}" ` +
    `style="display:block;width:100%;max-width:${w}px;height:auto;border:0;${margin === '' ? '' : `margin:${margin};`}">`
  );
}

/** The italic muted caption under a photo. */
export function caption(text: string): string {
  if (text.trim() === '') return '';
  return `<p style="margin:6px 0 0 0;color:${color.muted};font-size:13px;font-style:italic;line-height:1.5;">${esc(text)}</p>`;
}
