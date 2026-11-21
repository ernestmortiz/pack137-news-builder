/**
 * Tags helper (build spec, section 7.4). Words such as Virtual, In person and TBD at the end of a
 * row become quiet tags; RSVP and Rescheduled become strong tags.
 */
import type { Tag } from '../forms';

interface TagDef {
  pattern: string;
  tag: Tag;
}

const DEFS: TagDef[] = [
  { pattern: 'virtual', tag: { text: 'Virtual', strength: 'quiet' } },
  { pattern: 'in[- ]person', tag: { text: 'In person', strength: 'quiet' } },
  { pattern: 'tbd', tag: { text: 'TBD', strength: 'quiet' } },
  { pattern: '(?:please\\s+)?rsvp', tag: { text: 'Please RSVP', strength: 'strong' } },
  { pattern: 'rescheduled', tag: { text: 'Rescheduled', strength: 'strong' } },
];

export const RESCHEDULED: Tag = { text: 'Rescheduled', strength: 'strong' };

const either = (p: string) => `(?:\\(\\s*${p}\\s*\\)|${p})`;
const TRAILING = DEFS.map((d) => ({
  tag: d.tag,
  re: new RegExp(`(?:^|\\s)${either(d.pattern)}[!.]*\\s*$`, 'i'),
}));
/** At the start only strong tags count, and only when punctuation or the end follows. */
const LEADING = DEFS.filter((d) => d.tag.strength === 'strong').map((d) => ({
  tag: d.tag,
  re: new RegExp(`^\\s*(?:\\(\\s*${d.pattern}\\s*\\)[!.,:;]*|${d.pattern}(?:[!.,:;]+|\\s*$))`, 'i'),
}));

export interface TagTake {
  tags: Tag[];
  /** What is left is `text.slice(start, end)`. */
  start: number;
  end: number;
}

/** Adds a tag unless one with the same text is already there. Returns a new list. */
export function addTag(tags: Tag[], tag: Tag, atStart = false): Tag[] {
  if (tags.some((t) => t.text === tag.text)) return tags;
  return atStart ? [{ ...tag }, ...tags] : [...tags, { ...tag }];
}

/** Takes tag words off the end of a line, and strong tags off its start. */
export function takeTags(text: string): TagTake {
  let start = 0;
  let end = text.length;
  let leading: Tag[] = [];
  let trailing: Tag[] = [];

  for (let again = true; again;) {
    again = false;
    const rest = text.slice(start, end);
    for (const { tag, re } of TRAILING) {
      const m = re.exec(rest);
      if (m === null) continue;
      end = start + m.index;
      end -= /[\s,;:–-]*$/.exec(text.slice(start, end))?.[0].length ?? 0;
      trailing = addTag(trailing, tag, true);
      again = true;
      break;
    }
    if (again) continue;
    for (const { tag, re } of LEADING) {
      const m = re.exec(rest);
      if (m === null) continue;
      start += m[0].length;
      start += /^[\s,;:–-]*/.exec(text.slice(start, end))?.[0].length ?? 0;
      leading = addTag(leading, tag);
      again = true;
      break;
    }
  }
  if (start > end) start = end;
  let tags = leading;
  for (const tag of trailing) tags = addTag(tags, tag);
  return { tags, start, end };
}
