/**
 * Feature story (build spec, section 8.2 section 5): the title and the four block kinds.
 */
import { color, fontStack, radius } from '../../config/tokens';
import type { ContributorPart, LeadItem, StoryBlock } from '../../core/letter';
import { esc, indent, isEmptyRich, lines, richText } from '../components';
import {
  CARD_INNER,
  BODY_TEXT,
  caption,
  leadHtml,
  panelTable,
  isPhotoSpot,
  photoImg,
  photoSpot,
  pill,
  row,
} from './layout';

function leadItem(item: LeadItem): string {
  const lead = leadHtml(item.lead);
  const text = richText(item.text);
  return `${lead}${lead !== '' && text !== '' ? ' ' : ''}${text}`;
}

function part(p: ContributorPart): string {
  if (p.kind === 'paragraph') {
    return isEmptyRich(p.text) ? '' : `<p style="margin:12px 0 0 0;">${richText(p.text)}</p>`;
  }
  const items = p.items.map(leadItem).filter((html) => html !== '');
  if (items.length === 0) return '';
  return lines(
    '<ul style="margin:10px 0 0 22px;padding:0;">',
    ...items.map(
      (html, i) =>
        `  <li${i === items.length - 1 ? '' : ' style="margin-bottom:6px;"'}>${html}</li>`,
    ),
    '</ul>',
  );
}

function contributor(block: Extract<StoryBlock, { kind: 'contributor' }>, top: number): string {
  const badge = pill([block.name, block.role]);
  const parts = block.parts.map(part).filter((html) => html !== '');
  if (badge === '' && parts.length === 0) return '';
  return row(`${top}px 24px 0 24px`, lines(badge, ...parts), BODY_TEXT);
}

function photoBlock(block: Extract<StoryBlock, { kind: 'photo' }>, top: number): string {
  const wrapper = isPhotoSpot(block.photo)
    ? photoSpot(block.photo)
    : `<p style="margin:0;color:${color.muted};font-size:13px;font-weight:700;">${photoImg(block.photo, CARD_INNER)}</p>`;
  return row(`${top}px 24px 0 24px`, lines(wrapper, caption(block.photo.caption)));
}

function statsBlock(block: Extract<StoryBlock, { kind: 'stats' }>, top: number): string {
  const shown = block.stats.filter((s) => s.value.trim() !== '' || s.text.trim() !== '');
  if (shown.length === 0) return '';
  const width = Math.floor(100 / shown.length);
  const cells = shown.map((s) =>
    lines(
      `<td valign="top" style="padding:16px 20px;width:${width}%;">`,
      s.value.trim() === ''
        ? ''
        : `  <div style="color:${color.gold};font-size:26px;font-weight:700;line-height:1.2;">${esc(s.value)}</div>`,
      s.text.trim() === ''
        ? ''
        : `  <div style="color:${color.lavender};font-size:13px;line-height:1.4;">${esc(s.text)}</div>`,
      '</td>',
    ),
  );
  const table = lines(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${color.navy}" style="background-color:${color.navy};border-radius:${radius.panel}px;width:100%;border-collapse:separate;">`,
    '  <tr>',
    indent(cells.join('\n'), 4),
    '  </tr>',
    '</table>',
  );
  return row(`${top}px 24px 0 24px`, table, `font-family:${fontStack};`);
}

function sidebarBlock(block: Extract<StoryBlock, { kind: 'sidebar' }>, top: number): string {
  const body = block.body.filter((p) => !isEmptyRich(p));
  const img =
    block.photo === undefined
      ? ''
      : isPhotoSpot(block.photo)
        ? photoSpot(block.photo)
        : photoImg(block.photo, CARD_INNER - 40);
  const photoCaption =
    block.photo === undefined || img === '' || block.photo.caption.trim() === ''
      ? ''
      : `<p style="margin:6px 0 0 0;font-size:13px;font-style:italic;">${esc(block.photo.caption)}</p>`;
  const hasTitle = block.title.trim() !== '';
  const hasSource = block.source.trim() !== '';
  if (!hasTitle && !hasSource && body.length === 0 && img === '') return '';
  const paragraphs = body.map((p, i) => {
    const last = i === body.length - 1;
    const bottom = last ? (img === '' ? '0' : '12px') : '10px';
    return `<p style="margin:0 0 ${bottom} 0;">${richText(p)}</p>`;
  });
  const inner = lines(
    hasTitle &&
      `<p style="margin:0 0 6px 0;color:${color.navy};font-size:17px;font-weight:700;">${esc(block.title)}</p>`,
    hasSource &&
      `<p style="margin:0 0 8px 0;font-size:13px;font-style:italic;">${esc(block.source)}</p>`,
    ...paragraphs,
    img,
    photoCaption,
  );
  const panel = panelTable(
    'goldPale',
    `padding:18px 20px;font-family:${fontStack};color:${color.navy};font-size:15px;line-height:1.6;`,
    inner,
  );
  return row(`${top}px 24px 0 24px`, panel);
}

/** The story title row, then one row per block, in order. */
export function storyRows(story: { title: string; blocks: StoryBlock[] }): string {
  const hasTitle = story.title.trim() !== '';
  let first = true;
  const blocks = story.blocks.map((block) => {
    let html: string;
    if (block.kind === 'contributor') html = contributor(block, first ? (hasTitle ? 10 : 0) : 28);
    else if (block.kind === 'photo') html = photoBlock(block, first && hasTitle ? 14 : 18);
    else if (block.kind === 'stats') html = statsBlock(block, first && hasTitle ? 14 : 20);
    else html = sidebarBlock(block, first && hasTitle ? 14 : 20);
    if (html !== '') first = false;
    return html;
  });
  const title = hasTitle
    ? row(
        '28px 24px 0 24px',
        `<h2 style="margin:0;color:${color.navy};font-size:22px;font-weight:700;">${esc(story.title)}</h2>`,
        BODY_TEXT,
      )
    : '';
  return lines(title, ...blocks);
}
