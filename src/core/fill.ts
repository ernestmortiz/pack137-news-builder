/**
 * Fill stage (build spec, sections 7.3 and 7.4): turns a parsed paste into an editable form for
 * the chosen layout, running the smart helpers on the way. Each helper fills a field and marks it
 * "check me" when unsure. None blocks the user.
 *
 * The exported types and signatures are the contract with the UI and are owned by the
 * orchestrator. The helpers live in `./helpers`, one small pure module each. Everything here is
 * pure: the parsed model and the forms passed in are never changed.
 */
import { packConfig } from '../config/pack.config';
import type { CalendarDate } from './dates';
import { findDate, matchLeadingDate } from './dates';
import type {
  AnnouncementForm,
  ButtonField,
  CallToActionForm,
  DateListForm,
  DateRow,
  DateSection,
  HelpWantedForm,
  ImageField,
  LinkItem,
  LinkListForm,
  MessageForm,
  RichText,
} from './forms';
import {
  dateLabel,
  readInlineDate,
  readLeadingDate,
  weekdayMismatchMessage,
} from './helpers/dates';
import { cleanOddRich, cleanOddText, oddCharactersMessage } from './helpers/odd-characters';
import { formFields, getAt, isRichText, setAt, type FormField } from './helpers/paths';
import { longAddressIn, shortLinkText } from './helpers/long-links';
import { contactNote, readContact } from './helpers/people';
import { firstSentenceEnd, sentenceAround } from './helpers/sentences';
import { looksLikeTitleCase, toSentenceCase as toHeadingCase } from './helpers/sentence-case';
import { isShouting, shoutStart, toSentenceCase } from './helpers/shouting';
import { smallFixes } from './helpers/small-fixes';
import { addTag, RESCHEDULED, takeTags } from './helpers/tags';
import {
  capitalize,
  isLinkOnly,
  joinLines,
  linksOf,
  plain,
  sentence,
  sliceRich,
  splitLines,
  squash,
  textOf,
  trimRich,
  trimSeparators,
} from './helpers/text';
import { sourceNote, stripSiteName } from './helpers/title-cleanup';
import { isManageLink, unlinkedServices } from './helpers/warnings';
import type { Block, Inline, Layout, ListBlock } from './model';
import type { ParseResult } from './pipeline';

/** A path to one field of a form, such as ['sections', 1, 'rows', 2, 'date']. */
export type FieldPath = (string | number)[];

export type CheckKind =
  /** The year of a date was inferred (spec 7.4, ADR 0003). The UI shows the year beside the field. */
  | 'year-assumed'
  /**
   * A weekday written in the paste is not the weekday of its date, as in "Mon 1/16/2027", which is
   * a Saturday. The form shows the right weekday; the date itself may be the mistake. One marker
   * for each end of a range whose weekday is wrong, on the row's date.
   */
  | 'weekday-mismatch'
  /** A struck date became a Rescheduled tag; the new date is still needed. */
  | 'rescheduled'
  /** All-caps or "!!" text was turned into sentence case and offered as a note. */
  | 'shouting'
  /** Trailing " - name" became "Contact: name". */
  | 'contact'
  /** A trailing " | Site Name" was removed from link text. */
  | 'title-cleanup'
  /** A link points at a TroopTrack /manage/ page that parents may not open. */
  | 'manage-link'
  /** A service such as SignUpGenius is mentioned with no link. */
  | 'service-no-link'
  /**
   * Odd characters were removed from this field: invisible ones, and bullets, ornaments or a
   * leading emoji (helpers/odd-characters.ts). No word is removed. One marker for a field; the
   * message lists each removed character once.
   */
  | 'odd-characters'
  /** A pasted link had no destination, or an image had no alt text (from the parse issues). */
  | 'pasted-problem'
  /**
   * A field the card needs is empty (label, title). The form hides the note as soon as the field
   * has text and shows it again if the text is cleared (owner report, 2026-11-23).
   */
  | 'missing'
  /** Any other guess the user should look at. */
  | 'unsure';

/** A "check me" marker on one field. */
export interface CheckMe {
  path: FieldPath;
  kind: CheckKind;
  /** One plain sentence a volunteer understands. No em dashes. */
  message: string;
}

/**
 * A small fix offered, not applied (spec 7.4): "&" to "and", "On going" to "Ongoing", doubled spaces.
 *
 * `path` leads to a plain text field, to a rich text field (the fix then covers every run of it),
 * or to the text of one run of a rich text field, as in ['paragraphs', 2, 5, 'text']. The last is
 * used for a fix that belongs to one link and must leave the same words elsewhere alone.
 */
export interface Suggestion {
  path: FieldPath;
  /** One plain sentence, such as 'Change "On going" to "Ongoing".' */
  message: string;
  from: string;
  to: string;
}

export interface FillOptions {
  today: CalendarDate;
  /** 1 = January. From pack.config.ts (spec 9). */
  programYearStartMonth: number;
}

export interface FillResult {
  form: AnnouncementForm;
  checks: CheckMe[];
  suggestions: Suggestion[];
}

/** A blank form for a layout, as used by "Start over" and by a layout with nothing to fill. */
export function emptyForm(layout: Layout): AnnouncementForm {
  switch (layout) {
    case 'message':
      return { layout, label: '', title: '', paragraphs: [] };
    case 'call-to-action':
      return { layout, label: '', title: '', paragraph: [], button: { text: '', url: '' } };
    case 'link-list':
      return { layout, label: '', title: '', intro: [], items: [] };
    case 'date-list':
      return { layout, label: '', title: '', sections: [] } satisfies DateListForm;
    case 'help-wanted':
      return {
        layout,
        label: '',
        title: '',
        intro: [],
        ask: { badge: 'Highest need', title: '', paragraphs: [], button: { text: '', url: '' } },
        outro: [],
      };
  }
}

/* ---------- reading the content model ---------- */

/** One line of pasted text: a heading, a paragraph or a list item. */
interface Unit {
  kind: 'heading' | 'para' | 'item';
  runs: Inline[];
}

function listUnits(list: ListBlock): Unit[] {
  return list.items.flatMap((item) => [
    { kind: 'item' as const, runs: item.runs },
    ...item.children.flatMap(listUnits),
  ]);
}

const LEADING_NUMBER = /^\s*(\d+)[.)]\s+/;

/**
 * "1. Den Meeting ..." with no "2." anywhere is not a list, so the "1." is dropped (owner report,
 * 2026-11-23). It is only dropped from the start of a line that begins a paragraph or item.
 */
