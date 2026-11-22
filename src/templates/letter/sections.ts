/**
 * The letter's sections after the feature story (build spec, section 8.2, sections 6 to 13).
 * Each function returns table rows, or an empty string when there is nothing to show.
 */
import { color, fontStack, radius } from '../../config/tokens';
import { formatDate, formatDateTime, isValidDate } from '../../core/dates';
import { emDashesToCommas } from '../../core/helpers/text';
import { LETTER_HEADINGS, type LetterForm } from '../../core/letter';
import { defaultSettings, isBareEmail, type PackSettings } from '../../core/settings';
import { anchor, esc, escAttr, isEmptyRich, lines, richText, safeUrl } from '../components';
import {
  BODY_TEXT,
  bodyText,
  leadHtml,
  linkHtml,
  linkStyle,
  panelTable,
  pill,
  row,
} from './layout';

const FONT = `font-family:${fontStack};`;

function heading(text: string, size: number, margin: string): string {
  return `<h2 style="margin:${margin};color:${color.navy};font-size:${size}px;font-weight:700;">${esc(text)}</h2>`;
}

/** The text then the link then a full stop, as in "Read the TAPinto story." */
function withLink(text: string, link: string): string {
  return link === '' ? text : `${text}${text === '' ? '' : ' '}${link}.`;
}

/* ---------- 6 Closing and high fives ---------- */

export function closingRows(c: LetterForm['closing']): string {
  if (!c.enabled) return '';
  const paragraphs = c.paragraphs.filter((p) => !isEmptyRich(p));
  const thanks = c.thanks.filter((p) => !isEmptyRich(p));
  const signer = [c.signer.trim(), c.signerRole.trim()].filter((p) => p !== '').join(', ');
  const inner = lines(
    heading(LETTER_HEADINGS.closing, 20, '0 0 8px 0'),
    ...paragraphs.map((p) => `<p style="margin:0 0 10px 0;">${richText(p)}</p>`),
    thanks.length > 0 &&
      lines(
        '<ul style="margin:0 0 0 22px;padding:0;">',
        ...thanks.map(
          (p, i) =>
            `  <li${i === thanks.length - 1 ? '' : ' style="margin-bottom:8px;"'}>${richText(p)}</li>`,
        ),
        '</ul>',
      ),
    c.closingLine.trim() !== '' && `<p style="margin:10px 0 0 0;">${esc(c.closingLine)}</p>`,
    signer !== '' && `<p style="margin:6px 0 0 0;font-weight:700;">${esc(signer)}</p>`,
  );
  const panel = panelTable(
    'lavender',
    `padding:20px;${FONT}color:${color.navy};font-size:16px;line-height:1.55;`,
    inner,
  );
  return row('28px 24px 0 24px', panel);
}

/* ---------- 7 Photo and story ask ---------- */

export function photoAskRows(a: LetterForm['photoAsk']): string {
  if (!a.enabled) return '';
  const link = linkHtml({ text: a.linkText, url: a.url }, 'light', 'font-style:italic;');
  const text = a.text.trim() === '' ? '' : esc(a.text.trim());
  const inner = withLink(text, link);
  if (inner === '') return '';
  return row('16px 24px 0 24px', `<p style="margin:0;font-style:italic;">${inner}</p>`, BODY_TEXT);
}

/* ---------- 8 Around the pack ---------- */

export function aroundRows(a: LetterForm['around']): string {
  if (!a.enabled) return '';
  const items = a.items
    .map((item) => {
      const lead = leadHtml(item.lead);
      const text = isEmptyRich(item.text) ? '' : richText(item.text);
      const body = `${lead}${lead !== '' && text !== '' ? ' ' : ''}${text}`;
      return withLink(body, linkHtml(item.link));
    })
    .filter((html) => html !== '');
  const inner = lines(
    heading(LETTER_HEADINGS.around, 20, '0 0 6px 0'),
    a.intro.trim() !== '' && `<p style="margin:0 0 10px 0;">${esc(a.intro)}</p>`,
    items.length > 0 &&
      lines(
        '<ul style="margin:0 0 0 22px;padding:0;">',
        ...items.map(
          (html, i) =>
            `  <li${i === items.length - 1 ? '' : ' style="margin-bottom:10px;"'}>${html}</li>`,
        ),
        '</ul>',
      ),
  );
  return row('28px 24px 0 24px', inner, BODY_TEXT);
}

