/**
 * Announcement forms (build spec, section 7.2). A form is what the user edits and what the renderer
 * reads: `renderAnnouncement(form)` turns one of these into email-safe HTML. Phase 3 fills a form
 * from the parsed content model; Phase 2 only renders.
 *
 * Rich text reuses the content model's inline runs, so a paragraph can keep bold words and links.
 * Plain strings are used where the approved outputs never carry formatting.
 */
import type { CalendarDate } from './dates';
import type { Inline } from './model';

/** One line of formatted text: runs of text (with marks and an optional link) and line breaks. */
export type RichText = Inline[];

/** A button. It is left out of the output when `url` is not an absolute https, http or mailto URL. */
export interface ButtonField {
  text: string;
  url: string;
}

/** A small pill after an event name. Quiet: Virtual, In person, TBD. Strong: Please RSVP, Rescheduled. */
export interface Tag {
  text: string;
  strength: 'quiet' | 'strong';
}

/** A date or a date range, shown as "Sat Nov 21" or "Sat Feb 27 to Sun Feb 28". */
export interface DateField {
  start: CalendarDate;
  end?: CalendarDate;
  /** Struck through: the event moved. Usually paired with a strong "Rescheduled" tag. */
  struck?: boolean;
}

/**
 * One row of a Date list section. With a date it is a date row (date above the event). Without a
 * date it is a link row (the event as a link, a small note under it), as in Ongoing and References.
 * An empty or invalid `url` shows the event as plain text.
 */
export interface DateRow {
  date?: DateField;
  event: string;
  url: string;
  tags: Tag[];
  /** Date rows: a 14px note line. Link rows: a 13px source or contact line. Empty means none. */
  note: RichText;
}

/**
 * A Date list section. `plain` sits on the card; `highlight` (gold-pale) and `quiet` (lavender) are
 * panels. The name shows as a section heading (plain), a strong pill (highlight) or a panel heading
 * (quiet). An empty name shows nothing.
 */
export interface DateSection {
  name: string;
  style: 'plain' | 'highlight' | 'quiet';
  /** Quiet panels only: a small line under the panel heading, such as "Details to come." */
  subtitle: string;
  rows: DateRow[];
}

/** One link in a Link list. */
export interface LinkItem {
  text: string;
  url: string;
  /** Source or contact line under the link. Empty means none. */
  note: string;
}

/** An image with required alt text. Shown 80px wide above the text in a Link list. */
export interface ImageField {
  src: string;
  alt: string;
}

/** The highlighted ask in Help wanted: a strong pill, a title, paragraphs and a button. */
export interface HelpAsk {
  /** Pill text, "Highest need" by default. */
  badge: string;
  title: string;
  paragraphs: RichText[];
  button: ButtonField;
}

interface CardFields {
  /** Gold pill at the top of the card. */
  label: string;
  /** White title on navy under the label. */
  title: string;
}

export interface MessageForm extends CardFields {
  layout: 'message';
  paragraphs: RichText[];
  button?: ButtonField;
}

export interface CallToActionForm extends CardFields {
  layout: 'call-to-action';
  paragraph: RichText;
  button: ButtonField;
}

export interface LinkListForm extends CardFields {
  layout: 'link-list';
  image?: ImageField;
  intro: RichText;
  items: LinkItem[];
}

export interface DateListForm extends CardFields {
  layout: 'date-list';
  sections: DateSection[];
}

export interface HelpWantedForm extends CardFields {
  layout: 'help-wanted';
  intro: RichText;
  ask: HelpAsk;
  /** The line before the secondary button, such as "Not your area? ..." Empty means none. */
  outro: RichText;
  secondary?: ButtonField;
}

export type AnnouncementForm =
  MessageForm | CallToActionForm | LinkListForm | DateListForm | HelpWantedForm;