function dropLoneNumber(units: Unit[]): Unit[] {
  const numbered = units.flatMap((u) =>
    splitLines(u.runs)
      .map((line) => LEADING_NUMBER.exec(textOf(line)))
      .filter((m) => m !== null),
  );
  if (numbered.length !== 1 || numbered[0]?.[1] !== '1') return units;
  return units.map((u) => {
    const m = LEADING_NUMBER.exec(textOf(u.runs));
    return m === null ? u : { kind: u.kind, runs: trimRich(sliceRich(u.runs, m[0].length)) };
  });
}

/** Every line of text in the model, in order. Lines with no visible text are left out. */
function unitsOf(blocks: Block[]): Unit[] {
  const units = blocks.flatMap((b): Unit[] => {
    if (b.type === 'heading') return [{ kind: 'heading', runs: b.runs }];
    if (b.type === 'paragraph') return [{ kind: 'para', runs: b.runs }];
    if (b.type === 'list') return listUnits(b);
    return [];
  });
  return dropLoneNumber(
    units
      .map((u) => ({ kind: u.kind, runs: trimRich(u.runs) }))
      .filter((u) => squash(textOf(u.runs)) !== ''),
  );
}

const lineText = (runs: Inline[]) => squash(textOf(runs));

/** A local "check me" note: the path is added once the field's place in the form is known. */
interface Note {
  field: string;
  kind: CheckKind;
  message: string;
}

/** Odd characters taken off a line before its field was known, for the field they ended up in. */
interface OddNote {
  path: FieldPath;
  removed: string[];
}

/** The line as the date reader should see it: without a pasted bullet or ornament in front. */
const withoutLead = (text: string) => cleanOddText(text, { leadOnly: true }).text;

const TITLE_MAX_LENGTH = 60;

/** True for a short line with no link, no date and no sentence ending: it reads as a title. */
function isShortLine(runs: Inline[], options: FillOptions): boolean {
  const text = lineText(runs);
  return (
    text !== '' &&
    text.length <= TITLE_MAX_LENGTH &&
    !/[.,:;]$/.test(text) &&
    linksOf(runs).length === 0 &&
    matchLeadingDate(withoutLead(text), options.today, options.programYearStartMonth) === null
  );
}

/**
 * The title: the first line when it is a heading, or when it is short and more text follows.
 * Returns the remaining lines.
 */
function takeTitle(units: Unit[], options: FillOptions): { title: string; rest: Unit[] } {
  const first = units[0];
  if (first === undefined) return { title: '', rest: units };
  if (first.kind === 'heading') return { title: lineText(first.runs), rest: units.slice(1) };
  if (first.kind !== 'para') return { title: '', rest: units };
  const lines = splitLines(first.runs);
  const head = lines[0];
  if (head === undefined || (lines.length === 1 && units.length === 1))
    return { title: '', rest: units };
  if (!isShortLine(head, options)) return { title: '', rest: units };
  const left = joinLines(lines.slice(1));
  return {
    title: lineText(head),
    rest: left.length > 0 ? [{ kind: 'para', runs: left }, ...units.slice(1)] : units.slice(1),
  };
}

/** A heading keeps its place in free text as a bold line. */
function unitRuns(unit: Unit): Inline[] {
  if (unit.kind !== 'heading') return unit.runs;
  return unit.runs.map((r) =>
    r.kind === 'text' && !r.marks.includes('strong')
      ? { ...r, marks: [...r.marks, 'strong' as const].sort() }
      : r,
  );
}

function linkButton(runs: Inline[]): ButtonField | undefined {
  const link = linksOf(runs)[0];
  return link === undefined ? undefined : { text: squash(link.text), url: link.href };
}

/* ---------- Date list ---------- */

interface BuiltRow {
  row: DateRow;
  notes: Note[];
  /** Odd characters already removed from the event name. */
  odd: string[];
}

/** Builds one Date list row from a line: date, event, link, tags and note (spec 7.4). */
function buildRow(runs: Inline[], options: FillOptions): BuiltRow {
  const notes: Note[] = [];
  /** Odd characters taken off the event name here. The caller reports them with the row. */
  const odd: string[] = [];
  const dated = readLeadingDate(runs, options) ?? readInlineDate(runs, options);
  const rest = dated === null ? trimRich(runs) : dated.rest;
  const text = textOf(rest);
  const link = linksOf(rest)[0];
  const row: DateRow = { event: '', url: '', tags: [], note: [] };

  if (dated !== null) {
    row.date = dated.date;
    if (dated.yearAssumed)
      notes.push({
        field: 'date',
        kind: 'year-assumed',
        message: `The year ${dated.date.start.year} was assumed for this date, so please check it.`,
      });
    for (const mismatch of dated.weekdayMismatches)
      notes.push({
        field: 'date',
        kind: 'weekday-mismatch',
        message: weekdayMismatchMessage(mismatch),
      });
    if (dated.date.struck === true) {
      row.tags = addTag(row.tags, RESCHEDULED);
      notes.push({
        field: 'date',
        kind: 'rescheduled',
        message: 'This date is crossed out, so please add the new date.',
      });
    }
  }

  // The event is the link text, or the whole line when there is no link. What follows it is
  // looked at for tags, a contact and shouting, and the rest becomes the note.
  let eventText: string;
  let afterStart: number;
  if (link !== undefined) {
    eventText = text.slice(0, link.end);
    afterStart = link.end;
    row.url = link.href;
  } else {
    const shout = shoutStart(text);
    afterStart = shout > 0 ? shout : text.length;
    eventText = text.slice(0, afterStart);
  }

  const eventTags = takeTags(eventText);
  // A leading arrow or bullet, as in "=> Sign up", is not part of the name. A symbol such as a
  // bullet character is taken off first and reported, so "(bullet) => Sign up" reads the same.
  const named = cleanOddText(squash(eventText.slice(eventTags.start, eventTags.end)));
  const event = named.text.replace(/^(?:[=-]+>|[>*])\s*/, '');
  if (event !== '') {
    row.event = event;
    for (const tag of eventTags.tags) row.tags = addTag(row.tags, tag);
    odd.push(...named.removed);
  } else {
    row.event = squash(eventText);
  }

  const after = text.slice(afterStart);
  const contact = dated === null && link !== undefined ? readContact(after) : null;
  if (contact !== null) {
    row.note = plain(contactNote(contact));
    notes.push({
      field: 'note',
      kind: 'contact',
      message: 'The name after the dash was read as the contact, so please check it.',
    });
  } else if (squash(after) !== '') {
    const afterTags = takeTags(after);
    for (const tag of afterTags.tags) row.tags = addTag(row.tags, tag);
    const noteRuns = trimRich(
      sliceRich(rest, afterStart + afterTags.start, afterStart + afterTags.end),
    );
    const head = noteRuns[0];
    if (head?.kind === 'text' && head.href === undefined)
      head.text = head.text.replace(/^[\s:;,–-]+/, '');
    const noteText = lineText(noteRuns);
    if (isShouting(noteText)) {
      row.note = plain(toSentenceCase(noteText));
      notes.push({
        field: 'note',
        kind: 'shouting',
        message: 'The capital letters were changed to normal writing, so please check the wording.',
      });
    } else if (/[\p{L}\p{N}]/u.test(noteText)) {
      row.note = trimRich(noteRuns);
    }
  }

  if (isShouting(row.event)) {
    row.event = toSentenceCase(row.event);
    notes.push({
      field: 'event',
      kind: 'shouting',
      message: 'The capital letters were changed to normal writing, so please check the wording.',
    });
  }
  return { row, notes, odd };
}