/* ---------- 9 Coming up ---------- */

const PANEL_P = `color:${color.navy};font-size:16px;line-height:1.5;`;

/** Full-width button: VML for Outlook, a table for everything else. Empty without a usable link. */
function wideButton(text: string, url: string): string {
  const href = safeUrl(url);
  if (href === null || text.trim() === '') return '';
  const label = esc(text);
  const navy = color.navy;
  const style =
    `display:block;padding:14px 20px;color:${color.white};font-size:16px;font-weight:700;` +
    `line-height:20px;text-decoration:none;border-radius:${radius.control}px;`;
  return lines(
    '<!--[if mso]>',
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escAttr(href)}" style="height:48px;v-text-anchor:middle;width:512px;" arcsize="17%" stroke="f" fillcolor="${navy}">`,
    '  <w:anchorlock/>',
    `  <center style="color:${color.white};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>`,
    '</v:roundrect>',
    '<![endif]-->',
    '<!--[if !mso]><!-->',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    '  <tr>',
    `    <td align="center" bgcolor="${navy}" style="background-color:${navy};border-radius:${radius.control}px;mso-padding-alt:14px 20px;">`,
    `      ${anchor(href, style, label)}`,
    '    </td>',
    '  </tr>',
    '</table>',
    '<!--<![endif]-->',
  );
}

export function comingUpRows(c: LetterForm['comingUp']): string {
  const button = wideButton(c.button.text, c.button.url);
  const paragraphs: { top: string; html: string }[] = [];
  if (c.intro.trim() !== '') paragraphs.push({ top: '12px', html: esc(c.intro) });
  for (const item of c.items) {
    const label = isValidDate(item.date) ? formatDateTime(item.date, item.time) : null;
    const lead = label === null ? '' : `<strong>${esc(label)}:</strong>`;
    const text = isEmptyRich(item.text) ? '' : richText(item.text);
    const body = `${lead}${lead !== '' && text !== '' ? ' ' : ''}${text}`;
    const link = linkHtml(item.link);
    const html = `${body}${body !== '' && link !== '' ? ' ' : ''}${link}`;
    if (html !== '') paragraphs.push({ top: '10px', html });
  }
  if (!isEmptyRich(c.howToHelp)) {
    paragraphs.push({
      top: '10px',
      html: `<strong>How to help:</strong> ${richText(c.howToHelp)}`,
    });
  }
  const ps = paragraphs.map((p, i) => {
    const last = i === paragraphs.length - 1;
    const bottom = i === 0 && !last ? '4px' : last && button !== '' ? '16px' : '0';
    const top = i === 0 ? '12px' : p.top;
    return `<p style="margin:${top} 0 ${bottom} 0;${PANEL_P}">${p.html}</p>`;
  });
  const gap =
    paragraphs.length === 0 && button !== ''
      ? '<div style="height:12px;line-height:12px;font-size:1px;">&nbsp;</div>'
      : '';
  const inner = lines(pill([LETTER_HEADINGS.comingUp]), ...ps, gap, button);
  const panel = panelTable('goldPale', `padding:20px;${FONT}`, inner);
  return row('24px 24px 0 24px', panel);
}

/* ---------- 10 On the horizon ---------- */

