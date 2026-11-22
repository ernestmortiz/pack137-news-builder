/**
 * Classify stage (build spec, section 7.3). Suggests one of the five layouts from the content
 * model. The suggestion is only a default; the user can switch layout at any time.
 */
import { matchLeadingDate } from './dates';
import { cleanOddText } from './helpers/odd-characters';
import type { Block, ContentModel, Inline, Layout } from './model';

export interface Classification {
  layout: Layout;
  /** One plain sentence the UI can show beside the layout picker. */
  reason: string;
}

/** Any fixed date works: only recognition matters, not the year. */
const ANY_DAY = { year: 2001, month: 1, day: 1 };
/** "Short paragraph" for Call to action, counted across all text outside the link. */
const CTA_MAX_WORDS = 60;
/** Share of an entry's text that must be link text for it to count as a link entry. */
const LINK_SHARE = 0.5;

const HELP_WORDS = /\b(help|helpers?|volunteers?|volunteering|need|needs|needed)\b/i;

function textOf(runs: Inline[]): string {
  return runs.map((r) => (r.kind === 'text' ? r.text : ' ')).join('');
}

function linkTextOf(runs: Inline[]): string {
  return runs.map((r) => (r.kind === 'text' && r.href !== undefined ? r.text : '')).join('');
}

/** List items at every level, or the paragraphs when there is no list. */
function entries(blocks: Block[]): Inline[][] {
  const items = blocks.flatMap((b) =>
    b.type === 'list'
      ? b.items.flatMap((i) => [i.runs, ...i.children.flatMap((c) => c.items.map((ci) => ci.runs))])
      : [],
  );
  if (items.length > 0) return items;
  return blocks.flatMap((b) => (b.type === 'paragraph' ? [b.runs] : []));
}

function allRuns(blocks: Block[]): Inline[] {
  return blocks.flatMap((b) => {
    if (b.type === 'paragraph' || b.type === 'heading') return b.runs;
    if (b.type === 'list')
      return b.items.flatMap((i) => [
        ...i.runs,
        ...i.children.flatMap((c) => c.items.flatMap((ci) => ci.runs)),
      ]);
    return [];
  });
}

function mostly(list: Inline[][], test: (runs: Inline[]) => boolean): boolean {
  return list.length >= 2 && list.filter(test).length * 2 > list.length;
}

/** A leading bullet or ornament (spec 7.4 odd characters) does not hide the date behind it. */
const startsWithDate = (runs: Inline[]) =>
  matchLeadingDate(
    cleanOddText(textOf(runs).trimStart(), { leadOnly: true }).text.trimStart(),
    ANY_DAY,
    9,
  ) !== null;

function isLinkEntry(runs: Inline[]): boolean {
  const all = textOf(runs).trim().length;
  return all > 0 && linkTextOf(runs).trim().length / all >= LINK_SHARE;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function classify(model: ContentModel): Classification {
  const { blocks } = model;
  const list = entries(blocks);

  if (mostly(list, startsWithDate))
    return { layout: 'date-list', reason: 'Most lines start with a date.' };

  if (mostly(list, isLinkEntry))
    return { layout: 'link-list', reason: 'Most lines are links to read.' };

  const runs = allRuns(blocks);
  const hrefs = new Set(
    runs.flatMap((r) => (r.kind === 'text' && r.href !== undefined ? [r.href] : [])),
  );
  for (const b of blocks) if (b.type === 'image' && b.href !== undefined) hrefs.add(b.href);
  const text = textOf(runs);

  if ([...hrefs].some((h) => h.toLowerCase().startsWith('mailto:')) && HELP_WORDS.test(text))
    return {
      layout: 'help-wanted',
      reason: 'It asks for help and has an email link.',
    };

  const nonLinkText = runs
    .map((r) => (r.kind === 'text' && r.href === undefined ? r.text : ' '))
    .join('');
  if (hrefs.size === 1 && wordCount(nonLinkText) <= CTA_MAX_WORDS)
    return { layout: 'call-to-action', reason: 'It is a short note with one link.' };

  return { layout: 'message', reason: 'It reads as a short note.' };
}