/** "Save the Date (details to come)" gives the name and a subtitle, which only a quiet panel shows. */
function newSection(heading: string): DateSection {
  const m = /^(.*\S)\s*\(([^()]+)\)$/.exec(heading);
  const sub = m?.[2]?.trim() ?? '';
  if (m?.[1] === undefined || sub === '')
    return { name: heading, style: 'plain', subtitle: '', rows: [] };
  return {
    name: m[1],
    style: 'quiet',
    subtitle: capitalize(sub) + (/[.!?]$/.test(sub) ? '' : '.'),
    rows: [],
  };
}

function fillDateList(
  units: Unit[],
  options: FillOptions,
  checks: CheckMe[],
  odd: OddNote[],
): DateListForm {
  const form: DateListForm = { layout: 'date-list', label: '', title: '', sections: [] };
  let rest = units;

  // The first heading is the title when it is the only heading, or when a section heading comes
  // straight after it. Otherwise every heading names a section and the title is left to the user.
  const headings = units.flatMap((u, i) => (u.kind === 'heading' ? [i] : []));
  if (headings[0] === 0 && (headings.length === 1 || headings[1] === 1)) {
    form.title = lineText((units[0] as Unit).runs);
    rest = units.slice(1);
  }

  let section: DateSection | undefined;
  const open = (): DateSection => {
    if (section === undefined) {
      section = { name: '', style: 'plain', subtitle: '', rows: [] };
      form.sections.push(section);
    }
    return section;
  };

  for (const unit of rest) {
    if (unit.kind === 'heading') {
      section = newSection(lineText(unit.runs));
      form.sections.push(section);
      continue;
    }
    let last: DateRow | undefined;
    for (const pasted of splitLines(unit.runs)) {
      // A pasted bullet or ornament in front would hide the date, so it is taken off first and
      // reported on the row's event name. A line of nothing else is left for the pass at the end.
      const lead = cleanOddRich(pasted, { leadOnly: true });
      const bare = lead.removed.length > 0 ? trimRich(lead.runs) : pasted;
      const cleaned = bare.length > 0 && bare !== pasted;
      const line = cleaned ? bare : pasted;
      const startsRow =
        last === undefined ||
        linksOf(line).length > 0 ||
        matchLeadingDate(textOf(line), options.today, options.programYearStartMonth) !== null;
      if (!startsRow && last !== undefined) {
        // A plain line under a row is that row's note. The note belongs to this row alone, so
        // the line is added in place: joining the whole note again for each line is slow.
        // The pasted line, not the cleaned one: the pass at the end cleans the note and reports it.
        if (last.note.length > 0) last.note.push({ kind: 'break' });
        for (const run of pasted) last.note.push(run);
        continue;
      }
      const target = open();
      const built = buildRow(line, options);
      const { row, notes } = built;
      const at = ['sections', form.sections.length - 1, 'rows', target.rows.length];
      target.rows.push(row);
      const removed = cleaned ? [...lead.removed, ...built.odd] : built.odd;
      if (removed.length > 0) odd.push({ path: [...at, 'event'], removed });
      for (const n of notes)
        checks.push({ path: [...at, n.field], kind: n.kind, message: n.message });
      last = row;
    }
  }
  return form;
}

/* ---------- Link list ---------- */

function fillLinkList(
  units: Unit[],
  image: ImageField | undefined,
  options: FillOptions,
  checks: CheckMe[],
): LinkListForm {
  const { title, rest } = takeTitle(units, options);
  const form: LinkListForm = { layout: 'link-list', label: '', title, intro: [], items: [] };
  if (image !== undefined) form.image = image;
  const intro: Inline[][] = [];

  for (const unit of rest) {
    const links = linksOf(unit.runs);
    const text = lineText(unit.runs);
    const first = links[0];
    if (first === undefined) {
      // Plain paragraphs are the intro. A heading or a list line keeps its place in the list.
      if (unit.kind === 'para') intro.push(unit.runs);
      else form.items.push({ text, url: '', note: '' });
      continue;
    }

    const raw = textOf(unit.runs);
    const linkLength = links.reduce((sum, l) => sum + squash(l.text).length, 0);
    let note: string;
    // Words leading into the link, as in "See our list of ...", only read well as a sentence.
    const before = squash(raw.slice(0, first.start));
    const leadIn =
      before.split(' ').length > 2 &&
      matchLeadingDate(before, options.today, options.programYearStartMonth) === null;
    const contact = links.length === 1 ? readContact(raw.slice(first.end)) : null;
    if (contact !== null && before === '') {
      note = contactNote(contact);
      checks.push({
        path: ['items', form.items.length, 'note'],
        kind: 'contact',
        message: 'The name after the dash was read as the contact, so please check it.',
      });
    } else if (linkLength * 2 >= text.length && !leadIn) {
      // Mostly link: the few words around it are the note.
      // Each link is replaced by a space. Built in one pass, left to right.
      let around = '';
      let from = 0;
      for (const l of links) {
        around += raw.slice(from, l.start) + ' ';
        from = l.end;
      }
      around += raw.slice(from);
      note = trimSeparators(squash(around));
      if (!/[\p{L}\p{N}]/u.test(note)) note = '';
    } else {
      // A sentence with a link in it: the whole sentence is the note.
      note = text;
    }

    links.forEach((link, i) => {
      const item: LinkItem = { text: squash(link.text), url: link.href, note: i === 0 ? note : '' };
      const cleaned = stripSiteName(item.text);
      if (cleaned !== null) {
        item.text = cleaned.text;
        checks.push({
          path: ['items', form.items.length, 'text'],
          kind: 'title-cleanup',
          message: `The site name "${cleaned.site}" was removed from the end of this link.`,
        });
      }
      if (item.note === '') item.note = sourceNote(item.url);
      form.items.push(item);
    });
  }
  form.intro = joinLines(intro);
  return form;
}