export function horizonRows(
  h: LetterForm['horizon'],
  settings: PackSettings = defaultSettings(),
): string {
  if (!h.enabled) return '';
  const items = h.items
    .map((item) => {
      const label = isValidDate(item.date) ? formatDate(item.date) : null;
      const lead = label === null ? '' : `<strong>${esc(label)}:</strong>`;
      const text = item.text.trim() === '' ? '' : esc(item.text.trim());
      return `${lead}${lead !== '' && text !== '' ? ' ' : ''}${text}`;
    })
    .filter((html) => html !== '');
  const year = linkHtml({ text: h.yearLinkText, url: settings.yearAtAGlanceUrl });
  const inner = lines(
    heading(LETTER_HEADINGS.horizon, 20, '0 0 6px 0'),
    items.length > 0 &&
      lines(
        '<ul style="margin:0 0 0 22px;padding:0;">',
        ...items.map(
          (html, i) =>
            `  <li${i === items.length - 1 ? '' : ' style="margin-bottom:6px;"'}>${html}</li>`,
        ),
        '</ul>',
      ),
    year !== '' && `<p style="margin:${items.length > 0 ? '12px' : '0'} 0 0 0;">${year}</p>`,
  );
  return row('28px 24px 0 24px', inner, bodyText('1.5'));
}

/* ---------- 11 Feedback ---------- */

function encodeValue(text: string): string {
  return Array.from(emDashesToCommas(text).replace(/\r\n?/g, '\n'))
    .map((ch) => {
      try {
        return encodeURIComponent(ch);
      } catch {
        return '%EF%BF%BD';
      }
    })
    .join('');
}

/**
 * The mailto address for the feedback link, with subject and body percent-encoded (spec 7.3).
 * Returns '' when the feedback email setting is not a bare address, so the link is left out.
 */
export function feedbackHref(
  f: LetterForm['feedback'],
  email: string = defaultSettings().email.feedback,
): string {
  if (!isBareEmail(email)) return '';
  const query = [
    f.subject !== '' && `subject=${encodeValue(f.subject)}`,
    f.body !== '' && `body=${encodeValue(f.body)}`,
  ].filter((q): q is string => q !== false);
  return `mailto:${email}${query.length > 0 ? '?' + query.join('&') : ''}`;
}

const QUESTION_LEAD = 'Quick question:';

export function feedbackRows(
  f: LetterForm['feedback'],
  settings: PackSettings = defaultSettings(),
): string {
  const q = f.question.trim();
  const question = q.startsWith(QUESTION_LEAD)
    ? `<strong>${esc(QUESTION_LEAD)}</strong>${esc(q.slice(QUESTION_LEAD.length))}`
    : esc(q);
  const raw = feedbackHref(f, settings.email.feedback);
  const href = raw === '' ? null : safeUrl(raw);
  const link =
    href !== null && f.linkText.trim() !== ''
      ? anchor(href, linkStyle('light'), esc(f.linkText))
      : '';
  const inner = lines(
    question,
    link !== '' && `<br>${link}`,
    f.note.trim() !== '' &&
      `<p style="margin:4px 0 0 0;color:${color.muted};font-size:14px;">${esc(f.note)}</p>`,
  );
  if (inner === '') return '';
  const panel = panelTable(
    'greyPage',
    `padding:18px 20px;${FONT}color:${color.ink};font-size:16px;line-height:1.5;`,
    inner,
    ' align="center"',
  );
  return row('24px 24px 0 24px', panel);
}

/* ---------- 12 Sign-off and 13 Footer ---------- */

export function signOffRows(text: string): string {
  if (text.trim() === '') return '';
  return row(
    '20px 24px 0 24px',
    `<p style="margin:0;font-weight:700;">${esc(text)}</p>`,
    bodyText('1.5'),
  );
}

export function footerRows(settings: PackSettings = defaultSettings()): string {
  const links = settings.standingLinks
    .map((l) => linkHtml({ text: l.label, url: l.url }, 'navy'))
    .filter((html) => html !== '');
  const mail = settings.email.contact;
  const mailHref = isBareEmail(mail) ? safeUrl(`mailto:${mail}`) : null;
  const parts: string[] = [];
  if (links.length > 0) parts.push(`More from the pack: ${links.join(' &middot; ')}`);
  if (mailHref !== null)
    parts.push(`Questions or feedback: ${anchor(mailHref, linkStyle('navy'), esc(mail))}`);
  if (parts.length === 0) return '';
  const panel = panelTable(
    'navy',
    `padding:20px;${FONT}font-size:14px;line-height:1.6;color:${color.lavender};`,
    parts.join('\n<br>\n<br>'),
  );
  return row('24px', panel);
}
