/**
 * Fill stage (build spec, sections 7.3 and 7.4): turns a parsed paste into an editable form for
 * the chosen layout, running the smart helpers on the way. Each helper fills a field and marks it
 * "check me" when unsure. None blocks the user.
 *
 * Contract owned by the orchestrator (Phase 3). The bodies below are a minimal stand-in so the UI
 * can be built in parallel; parser-engineer replaces them with the real fill and helpers.
 */
import type { CalendarDate } from './dates';
import type { AnnouncementForm, DateListForm, RichText } from './forms';
import type { Block, Inline, Layout } from './model';
import type { ParseResult } from './pipeline';

/** A path to one field of a form, such as ['sections', 1, 'rows', 2, 'date']. */
export type FieldPath = (string | number)[];

export type CheckKind =
  /** The year of a date was inferred (spec 7.4, ADR 0003). The UI shows the year beside the field. */
  | 'year-assumed'
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
  /** A pasted link had no destination, or an image had no alt text (from the parse issues). */
  | 'pasted-problem'
  /** Any other guess the user should look at. */
  | 'unsure';

/** A "check me" marker on one field. */
export interface CheckMe {
  path: FieldPath;
  kind: CheckKind;
  /** One plain sentence a volunteer understands. No em dashes. */
  message: string;
}

/** A small fix offered, not applied (spec 7.4): "&" to "and", "On going" to "Ongoing", doubled spaces. */
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

function blockRuns(block: Block): Inline[][] {
  if (block.type === 'paragraph' || block.type === 'heading') return [block.runs];
  if (block.type === 'list') return block.items.map((i) => i.runs);
  return [];
}

/** Stand-in: puts every line of text into paragraphs. Replaced in Phase 3 by parser-engineer. */
export function fillForm(parsed: ParseResult, layout: Layout, options: FillOptions): FillResult {
  void options;
  const lines: RichText[] = parsed.model.blocks.flatMap(blockRuns);
  const form = emptyForm(layout);
  if (form.layout === 'message') form.paragraphs = lines;
  else if (form.layout === 'call-to-action') form.paragraph = lines[0] ?? [];
  else if (form.layout === 'link-list' || form.layout === 'help-wanted')
    form.intro = lines[0] ?? [];
  return { form, checks: [], suggestions: [] };
}

/**
 * Converts a form to another layout, carrying over every piece of content the target layout has a
 * field for (spec 7.2: switching layout never loses content). The UI also keeps the last form of
 * each layout the user visited, so switching back restores their edits exactly.
 * Stand-in: carries the label and title only. Replaced in Phase 3 by parser-engineer.
 */
export function switchLayout(form: AnnouncementForm, layout: Layout): AnnouncementForm {
  if (form.layout === layout) return form;
  return { ...emptyForm(layout), label: form.label, title: form.title } as AnnouncementForm;
}

/** Applies one suggestion: replaces `from` with `to` in the text at `path`. Returns a new form. */
export function applySuggestion(form: AnnouncementForm, suggestion: Suggestion): AnnouncementForm {
  void suggestion;
  return form;
}