/* ---------- Message and Call to action ---------- */

/** Removes the first line that is only a link and returns it as a button. */
function takeButtonLine(units: Unit[]): { button?: ButtonField; rest: Unit[] } {
  for (const [i, unit] of units.entries()) {
    const lines = splitLines(unit.runs);
    const at = lines.findIndex(isLinkOnly);
    const line = lines[at];
    if (line === undefined) continue;
    const left = joinLines(lines.filter((_l, j) => j !== at));
    const rest = [...units.slice(0, i), ...units.slice(i + 1)];
    if (left.length > 0) rest.splice(i, 0, { kind: unit.kind, runs: left });
    const button = linkButton(line);
    return button === undefined ? { rest: units } : { button, rest };
  }
  return { rest: units };
}

function fillMessage(units: Unit[], options: FillOptions): MessageForm {
  const { title, rest } = takeTitle(units, options);
  const form: MessageForm = { layout: 'message', label: '', title, paragraphs: [] };
  const hrefs = new Set(rest.flatMap((u) => linksOf(u.runs).map((l) => l.href)));
  let body = rest;
  if (hrefs.size === 1) {
    const taken = takeButtonLine(rest);
    if (taken.button !== undefined) {
      form.button = taken.button;
      body = taken.rest;
    }
  }
  form.paragraphs = body.map(unitRuns);
  return form;
}

function fillCallToAction(units: Unit[], options: FillOptions): CallToActionForm {
  const { title, rest } = takeTitle(units, options);
  const taken = takeButtonLine(rest);
  // With no line that is only a link, the first link is the button and stays in the sentence.
  const button = taken.button ??
    rest.map((u) => linkButton(u.runs)).find((b) => b !== undefined) ?? { text: '', url: '' };
  let paragraph = joinLines(taken.rest.map(unitRuns));
  // The button already carries the paragraph's only link, so the words stay but the link goes:
  // the email would otherwise link the same page twice (owner report, 2026-11-23).
  const hrefs = new Set(linksOf(paragraph).map((l) => l.href));
  if (hrefs.size === 1 && hrefs.has(button.url)) {
    paragraph = paragraph.map((run) => {
      if (run.kind !== 'text' || run.href === undefined) return run;
      const words = { ...run };
      delete words.href;
      return words;
    });
  }
  return { layout: 'call-to-action', label: '', title, paragraph, button };
}

/* ---------- Help wanted ---------- */

const DEFAULT_BADGE = 'Highest need';
const BADGE_WORDS =
  /^(highest|high|greatest|biggest|top|most|urgent|immediate)\b.{0,20}\b(needs?|needed|priority|priorities|urgent)$|^urgent$/i;
const ASK_TITLE_MAX_LENGTH = 80;

interface Line {
  heading: boolean;
  runs: Inline[];
}

const isMailto = (href: string) => /^mailto:/i.test(href);

/** The line that holds the ask's button: an email link first, a line that is only a link first. */
function findButtonLine(lines: Line[]): number {
  const has = (test: (l: Line) => boolean) => lines.findIndex(test);
  const mail = (l: Line) => linksOf(l.runs).some((x) => isMailto(x.href));
  const order = [
    has((l) => isLinkOnly(l.runs) && mail(l)),
    has(mail),
    has((l) => isLinkOnly(l.runs)),
    has((l) => linksOf(l.runs).length > 0),
  ];
  return order.find((i) => i !== -1) ?? -1;
}

function fillHelpWanted(units: Unit[], options: FillOptions): HelpWantedForm {
  const form = emptyForm('help-wanted') as HelpWantedForm;
  let rest = units;
  const first = units[0];
  if (
    first !== undefined &&
    !(first.kind === 'heading' && BADGE_WORDS.test(lineText(first.runs)))
  ) {
    const taken = takeTitle(units, options);
    form.title = taken.title;
    rest = taken.rest;
  }

  // The intro runs up to the first heading or list. With neither, it is the first paragraph.
  let introEnd = rest.findIndex((u) => u.kind !== 'para');
  if (introEnd === -1) introEnd = Math.min(1, rest.length);
  form.intro = joinLines(rest.slice(0, introEnd).map((u) => u.runs));

  let lines: Line[] = rest
    .slice(introEnd)
    .flatMap((u) => splitLines(u.runs).map((runs) => ({ heading: u.kind === 'heading', runs })));

  const at = findButtonLine(lines);
  const buttonLine = lines[at];
  if (buttonLine === undefined) {
    // No link after the intro: the intro's email link, or its first link, is the button.
    const links = linksOf(form.intro);
    const link = links.find((l) => isMailto(l.href)) ?? links[0];
    if (link !== undefined) form.ask.button = { text: squash(link.text), url: link.href };
  } else {
    const links = linksOf(buttonLine.runs);
    const link = links.find((l) => isMailto(l.href)) ?? (links[0] as (typeof links)[number]);
    form.ask.button = { text: squash(link.text), url: link.href };

    // The next line with another link is the secondary button. It and what follows are the outro.
    const next = lines.findIndex(
      (l, i) => i > at && linksOf(l.runs).some((x) => x.href !== link.href),
    );
    const nextLine = lines[next];
    if (nextLine !== undefined) {
      const other = linksOf(nextLine.runs).find((x) => x.href !== link.href);
      if (other !== undefined) form.secondary = { text: squash(other.text), url: other.href };
      const outro = lines.slice(isLinkOnly(nextLine.runs) ? next + 1 : next);
      form.outro = joinLines(outro.map((l) => l.runs));
      lines = lines.slice(0, next);
    }
    if (isLinkOnly(buttonLine.runs)) lines = lines.filter((l) => l !== buttonLine);
  }

  const badge = lines.findIndex((l) => l.heading && BADGE_WORDS.test(lineText(l.runs)));
  const badgeLine = lines[badge];
  if (badgeLine !== undefined) {
    form.ask.badge = capitalize(lineText(badgeLine.runs).toLowerCase());
    lines = lines.filter((l) => l !== badgeLine);
  }

  // The ask's title: a heading, or a short first line that is all bold.
  const head = lines[0];
  if (head !== undefined) {
    const text = lineText(head.runs);
    const allBold = head.runs.every((r) => r.kind !== 'text' || r.marks.includes('strong'));
    const short = text.length <= ASK_TITLE_MAX_LENGTH && linksOf(head.runs).length === 0;
    if (head.heading || (allBold && short && lines.length > 1)) {
      form.ask.title = text;
      lines = lines.slice(1);
    }
  }
  form.ask.paragraphs = lines.map((l) =>
    l.heading ? unitRuns({ kind: 'heading', runs: l.runs }) : l.runs,
  );
  return form;
}

