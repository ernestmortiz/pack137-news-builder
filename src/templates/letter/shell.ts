/**
 * The letter's outer structure (build spec, sections 6 and 8.2): the hidden preview text, the
 * Outlook conditional comments around a fixed 600px wrapper, the grey page, the card and the
 * masthead. These are the monthly-only extras (1) and (2) from spec 6.
 */
import { packConfig } from '../../config/pack.config';
import { color, fontStack, maxEmailWidth, radius } from '../../config/tokens';
import { formatMonthYear, type MonthOfYear } from '../../core/dates';
import { esc, indent, lines, safeWebUrl, escAttr } from '../components';
import { row } from './layout';

/** Invisible filler so mail apps do not pull body text into the preview. */
const FILLER = Array.from({ length: 80 }, () => '&#847;&zwnj;').join(' ') + '&nbsp;';

/** The hidden preview-text div: the summary plus the read time, then the filler. First in the output. */
export function previewDiv(text: string): string {
  return (
    `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">` +
    `${esc(text)} ${FILLER}</div>`
  );
}

/** Outlook-only font rule. Sits inside a conditional comment, so no other client reads it. */
const MSO_FONTS = lines(
  '<!--[if mso]>',
  '<style>',
  '  body, table, td, a, h1, h2, h3, p, div, li { font-family: Arial, Helvetica, sans-serif !important; }',
  '  table { border-collapse: collapse; }',
  '</style>',
  '<![endif]-->',
);

/** Masthead: round logo, eyebrow, title and the month. */
export function mastheadRow(issue: MonthOfYear): string {
  const logo = safeWebUrl(packConfig.logoUrl);
  const logoCell =
    logo === null
      ? ''
      : `<td valign="middle" align="center" style="padding:16px 8px 16px 16px;width:110px;color:${color.lavender};font-family:${fontStack};font-size:12px;"><img src="${escAttr(logo)}" width="90" height="90" alt="${escAttr(`Cranford Cub Scouts ${packConfig.packName} logo`)}" style="display:block;width:90px;max-width:100%;height:90px;border-radius:50%;border:0;"></td>`;
  const textCell = lines(
    `<td valign="middle" style="padding:16px 20px 16px 8px;font-family:${fontStack};">`,
    `  <div style="color:${color.goldLight};font-size:11px;font-weight:700;letter-spacing:0.5px;">${esc(packConfig.eyebrow)}</div>`,
    `  <h1 style="margin:0;padding-top:4px;color:${color.white};font-size:22px;font-weight:700;line-height:1.3;">${esc(packConfig.monthlyTitle)}</h1>`,
    `  <div style="color:${color.lavender};font-size:13px;padding-top:4px;">${esc(formatMonthYear(issue))}</div>`,
    '</td>',
  );
  const table = lines(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${color.navyMasthead}" style="background-color:${color.navyMasthead};border-radius:${radius.panel}px;width:100%;border-collapse:separate;">`,
    '  <tr>',
    logoCell === '' ? '' : indent(logoCell, 4),
    indent(textCell, 4),
    '  </tr>',
    '</table>',
  );
  return row('24px 24px 8px 24px', table);
}

/** Wraps the card rows: preview text, Outlook font rule, grey page, 600px wrapper and card. */
export function letterShell(preview: string, rows: string): string {
  const card = lines(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:${maxEmailWidth}px;background-color:${color.white};border-radius:${radius.panel}px;margin:0 auto;border-collapse:separate;font-family:${fontStack};">`,
    indent(rows, 2),
    '</table>',
  );
  return (
    lines(
      previewDiv(preview),
      MSO_FONTS,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${color.greyPage}" style="background-color:${color.greyPage};width:100%;">`,
      '  <tr>',
      `    <td align="center" style="padding:24px 12px;">`,
      `      <!--[if mso]><table role="presentation" width="${maxEmailWidth}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`,
      indent(card, 6),
      '      <!--[if mso]></td></tr></table><![endif]-->',
      '    </td>',
      '  </tr>',
      '</table>',
    ) + '\n'
  );
}
