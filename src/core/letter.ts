/**
 * Monthly letter (build spec, section 8). The editor fills a LetterForm; `renderLetter(letter)`
 * turns it into the "Pack 137 Stories" email. Unlike the Announcement Converter there is no paste:
 * the user types into fixed sections, and last month's issue comes back through a draft file
 * (Phase 5).
 *
 * Contract owned by the orchestrator (Phase 4). Section order is fixed by spec 8.2; optional
 * sections carry `enabled`. Standing links, emails and the logo come from pack.config.ts at
 * render time and are not stored in the letter.
 */
import { packConfig } from '../config/pack.config';
import type { CalendarDate, MonthOfYear, TimeOfDay } from './dates';
import type { ButtonField, RichText } from './forms';
import { defaultSettings, type PackSettings } from './settings';

/** A link the user types: shown text and address. Left out of the output when the address is not usable. */
export interface LinkField {
  text: string;
  url: string;
}

/** A photo: TroopTrack hosts the image, so the tool takes its address (spec 8.2 Rules). */
export interface PhotoField {
  src: string;
  /** Required, and must not name a child (shown as guidance in the editor). */
  alt: string;
  /** Display width in px, at most 552 (the card's inner width). Omit for full width. */
  width?: number;
  /** Italic muted caption under the photo. Empty means none. */
  caption: string;
}

/** A bullet with a bold lead, as in "Camp Crafts: Kristin Moreno, Dan Moreno and Katie Phelps". */
export interface LeadItem {
  lead: string;
  text: RichText;
}

/** One part of a contributor's story: a paragraph or a bullet list with bold leads. */
export type ContributorPart =
  { kind: 'paragraph'; text: RichText } | { kind: 'list'; items: LeadItem[] };

/** Story blocks (spec 8.2 section 5). The user adds, removes and reorders these. */
export type StoryBlock =
  | {
      kind: 'contributor';
      /** Badge text, first part: "Justin Daly", or "Opening". Shown in capitals by the badge. */
      name: string;
      /** Badge text after a middle dot: "Program Director". Empty means none. */
      role: string;
      parts: ContributorPart[];
    }
  | { kind: 'photo'; photo: PhotoField }
  | {
      kind: 'stats';
      /** Exactly two: a large gold number and a lavender line of text each. */
      stats: [{ value: string; text: string }, { value: string; text: string }];
    }
  | {
      kind: 'sidebar';
      title: string;
      /** Small italic source line, such as "Adapted from a campfire recipe at koa.com". Empty means none. */
      source: string;
      body: RichText[];
      photo?: PhotoField;
    };

/** A dated Coming up item: "Sun Dec 6, 8:00 pm: Parent planning meeting, virtual. Meeting link". */
export interface ComingItem {
  date: CalendarDate;
  time?: TimeOfDay;
  text: RichText;
  link: LinkField;
}

/** An On the horizon item: a date and plain text, no link (spec 8.2 section 10). */
export interface HorizonItem {
  date: CalendarDate;
  text: string;
}

/** An Around the pack item: bold lead, text and an optional link. */
export interface AroundItem {
  lead: string;
  text: RichText;
  link: LinkField;
}

export interface LetterForm {
  /** Draft schema version (spec 8.3). Bump it and add a migration when the shape changes. */
  version: 1;
  /** Masthead month and year (section 2). */
  issue: MonthOfYear;
  /** Summary line (section 3), one sentence. The read time is appended to it and to the preview text. */
  summary: string;
  /** Intro (section 4). */
  greeting: string;
  intro: RichText;
  /** Feature story (section 5). */
  story: { title: string; blocks: StoryBlock[] };
  /** Closing and high fives (section 6, optional). */
  closing: {
    enabled: boolean;
    paragraphs: RichText[];
    /** Thank-you list; names in bold through strong runs. */
    thanks: RichText[];
    closingLine: string;
    signer: string;
    signerRole: string;
  };
  /** Photo and story ask (section 7, optional): one italic sentence and a link. */
  photoAsk: { enabled: boolean; text: string; linkText: string; url: string };
  /** Around the pack (section 8, optional). */
  around: { enabled: boolean; intro: string; items: AroundItem[] };
  /** Coming up (section 9, required). */
  comingUp: { intro: string; items: ComingItem[]; howToHelp: RichText; button: ButtonField };
  /** On the horizon (section 10, optional). The year-at-a-glance address comes from pack.config.ts. */
  horizon: { enabled: boolean; items: HorizonItem[]; yearLinkText: string };
  /** Feedback (section 11, required). The address comes from pack.config.ts. No poll. */
  feedback: { question: string; linkText: string; subject: string; body: string; note: string };
  /** Sign-off (section 12), one bold line. */
  signOff: string;
}