/* ---------- checks and suggestions that read the finished form ---------- */

/** The field that holds the main text of a form, for a problem that has no field of its own. */
function mainField(form: AnnouncementForm): FieldPath {
  switch (form.layout) {
    case 'message':
      return ['paragraphs'];
    case 'call-to-action':
      return ['paragraph'];
    case 'date-list':
      return ['sections'];
    case 'link-list':
    case 'help-wanted':
      return ['intro'];
  }
}

/** The texts of a field: the one string, or the text of each run. */
const textsOf = (f: FormField): string[] =>
  f.kind === 'rich' ? f.value.flatMap((r) => (r.kind === 'text' ? [r.text] : [])) : [f.value];

/**
 * The headings and buttons of a form (spec 6: "Sentence case for headings and buttons"): the
 * title, each Date list section name, the Help wanted ask title and the text of every button.
 * Labels, event names, link text and paragraphs are not headings.
 */
function headingFields(form: AnnouncementForm): { path: FieldPath; value: string }[] {
  const out: { path: FieldPath; value: string }[] = [{ path: ['title'], value: form.title }];
  switch (form.layout) {
    case 'message':
      if (form.button !== undefined)
        out.push({ path: ['button', 'text'], value: form.button.text });
      break;
    case 'call-to-action':
      out.push({ path: ['button', 'text'], value: form.button.text });
      break;
    case 'date-list':
      form.sections.forEach((section, i) =>
        out.push({ path: ['sections', i, 'name'], value: section.name }),
      );
      break;
    case 'link-list':
      break;
    case 'help-wanted':
      out.push({ path: ['ask', 'title'], value: form.ask.title });
      if (form.ask.button !== undefined)
        out.push({ path: ['ask', 'button', 'text'], value: form.ask.button.text });
      if (form.secondary !== undefined)
        out.push({ path: ['secondary', 'text'], value: form.secondary.text });
      break;
  }
  return out;
}

const longLinkMessage = (host: string) =>
  `Show this long link as "${host}"? The full address stays behind the link.`;

/** The words shown for the link in `url`, when an object holds a link as words plus an address. */
const LINK_TEXT_KEYS = ['text', 'event'] as const;

/**
 * Long bare links (helpers/long-links.ts): every link whose words are its own long address, with
 * the host name to show instead. A link in rich text is one run, and the path leads to that run's
 * text so the same address elsewhere in the paragraph is left alone. A button, a link item and a
 * date row hold the words beside `url`; there the address may follow words the tool joined to it
 * ("Sign up here: https://..."), and only the address is replaced. Read in the order of the form.
 */
function longLinks(value: unknown, path: FieldPath, out: Suggestion[]): void {
  if (isRichText(value)) {
    value.forEach((run, i) => {
      if (run.kind !== 'text' || run.href === undefined) return;
      const to = shortLinkText(run.text, run.href);
      if (to !== undefined)
        out.push({
          path: [...path, i, 'text'],
          message: longLinkMessage(to),
          from: run.text.trim(),
          to,
        });
    });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => longLinks(v, [...path, i], out));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const fields = value as Record<string, unknown>;
  const url = fields.url;
  for (const [key, v] of Object.entries(fields)) {
    if (typeof v !== 'string') {
      longLinks(v, [...path, key], out);
      continue;
    }
    if (typeof url !== 'string' || !LINK_TEXT_KEYS.some((k) => k === key)) continue;
    const found = longAddressIn(v, url);
    if (found !== undefined)
      out.push({ path: [...path, key], message: longLinkMessage(found.to), ...found });
  }
}

/**
 * Every suggestion for the form as it is now: the small fixes ("&" to "and", "On going" to
 * "Ongoing", doubled spaces) for each text field, then sentence case for each heading and button
 * (spec 6) that is written in Title Case, then shorter words for each long bare link.
 * Suggestions are offered and never applied by the tool. Call this again after an edit:
 * a suggestion made before the edit may no longer fit, and applySuggestion then changes nothing.
 * Pure: the form is not changed.
 */
export function suggestionsFor(form: AnnouncementForm): Suggestion[] {
  const suggestions: Suggestion[] = [];
  for (const f of formFields(form)) {
    if (f.kind === 'url') continue;
    const seen = new Set<string>();
    for (const text of textsOf(f))
      for (const fix of smallFixes(text)) {
        if (seen.has(fix.from)) continue;
        seen.add(fix.from);
        suggestions.push({ path: f.path, message: fix.message, from: fix.from, to: fix.to });
      }
  }
  for (const { path, value } of headingFields(form)) {
    if (value.trim() === '') continue;
    const to = toHeadingCase(value, packConfig.properNouns);
    // Only for Title Case. A lower case word shows the writer's capitals are names (owner rule).
    if (to !== value && looksLikeTitleCase(value, packConfig.properNouns))
      suggestions.push({ path, message: `Use sentence case: "${to.trim()}".`, from: value, to });
  }
  longLinks(form, [], suggestions);
  return suggestions.map((s) => ({ ...s, message: sentence(s.message) }));
}

function reviewForm(form: AnnouncementForm): CheckMe[] {
  const checks: CheckMe[] = [];
  const fields = formFields(form);

  const urls: string[] = [];
  for (const f of fields) {
    if (f.kind === 'url') urls.push(f.value);
    if (f.kind === 'rich')
      for (const run of f.value)
        if (run.kind === 'text' && run.href !== undefined) urls.push(run.href);
  }

  const manage: CheckMe['message'] =
    'This link opens a TroopTrack page for leaders, so parents may not be able to open it.';
  for (const f of fields) {
    if (f.kind === 'url') {
      if (isManageLink(f.value))
        checks.push({ path: f.path, kind: 'manage-link', message: manage });
      continue;
    }
    if (f.kind === 'rich') {
      const hasManage = f.value.some(
        (r) => r.kind === 'text' && r.href !== undefined && isManageLink(r.href),
      );
      if (hasManage) checks.push({ path: f.path, kind: 'manage-link', message: manage });
    }
    for (const name of unlinkedServices(textsOf(f).join(''), urls))
      checks.push({
        path: f.path,
        kind: 'service-no-link',
        message: `${name} is mentioned here, but there is no link to it.`,
      });
  }
  return checks;
}

/**
 * Removes the odd characters (helpers/odd-characters.ts) from every text field of a freshly filled
 * form, in place, and returns one check for each field that lost any. Words are never removed.
 * `early` holds what was already taken off a line before its field was known. Links are not text
 * and are left alone.
 */
function cleanOddCharacters(form: AnnouncementForm, early: OddNote[]): CheckMe[] {
  const waiting = new Map<string, string[]>();
  for (const note of early) {
    const key = JSON.stringify(note.path);
    const known = waiting.get(key);
    if (known === undefined) waiting.set(key, [...note.removed]);
    else for (const r of note.removed) known.push(r);
  }

  // In the order of the form's fields, so the checks read from the top of the form down.
  const checks: CheckMe[] = [];
  for (const f of formFields(form)) {
    if (f.kind === 'url') continue;
    const cleaned = f.kind === 'rich' ? cleanOddRich(f.value) : cleanOddText(f.value);
    const before = waiting.size > 0 ? waiting.get(JSON.stringify(f.path)) : undefined;
    if (cleaned.removed.length === 0 && before === undefined) continue;
    if (cleaned.removed.length > 0) {
      const key = f.path[f.path.length - 1];
      const parent = getAt(form, f.path.slice(0, -1));
      if (key === undefined || typeof parent !== 'object' || parent === null) continue;
      (parent as Record<string | number, unknown>)[key] =
        'runs' in cleaned ? cleaned.runs : cleaned.text;
    }
    checks.push({
      path: f.path,
      kind: 'odd-characters',
      message: oddCharactersMessage([...(before ?? []), ...cleaned.removed]),
    });
  }
  return checks;
}

/**
 * Builds a form for the chosen layout from a parsed paste and runs the smart helpers (spec 7.4).
 * Works for any of the five layouts, since the user may pick one other than the suggestion.
 * Nothing pasted is silently dropped: text with no field of its own goes to the closest free-text
 * field, and a picture the layout cannot show is reported.
 */
export function fillForm(parsed: ParseResult, layout: Layout, options: FillOptions): FillResult {
  const { blocks } = parsed.model;
  const units = unitsOf(blocks);
  const images = blocks.flatMap((b) => (b.type === 'image' ? [b] : []));
  const picture = images[0];
  const built: CheckMe[] = [];
  const odd: OddNote[] = [];

  let form: AnnouncementForm;
  switch (layout) {
    case 'message':
      form = fillMessage(units, options);
      break;
    case 'call-to-action':
      form = fillCallToAction(units, options);
      break;
    case 'link-list':
      form = fillLinkList(
        units,
        picture === undefined ? undefined : { src: picture.src, alt: picture.alt },
        options,
        built,
      );
      break;
    case 'date-list':
      form = fillDateList(units, options, built, odd);
      break;
    case 'help-wanted':
      form = fillHelpWanted(units, options);
      break;
  }
  // A deep copy, so the form shares nothing with the parsed model.
  form = structuredClone(form);
  const oddChecks = cleanOddCharacters(form, odd);

  const checks: CheckMe[] = [];
  if (form.label.trim() === '')
    checks.push({
      path: ['label'],
      kind: 'missing',
      message: 'Add a short label for the top of the card.',
    });
  if (form.title.trim() === '')
    checks.push({
      path: ['title'],
      kind: 'missing',
      message: 'Add a title for this announcement.',
    });
  // One at a time: a spread of a very long list overflows the call stack.
  for (const check of built) checks.push(check);
  for (const check of oddChecks) checks.push(check);

  if (form.layout === 'link-list' && form.image !== undefined && form.image.alt.trim() === '')
    checks.push({
      path: ['image', 'alt'],
      kind: 'pasted-problem',
      message: 'The picture needs a short description for people who cannot see it.',
    });
  const shown = form.layout === 'link-list' ? 1 : 0;
  if (images.length > shown)
    checks.push({
      path: mainField(form),
      kind: 'unsure',
      message:
        shown === 0
          ? 'This layout has no place for the pasted picture, so it was left out.'
          : 'This layout shows one picture, so the other pasted pictures were left out.',
    });
  if (parsed.issues.some((issue) => issue.code === 'link-no-destination'))
    checks.push({
      path: mainField(form),
      kind: 'pasted-problem',
      message: 'A pasted link had no destination, so its words were kept as plain text.',
    });

  for (const check of reviewForm(form)) checks.push(check);
  return {
    form,
    checks: checks.map((c) => ({ ...c, message: sentence(c.message) })),
    suggestions: suggestionsFor(form),
  };
}

/* ---------- switching layout ---------- */

/** One piece of a form's content, in reading order, in a shape every layout can take. */
type Entry =
  | { kind: 'text'; runs: RichText }
  | { kind: 'heading'; text: string }
  | { kind: 'row'; row: DateRow }
  | { kind: 'button'; button: ButtonField };

const hasText = (runs: RichText) => lineText(runs) !== '';
const isBlankButton = (b: ButtonField | undefined): b is undefined =>
  b === undefined || (b.text.trim() === '' && b.url.trim() === '');

function entriesOf(form: AnnouncementForm): Entry[] {
  const out: Entry[] = [];
  const text = (runs: RichText) => {
    if (hasText(runs)) out.push({ kind: 'text', runs });
  };
  const heading = (value: string) => {
    if (value.trim() !== '') out.push({ kind: 'heading', text: value });
  };
  const button = (b: ButtonField | undefined) => {
    if (!isBlankButton(b)) out.push({ kind: 'button', button: b });
  };

  switch (form.layout) {
    case 'message':
      form.paragraphs.forEach(text);
      button(form.button);
      break;
    case 'call-to-action':
      text(form.paragraph);
      button(form.button);
      break;
    case 'link-list':
      text(form.intro);
      for (const item of form.items)
        if (item.text.trim() !== '' || item.url.trim() !== '' || item.note.trim() !== '')
          out.push({
            kind: 'row',
            row: { event: item.text, url: item.url, tags: [], note: plain(item.note) },
          });
      break;
    case 'date-list':
      for (const section of form.sections) {
        heading(section.name);
        text(plain(section.subtitle));
        for (const row of section.rows) out.push({ kind: 'row', row });
      }
      break;
    case 'help-wanted':
      text(form.intro);
      // The default pill text is not content. A pill the user typed is.
      if (form.ask.badge.trim() !== DEFAULT_BADGE) text(plain(form.ask.badge.trim()));
      heading(form.ask.title);
      form.ask.paragraphs.forEach(text);
      button(form.ask.button);
      text(form.outro);
      button(form.secondary);
      break;
  }
  return out;
}

/** A row as one line of text: "Sat Nov 21 Event (Virtual)", then the note on the next line. */
function rowToRich(row: DateRow): RichText {
  const head: Inline[] = [];
  const date = dateLabel(row.date);
  if (date !== '') {
    head.push({ kind: 'text', text: date, marks: row.date?.struck === true ? ['strike'] : [] });
    if (row.event.trim() !== '') head.push(...plain(' '));
  }
  if (row.event.trim() !== '') {
    const event: Inline = { kind: 'text', text: row.event, marks: [] };
    if (row.url.trim() !== '') event.href = row.url;
    head.push(event);
  } else if (row.url.trim() !== '') {
    head.push({ kind: 'text', text: row.url, marks: [], href: row.url });
  }
  const tags = row.tags.map((t) => t.text.trim()).filter((t) => t !== '');
  if (tags.length > 0) head.push(...plain(` (${tags.join(', ')})`));
  return joinLines([head, row.note]);
}