/** Words per minute for the read time (spec 8.2 Rules; pack.config.ts). */
const WORDS_PER_MINUTE = packConfig.wordsPerMinute;

/** Total words divided by 230, rounded up, at least one minute. */
export function readTimeMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** "About an 8 minute read." The article follows the spoken number (an 8, an 11, an 18). */
export function readTimeText(words: number): string {
  const minutes = readTimeMinutes(words);
  const spoken = String(minutes);
  const an = spoken.startsWith('8') || minutes === 11 || minutes === 18 || /^18\d$/.test(spoken);
  return `About ${an ? 'an' : 'a'} ${minutes} minute read.`;
}

/** A blank letter for an issue month, with the defaults from spec 8.2 and the pack settings (spec 9). */
export function emptyLetter(
  issue: MonthOfYear,
  settings: PackSettings = defaultSettings(),
): LetterForm {
  return {
    version: 1,
    issue,
    summary: '',
    greeting: 'Hi Pack 137 families,',
    intro: [],
    story: { title: '', blocks: [] },
    closing: {
      enabled: true,
      paragraphs: [],
      thanks: [],
      closingLine: '',
      signer: '',
      signerRole: '',
    },
    photoAsk: {
      enabled: true,
      text: '',
      linkText: 'Send them to us here',
      url: settings.photoFormUrl,
    },
    around: { enabled: true, intro: '', items: [] },
    comingUp: {
      intro: '',
      items: [],
      howToHelp: [],
      button: {
        text: 'I can help',
        url: `mailto:${settings.email.volunteer}?subject=I%20can%20help`,
      },
    },
    horizon: { enabled: true, items: [], yearLinkText: 'Open the year at a glance' },
    feedback: {
      question: 'Quick question: what should we keep, and what would you like to see more of?',
      linkText: 'Reply with feedback',
      subject: 'Feedback on Pack 137 Stories',
      body: 'Keep: \nMore of: \n',
      note: 'One line is plenty. We share what we hear in the next issue.',
    },
    signOff: 'Ernest, for the Pack 137 committee',
  };
}

/** Fixed section headings (spec 8.2 Rules), counted in the read time when their section is on. */
export const LETTER_HEADINGS = {
  closing: 'Closing and high fives',
  around: 'Around the pack',
  comingUp: 'Coming up',
  horizon: 'On the horizon',
} as const;

function words(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function richWords(runs: RichText): number {
  return words(runs.map((r) => (r.kind === 'text' ? r.text : ' ')).join(''));
}

/**
 * The words a reader sees, for the read time: every user field in the sections that are on, plus
 * the fixed headings. Dates, link addresses and the preview text are not counted.
 */
export function letterWords(letter: LetterForm): number {
  let n = words(letter.summary) + words(letter.greeting) + richWords(letter.intro);
  n += words(letter.story.title);
  for (const block of letter.story.blocks) {
    if (block.kind === 'contributor') {
      n += words(block.name) + words(block.role);
      for (const part of block.parts) {
        if (part.kind === 'paragraph') n += richWords(part.text);
        else for (const item of part.items) n += words(item.lead) + richWords(item.text);
      }
    } else if (block.kind === 'photo') n += words(block.photo.caption);
    else if (block.kind === 'stats')
      for (const s of block.stats) n += words(s.value) + words(s.text);
    else {
      n += words(block.title) + words(block.source);
      for (const p of block.body) n += richWords(p);
      if (block.photo) n += words(block.photo.caption);
    }
  }
  const { closing, photoAsk, around, comingUp, horizon, feedback } = letter;
  if (closing.enabled) {
    n += words(LETTER_HEADINGS.closing);
    for (const p of [...closing.paragraphs, ...closing.thanks]) n += richWords(p);
    n += words(closing.closingLine) + words(closing.signer) + words(closing.signerRole);
  }
  if (photoAsk.enabled) n += words(photoAsk.text) + words(photoAsk.linkText);
  if (around.enabled) {
    n += words(LETTER_HEADINGS.around) + words(around.intro);
    for (const item of around.items)
      n += words(item.lead) + richWords(item.text) + words(item.link.text);
  }
  n += words(LETTER_HEADINGS.comingUp) + words(comingUp.intro) + richWords(comingUp.howToHelp);
  for (const item of comingUp.items) n += richWords(item.text) + words(item.link.text);
  n += words(comingUp.button.text);
  if (horizon.enabled) {
    n += words(LETTER_HEADINGS.horizon) + words(horizon.yearLinkText);
    for (const item of horizon.items) n += words(item.text);
  }
  n += words(feedback.question) + words(feedback.linkText) + words(feedback.note);
  return n + words(letter.signOff);
}