/** A button as a line of text: a link, or plain words when it has no destination. */
function buttonToRich(button: ButtonField): RichText {
  const text = button.text.trim() === '' ? button.url : button.text;
  const run: Inline = { kind: 'text', text, marks: [] };
  if (button.url.trim() !== '') run.href = button.url;
  return [run];
}

const headingToRich = (text: string): RichText => plain(text, ['strong']);

/** A line of text as a Date list row. A second and later link are kept in the note. */
function richToRow(runs: RichText): DateRow {
  const links = linksOf(runs);
  const row: DateRow = { event: lineText(runs), url: links[0]?.href ?? '', tags: [], note: [] };
  if (links.length > 1) {
    row.url = '';
    row.note = links.flatMap((link, i): Inline[] => [
      ...(i > 0 ? plain(', ') : []),
      { kind: 'text', text: squash(link.text), marks: [], href: link.href },
    ]);
  }
  return row;
}

const buttonToRow = (button: ButtonField): DateRow => ({
  event: button.text.trim() === '' ? button.url : button.text,
  url: button.url,
  tags: [],
  note: [],
});

function entryToRich(entry: Entry): RichText {
  switch (entry.kind) {
    case 'text':
      return entry.runs;
    case 'heading':
      return headingToRich(entry.text);
    case 'row':
      return rowToRich(entry.row);
    case 'button':
      return buttonToRich(entry.button);
  }
}

function rowToItem(row: DateRow): LinkItem {
  const parts = [dateLabel(row.date), ...row.tags.map((t) => t.text.trim()), lineText(row.note)];
  return { text: row.event, url: row.url, note: parts.filter((p) => p !== '').join(', ') };
}

/* ---------- Date list from prose (owner request, 2026-11-22) ---------- */

/** An event name longer than this many words keeps its first sentence; the rest is the note. */
const EVENT_MAX_WORDS = 12;
/**
 * A sentence without the date the row now shows: "Scout Sunday on February 8th, 10am-11am."
 * becomes "Scout Sunday, 10am-11am." A leading "on", "this" or "next" goes with the date.
 */
function withoutDate(sentenceText: string, at: number, raw: string): string {
  const before = sentenceText.slice(0, at).replace(/\s*\b(?:on|this|next)\s*$/i, '');
  const after = sentenceText.slice(at + raw.length);
  const joined = squash(`${before} ${after}`)
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,;:–-]+/, '')
    .replace(/,([.!?])$/, '$1');
  return capitalize(joined);
}

/**
 * The event without the button's words when they end it: "Den Meeting - 6:15pm - Fun On The Run"
 * with a "Fun On The Run" button becomes "Den Meeting - 6:15pm", since the button goes under the
 * row as a link (held fix from 1.1.1, owner 2026-11-23). Left whole when nothing else would remain.
 */
function withoutTrailingWords(event: string, words: string): string {
  const tail = squash(words);
  const text = squash(event);
  if (tail === '' || !text.toLowerCase().endsWith(tail.toLowerCase())) return event;
  const rest = text.slice(0, text.length - tail.length);
  if (!/(^|[\s:;,–-])$/.test(rest)) return event;
  const trimmed = rest.replace(/[\s:;,–-]+$/, '');
  return trimmed === '' ? event : trimmed;
}

/** The first written date in a line (findDate reads short windows, so a huge paste stays quick). */
function dateInLine(text: string, options: FillOptions) {
  return findDate(text, options.today, options.programYearStartMonth);
}

/** Two pieces of rich text as one, with a line break between them when both have text. */
function appendNote(row: DateRow, runs: RichText): void {
  const add = trimRich(runs);
  if (lineText(add) === '') return;
  if (row.note.length > 0) row.note.push({ kind: 'break' });
  row.note.push(...add);
}

/**
 * A row for a line of prose that holds a written date: the date, the sentence it is in as the
 * event (without the date), and the rest of the line as the note, links and all. The event is
 * never a link, so a long sentence is not one big underlined block; the link stays in the note.
 */
function proseRow(line: RichText, options: FillOptions): DateRow | null {
  const text = textOf(line);
  const found = dateInLine(text, options);
  if (found === null) return null;
  const { start, end } = sentenceAround(text, found.index);
  const event = withoutDate(text.slice(start, end), found.index - start, found.raw);
  const note = trimRich([...sliceRich(line, 0, start), ...plain(' '), ...sliceRich(line, end)]);
  const date: DateRow['date'] = { start: found.start };
  if (found.end !== undefined) date.end = found.end;
  return { date, event, url: '', tags: [], note: lineText(note) === '' ? [] : note };
}

/** A line with no date as a row. A long one keeps its first sentence as the event name. */
function undatedRow(line: RichText): DateRow {
  const text = textOf(line);
  const words = squash(text).split(' ').length;
  if (words <= EVENT_MAX_WORDS || isLinkOnly(line)) return richToRow(line);
  const cut = firstSentenceEnd(text);
  return {
    event: squash(text.slice(0, cut)),
    url: '',
    tags: [],
    note: trimRich(sliceRich(line, cut)),
  };
}

const sameDay = (a: DateRow, b: DateRow): boolean =>
  a.date !== undefined &&
  b.date !== undefined &&
  a.date.start.year === b.date.start.year &&
  a.date.start.month === b.date.start.month &&
  a.date.start.day === b.date.start.day;

const dayNumber = (row: DateRow): number => {
  const d = row.date?.start;
  return d === undefined ? 0 : d.year * 10_000 + d.month * 100 + d.day;
};

/**
 * Date list from any form, reading dates written in the text (owner request, 2026-11-22). With
 * today's date known: the title's date becomes a row (the title stays as written), each line with
 * a written date becomes a row, a line without one becomes the note of the row before it, and the
 * rows of a section are sorted by date when every row has one. Nothing is dropped: only the date
 * words move, into the row's date.
 */
function dateListFromProse(
  card: { label: string; title: string },
  entries: Entry[],
  options: FillOptions,
): DateListForm {
  const form: DateListForm = { layout: 'date-list', ...card, sections: [] };
  let section: DateSection | undefined;
  let last: DateRow | undefined;
  const add = (row: DateRow) => {
    if (section === undefined) {
      section = { name: '', style: 'plain', subtitle: '', rows: [] };
      form.sections.push(section);
    }
    section.rows.push(row);
    if (row.date !== undefined) last = row;
  };
  const known = (row: DateRow) => form.sections.some((s) => s.rows.some((r) => sameDay(r, row)));

  const titleRow = proseRow(plain(card.title), options);
  if (titleRow !== null) {
    titleRow.note = [];
    add(titleRow);
  }

  for (const e of entries) {
    if (e.kind === 'heading') {
      section = { name: e.text, style: 'plain', subtitle: '', rows: [] };
      form.sections.push(section);
      last = undefined;
    } else if (e.kind === 'row') add(e.row);
    else if (e.kind === 'button') {
      // A button goes under the event before it. When that note already has the same link, as
      // when Call to action made a button of the paragraph's link, nothing is added twice.
      if (last === undefined) add(buttonToRow(e.button));
      else if (!linksOf(last.note).some((l) => l.href === e.button.url)) {
        last.event = withoutTrailingWords(last.event, e.button.text);
        appendNote(last, buttonToRich(e.button));
      }
    } else {
      for (const line of splitLines(e.runs)) {
        if (lineText(line) === '') continue;
        if (readLeadingDate(line, options) !== null) {
          add(buildRow(line, options).row);
          continue;
        }
        const row = proseRow(line, options);
        if (row !== null && !known(row)) add(row);
        else if (last !== undefined) appendNote(last, line);
        else add(undatedRow(line));
      }
    }
  }

  for (const s of form.sections)
    if (s.rows.length > 1 && s.rows.every((r) => r.date !== undefined))
      s.rows = s.rows
        .map((row, i) => ({ row, i }))
        .sort((a, b) => dayNumber(a.row) - dayNumber(b.row) || a.i - b.i)
        .map(({ row }) => row);
  return form;
}

function buildFrom(
  layout: Layout,
  source: AnnouncementForm,
  entries: Entry[],
  options?: FillOptions,
): AnnouncementForm {
  const card = { label: source.label, title: source.title };
  const buttons = entries.flatMap((e) => (e.kind === 'button' ? [e.button] : []));

  switch (layout) {
    case 'message': {
      const form: MessageForm = { layout, ...card, paragraphs: [] };
      // One button stays a button. Several become links in the text, in their place.
      const only = buttons.length === 1 ? buttons[0] : undefined;
      if (only !== undefined) form.button = only;
      form.paragraphs = entries
        .filter((e) => only === undefined || e.kind !== 'button')
        .map(entryToRich);
      return form;
    }
    case 'call-to-action': {
      const first = buttons[0];
      const rest = entries.filter((e) => e.kind !== 'button' || e.button !== first);
      return {
        layout,
        ...card,
        paragraph: joinLines(rest.map(entryToRich)),
        button: first ?? { text: '', url: '' },
      };
    }
    case 'link-list': {
      const form: LinkListForm = { layout, ...card, intro: [], items: [] };
      const intro: RichText[] = [];
      for (const e of entries) {
        if (e.kind === 'text') intro.push(e.runs);
        else if (e.kind === 'heading') form.items.push({ text: e.text, url: '', note: '' });
        else if (e.kind === 'row') form.items.push(rowToItem(e.row));
        else form.items.push(rowToItem(buttonToRow(e.button)));
      }
      form.intro = joinLines(intro);
      return form;
    }
    case 'date-list': {
      if (options !== undefined) return dateListFromProse(card, entries, options);
      const form: DateListForm = { layout, ...card, sections: [] };
      let section: DateSection | undefined;
      const add = (row: DateRow) => {
        if (section === undefined) {
          section = { name: '', style: 'plain', subtitle: '', rows: [] };
          form.sections.push(section);
        }
        section.rows.push(row);
      };
      for (const e of entries) {
        if (e.kind === 'heading') {
          section = { name: e.text, style: 'plain', subtitle: '', rows: [] };
          form.sections.push(section);
        } else if (e.kind === 'row') add(e.row);
        else if (e.kind === 'text') add(richToRow(e.runs));
        else add(buttonToRow(e.button));
      }
      return form;
    }
    case 'help-wanted': {
      const form = { ...(emptyForm('help-wanted') as HelpWantedForm), ...card };
      const [main, second] = buttons;
      if (main !== undefined) form.ask.button = main;
      if (second !== undefined) form.secondary = second;
      let introDone = false;
      let titleDone = false;
      for (const [i, e] of entries.entries()) {
        if (e.kind === 'button' && (e.button === main || e.button === second)) continue;
        if (e.kind === 'text' && !introDone && i === 0) {
          form.intro = e.runs;
          introDone = true;
        } else if (e.kind === 'heading' && !titleDone) {
          form.ask.title = e.text;
          titleDone = true;
        } else {
          form.ask.paragraphs.push(entryToRich(e));
        }
      }
      return form;
    }
  }
}

/**
 * Converts a form to another layout, carrying over every piece of content the target layout has a
 * field for (spec 7.2: switching layout never loses content). The UI also keeps the last form of
 * each layout the user visited, so switching back restores their edits exactly.
 *
 * Text, links, rows and buttons always find a place: a row becomes a line of text or a link item,
 * a paragraph becomes a row, a spare button becomes a link. Only Link list has a field for a
 * picture. Pure: the form passed in is never changed and the result shares nothing with it.
 *
 * With `options` (today's date), Date list reads dates written inside the text: see
 * dateListFromProse. Without them it keeps the plain rule, one row per line.
 */
export function switchLayout(
  form: AnnouncementForm,
  layout: Layout,
  options?: FillOptions,
): AnnouncementForm {
  if (form.layout === layout) return form;
  const next = buildFrom(layout, form, entriesOf(form), options);
  return structuredClone(next);
}

/**
 * Applies one suggestion: replaces `from` with `to` in the plain text or rich text at `path`.
 * A path to the text of one run, such as ['paragraphs', 2, 5, 'text'], changes that run only.
 * Returns a new form. When the text no longer holds `from`, the form is returned unchanged.
 */
export function applySuggestion(form: AnnouncementForm, suggestion: Suggestion): AnnouncementForm {
  const { path, from, to } = suggestion;
  if (from === '' || path.length === 0) return form;
  const value = getAt(form, path);
  if (typeof value === 'string') {
    return value.includes(from) ? setAt(form, path, value.split(from).join(to)) : form;
  }
  if (isRichText(value)) {
    if (!value.some((run) => run.kind === 'text' && run.text.includes(from))) return form;
    const next = value.map((run) =>
      run.kind === 'text' ? { ...run, text: run.text.split(from).join(to) } : run,
    );
    return setAt(form, path, next);
  }
  return form;
}
