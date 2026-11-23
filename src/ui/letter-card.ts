/**
 * "Edit on the card" for the monthly letter: the letter drawn as the email, in the page itself,
 * with the same sections, order and look as the letter template (build spec 8.2). Words are edited
 * in place. Things that change the shape of the letter (adding, moving or removing blocks, items,
 * events and sections, dates and times, link addresses, the photo spots, anything that comes from
 * Settings) stay in the form, and each has a small "Change in the form" button that jumps there.
 *
 * This is a drawing for editing, not the email. The email comes from `renderLetter`, and the
 * preview frames stay the final check. Nothing here is written as HTML: every piece is made with
 * DOM calls, and the card never loads a picture or opens a link.
 *
 * It edits the same letter object through the same FormContext as the form, so undo, redo, the
 * draft and the output behave the same in both. Empty fields show a placeholder (a hint drawn by
 * the browser, never part of the letter, so it is never in the output).
 */
import { packConfig } from '../config/pack.config';
import { formatMonthYear, isValidDate } from '../core/dates';
import type { FieldPath } from '../core/fill';
import {
  LETTER_HEADINGS,
  type AroundItem,
  type ComingItem,
  type HorizonItem,
  type LetterForm,
  type PhotoField,
  type StoryBlock,
} from '../core/letter';
import { isPhotoSpot } from '../templates/letter/layout';
import { createNotesPanel, group, openButton as sharedOpenButton, widthTools } from './card-parts';
import { el } from './dom';
import { createKit, type FormContext, type Kit } from './form-kit';
import { blockName, sectionName, whenText, type OptionalSection } from './letter-ops';
import type { LetterNote } from './letter-ops';
import type { LetterView } from './letter-view';

export interface LetterCardOptions {
  /** Switch to the form and put the keyboard on the control for this path. */
  openInForm(path: FieldPath): void;
  /** The card width to start with, in pixels. */
  width: number;
  /** The person picked another width. */
  onWidth(width: number): void;
  /** The things to look at, worked out from the letter as it is now. */
  notes(): LetterNote[];
}

/** The photo as the email draws it: a dashed box with the description, and the caption under it. */
function photoBox(kit: Kit, photo: PhotoField, path: FieldPath, className = ''): HTMLElement {
  const label = isPhotoSpot(photo) ? 'Insert photo here:' : 'Photo:';
  return el('div', { className: `ec-photo-block ${className}`.trim() }, [
    el('div', { className: 'ec-photo-spot' }, [
      el('strong', { textContent: label }),
      kit.cardText(
        'Photo description (required)',
        [...path, 'alt'],
        () => photo.alt,
        (v) => (photo.alt = v),
        { placeholder: 'Describe the photo', className: 'ec-photo-alt' },
      ),
    ]),
    kit.cardText(
      'Caption (optional)',
      [...path, 'caption'],
      () => photo.caption,
      (v) => (photo.caption = v),
      { placeholder: 'Add a caption (optional)', className: 'ec-caption' },
    ),
  ]);
}

export function buildLetterCard(
  letter: LetterForm,
  ctx: FormContext,
  options: LetterCardOptions,
): LetterView {
  const kit = createKit(ctx, () => false);
  const open = (what: string, path: FieldPath): HTMLButtonElement =>
    sharedOpenButton(options.openInForm, what, path);

  const text = (
    label: string,
    path: FieldPath,
    get: () => string,
    set: (value: string) => void,
    placeholder: string,
    className?: string,
  ) => kit.cardText(label, path, get, set, { placeholder, className });
  const rich = (
    label: string,
    path: FieldPath,
    get: () => LetterForm['intro'],
    set: (value: LetterForm['intro']) => void,
    placeholder: string,
    className?: string,
  ) => kit.cardRich(label, path, get, set, { placeholder, className });

  const heading = (words: string, className = 'ec-heading'): HTMLElement =>
    el('h3', { className, textContent: words });

  /** A section that is switched off in the form: a line saying so, and a way to turn it on. */
  function offStub(key: OptionalSection): HTMLElement {
    const name = sectionName(key);
    return group(name, 'ec-section ec-off', [
      el('p', {
        className: 'ec-empty',
        textContent: `${name} is off, so it is left out of the letter.`,
      }),
      open(`turn on ${name}`, [key, 'enabled']),
    ]);
  }

  /* ---------- masthead, summary, intro ---------- */

  const masthead = group('Masthead', 'ec-section ec-mast', [
    el('div', { className: 'ec-mast-inner' }, [
      // The logo comes from Settings. It is drawn as a round placeholder here.
      el('span', { className: 'ec-logo', textContent: 'Logo' }),
      el('div', { className: 'ec-mast-text' }, [
        el('div', { className: 'ec-eyebrow', textContent: packConfig.eyebrow }),
        el('div', { className: 'ec-mast-title', textContent: packConfig.monthlyTitle }),
        el('div', { className: 'ec-mast-month', textContent: formatMonthYear(letter.issue) }),
      ]),
    ]),
    open('month and year', ['issue', 'month']),
  ]);

  const summary = text(
    'Summary line',
    ['summary'],
    () => letter.summary,
    (v) => (letter.summary = v),
    'Add a summary line',
    'ec-summary',
  );

  const intro = group('Intro', 'ec-section', [
    text(
      'Greeting',
      ['greeting'],
      () => letter.greeting,
      (v) => (letter.greeting = v),
      'Add a greeting',
    ),
    rich(
      'Intro paragraph',
      ['intro'],
      () => letter.intro,
      (v) => (letter.intro = v),
      'Add the intro paragraph',
    ),
  ]);

  /* ---------- feature story ---------- */

  function contributor(
    block: Extract<StoryBlock, { kind: 'contributor' }>,
    path: FieldPath,
  ): HTMLElement[] {
    const parts = block.parts.map((part, k): HTMLElement => {
      const partPath: FieldPath = [...path, 'parts', k];
      if (part.kind === 'paragraph') {
        return rich(
          `Text of part ${k + 1}`,
          [...partPath, 'text'],
          () => part.text,
          (v) => (part.text = v),
          'Add some text',
        );
      }
      return group(
        `Part ${k + 1}: Bullet list`,
        'ec-bullets',
        part.items.map((bullet, j) =>
          el('div', { className: 'ec-bullet' }, [
            text(
              `Bold lead of bullet ${j + 1} in part ${k + 1}`,
              [...partPath, 'items', j, 'lead'],
              () => bullet.lead,
              (v) => (bullet.lead = v),
              'Add a bold lead',
              'ec-lead',
            ),
            rich(
              `Text of bullet ${j + 1} in part ${k + 1}`,
              [...partPath, 'items', j, 'text'],
              () => bullet.text,
              (v) => (bullet.text = v),
              'Add the text',
            ),
          ]),
        ),
      );
    });
    return [
      el('div', { className: 'ec-badge' }, [
        text(
          'Name on the name tag',
          [...path, 'name'],
          () => block.name,
          (v) => (block.name = v),
          'Add a name',
        ),
        el('span', { className: 'ec-dot', textContent: '·' }),
        text(
          'Role (optional)',
          [...path, 'role'],
          () => block.role,
          (v) => (block.role = v),
          'Add a role (optional)',
        ),
      ]),
      ...parts,
    ];
  }

  function statsBand(
    block: Extract<StoryBlock, { kind: 'stats' }>,
    path: FieldPath,
  ): HTMLElement[] {
    const names = ['First stat', 'Second stat'];
    return [
      el(
        'div',
        { className: 'ec-stats' },
        block.stats.map((stat, k) =>
          group(names[k] ?? `Stat ${k + 1}`, 'ec-stat', [
            text(
              'Big number or figure',
              [...path, 'stats', k, 'value'],
              () => stat.value,
              (v) => (stat.value = v),
              'Add a number',
              'ec-stat-value',
            ),
            text(
              'Line of text under it',
              [...path, 'stats', k, 'text'],
              () => stat.text,
              (v) => (stat.text = v),
              'Add a line of text',
              'ec-stat-text',
            ),
          ]),
        ),
      ),
    ];
  }

  function sidebar(
    block: Extract<StoryBlock, { kind: 'sidebar' }>,
    path: FieldPath,
  ): HTMLElement[] {
    const photo = block.photo;
    return [
      el('div', { className: 'ec-box ec-sidebar' }, [
        text(
          'Box title',
          [...path, 'title'],
          () => block.title,
          (v) => (block.title = v),
          'Add a box title',
          'ec-box-title',
        ),
        text(
          'Source line (optional)',
          [...path, 'source'],
          () => block.source,
          (v) => (block.source = v),
          'Add a source line (optional)',
          'ec-source ec-optional',
        ),
        ...block.body.map((_p, i) =>
          rich(
            `Text of paragraph ${i + 1}`,
            [...path, 'body', i],
            () => block.body[i] ?? [],
            (v) => {
              block.body[i] = v;
            },
            'Add some text',
          ),
        ),
        photo === undefined ? null : photoBox(kit, photo, [...path, 'photo']),
      ]),
    ];
  }

  function storyBlock(block: StoryBlock, i: number): HTMLElement {
    const path: FieldPath = ['story', 'blocks', i];
    let inner: HTMLElement[];
    let what: string;
    switch (block.kind) {
      case 'contributor':
        inner = contributor(block, path);
        what = `move or remove block ${i + 1}, or add, move or remove its paragraphs and bullets`;
        break;
      case 'photo':
        inner = [photoBox(kit, block.photo, [...path, 'photo'])];
        what = `move or remove block ${i + 1}, or shrink its photo`;
        break;
      case 'stats':
        inner = statsBand(block, path);
        what = `move or remove block ${i + 1}`;
        break;
      case 'sidebar':
        inner = sidebar(block, path);
        what = `move or remove block ${i + 1}, or add or remove its photo and paragraphs`;
        break;
    }
    return group(`Block ${i + 1}: ${blockName(block.kind)}`, `ec-block ${block.kind}`, [
      ...inner,
      open(what, path),
    ]);
  }

  const story = group('Feature story', 'ec-section', [
    text(
      'Story title',
      ['story', 'title'],
      () => letter.story.title,
      (v) => (letter.story.title = v),
      'Add a story title',
      'ec-story-title',
    ),
    ...(letter.story.blocks.length > 0
      ? letter.story.blocks.map(storyBlock)
      : [el('p', { className: 'ec-empty', textContent: 'No blocks in the story yet.' })]),
    open('add, move or remove blocks of the story', ['story', 'blocks']),
  ]);

  /* ---------- closing, photo ask, around the pack ---------- */

  const closing = (): HTMLElement => {
    const c = letter.closing;
    if (!c.enabled) return offStub('closing');
    return group(LETTER_HEADINGS.closing, 'ec-section quiet', [
      heading(LETTER_HEADINGS.closing),
      ...c.paragraphs.map((_p, i) =>
        rich(
          `Text of paragraph ${i + 1}`,
          ['closing', 'paragraphs', i],
          () => c.paragraphs[i] ?? [],
          (v) => {
            c.paragraphs[i] = v;
          },
          'Add some text',
        ),
      ),
      c.thanks.length > 0
        ? group(
            'Thank-you list',
            'ec-thanks',
            c.thanks.map((_p, i) =>
              rich(
                `Text of thank-you line ${i + 1}`,
                ['closing', 'thanks', i],
                () => c.thanks[i] ?? [],
                (v) => {
                  c.thanks[i] = v;
                },
                'Add a thank-you',
              ),
            ),
          )
        : null,
      text(
        'Closing line',
        ['closing', 'closingLine'],
        () => c.closingLine,
        (v) => (c.closingLine = v),
        'Add a closing line',
      ),
      el('div', { className: 'ec-signer' }, [
        text(
          'Signer name',
          ['closing', 'signer'],
          () => c.signer,
          (v) => (c.signer = v),
          'Add a name',
        ),
        text(
          'Signer role',
          ['closing', 'signerRole'],
          () => c.signerRole,
          (v) => (c.signerRole = v),
          'Add a role',
        ),
      ]),
      open('add, move or remove paragraphs and thank-yous, or switch this section off', [
        'closing',
        'enabled',
      ]),
    ]);
  };

  const photoAsk = (): HTMLElement => {
    const a = letter.photoAsk;
    if (!a.enabled) return offStub('photoAsk');
    return group('Photo and story ask', 'ec-section ec-ask-line', [
      text(
        'The sentence',
        ['photoAsk', 'text'],
        () => a.text,
        (v) => (a.text = v),
        'Add a sentence asking for photos or stories',
        'ec-italic',
      ),
      text(
        'Link text',
        ['photoAsk', 'linkText'],
        () => a.linkText,
        (v) => (a.linkText = v),
        'Add the link words',
        'ec-italic ec-link',
      ),
      open('link address of the photo and story ask, or switch this section off', [
        'photoAsk',
        'url',
      ]),
    ]);
  };

  const aroundRow = (item: AroundItem, i: number): HTMLElement => {
    const path: FieldPath = ['around', 'items', i];
    return group(`Item ${i + 1}`, 'ec-row', [
      text(
        'Bold lead',
        [...path, 'lead'],
        () => item.lead,
        (v) => (item.lead = v),
        'Add a bold lead',
        'ec-lead',
      ),
      rich(
        'Text',
        [...path, 'text'],
        () => item.text,
        (v) => (item.text = v),
        'Add the text',
      ),
      text(
        'Link text (optional)',
        [...path, 'link', 'text'],
        () => item.link.text,
        (v) => (item.link.text = v),
        'Add link words (optional)',
        'ec-link ec-optional',
      ),
      open(`link address of item ${i + 1}`, [...path, 'link', 'url']),
    ]);
  };

  const around = (): HTMLElement => {
    const a = letter.around;
    if (!a.enabled) return offStub('around');
    return group(LETTER_HEADINGS.around, 'ec-section', [
      heading(LETTER_HEADINGS.around),
      text(
        'Intro line',
        ['around', 'intro'],
        () => a.intro,
        (v) => (a.intro = v),
        'Add an intro line (optional)',
      ),
      a.items.length > 0
        ? el('div', { className: 'ec-rows' }, a.items.map(aroundRow))
        : el('p', { className: 'ec-empty', textContent: 'No items yet.' }),
      open('add, move or remove items, or switch this section off', ['around', 'items']),
    ]);
  };

  /* ---------- coming up, on the horizon ---------- */

  const comingRow = (item: ComingItem, i: number): HTMLElement => {
    const path: FieldPath = ['comingUp', 'items', i];
    const when = isValidDate(item.date) ? whenText(item.date, item.time) : null;
    return group(`Event ${i + 1}`, 'ec-row', [
      when === null ? null : el('strong', { className: 'ec-when', textContent: `${when}:` }),
      rich(
        'What is happening',
        [...path, 'text'],
        () => item.text,
        (v) => (item.text = v),
        'Say what is happening',
      ),
      text(
        'Link text (optional)',
        [...path, 'link', 'text'],
        () => item.link.text,
        (v) => (item.link.text = v),
        'Add link words (optional)',
        'ec-link ec-optional',
      ),
      open(`date, time and link address of event ${i + 1}`, [...path, 'date']),
    ]);
  };

  const comingUp = (() => {
    const c = letter.comingUp;
    const button = c.button;
    return group(LETTER_HEADINGS.comingUp, 'ec-section highlight', [
      el('span', { className: 'ec-badge', textContent: LETTER_HEADINGS.comingUp.toUpperCase() }),
      text(
        'Intro line',
        ['comingUp', 'intro'],
        () => c.intro,
        (v) => (c.intro = v),
        'Add an intro line (optional)',
      ),
      c.items.length > 0
        ? el('div', { className: 'ec-rows' }, c.items.map(comingRow))
        : el('p', { className: 'ec-empty', textContent: 'No events yet.' }),
      el('div', { className: 'ec-help' }, [
        el('strong', { textContent: 'How to help:' }),
        rich(
          'How to help line',
          ['comingUp', 'howToHelp'],
          () => c.howToHelp,
          (v) => (c.howToHelp = v),
          'Say how families can help (optional)',
        ),
      ]),
      group('Button at the bottom', 'ec-actions ec-wide', [
        el('div', { className: 'ec-btn' }, [
          text(
            'Button text',
            ['comingUp', 'button', 'text'],
            () => button.text,
            (v) => (button.text = v),
            'Button text',
          ),
        ]),
        open('address of the button at the bottom', ['comingUp', 'button', 'url']),
      ]),
      open('add, move or remove events', ['comingUp', 'items']),
    ]);
  })();

  const horizonRow = (item: HorizonItem, i: number): HTMLElement => {
    const path: FieldPath = ['horizon', 'items', i];
    const when = isValidDate(item.date) ? whenText(item.date) : null;
    return group(`Date ${i + 1}`, 'ec-row', [
      when === null ? null : el('strong', { className: 'ec-when', textContent: `${when}:` }),
      text(
        'What is happening',
        [...path, 'text'],
        () => item.text,
        (v) => (item.text = v),
        'Say what is happening',
      ),
      open(`date of date ${i + 1}`, [...path, 'date']),
    ]);
  };

  const horizon = (): HTMLElement => {
    const h = letter.horizon;
    if (!h.enabled) return offStub('horizon');
    return group(LETTER_HEADINGS.horizon, 'ec-section', [
      heading(LETTER_HEADINGS.horizon),
      h.items.length > 0
        ? el('div', { className: 'ec-rows' }, h.items.map(horizonRow))
        : el('p', { className: 'ec-empty', textContent: 'No dates yet.' }),
      text(
        'Year at a glance link text',
        ['horizon', 'yearLinkText'],
        () => h.yearLinkText,
        (v) => (h.yearLinkText = v),
        'Add the link words',
        'ec-link',
      ),
      open('add, move or remove dates, or switch this section off', ['horizon', 'items']),
    ]);
  };

  /* ---------- feedback, sign-off, footer ---------- */

  const feedback = group('Feedback', 'ec-section grey', [
    text(
      'Question',
      ['feedback', 'question'],
      () => letter.feedback.question,
      (v) => (letter.feedback.question = v),
      'Add a question',
    ),
    text(
      'Reply link text',
      ['feedback', 'linkText'],
      () => letter.feedback.linkText,
      (v) => (letter.feedback.linkText = v),
      'Add the link words',
      'ec-link',
    ),
    text(
      'Small note',
      ['feedback', 'note'],
      () => letter.feedback.note,
      (v) => (letter.feedback.note = v),
      'Add a small note (optional)',
      'ec-small-note',
    ),
    open('subject and start of the reply email', ['feedback', 'subject']),
  ]);

  const signOff = text(
    'Sign-off line',
    ['signOff'],
    () => letter.signOff,
    (v) => (letter.signOff = v),
    'Add a sign-off line',
    'ec-sign-off',
  );

  const footer = group('Footer', 'ec-section navy', [
    el('p', {
      className: 'ec-footer-text',
      textContent:
        'The pack links and contact email are added here from Settings, so there is nothing to type.',
    }),
  ]);

  /* ---------- the whole view ---------- */

  const body = el('div', { className: 'ec-body' }, [
    masthead,
    summary,
    intro,
    story,
    closing(),
    photoAsk(),
    around(),
    comingUp,
    horizon(),
    feedback,
    signOff,
    footer,
  ]);
  const card = el('div', { className: 'ec ec-letter' }, [body]);
  const tools = widthTools(card, options.width, options.onWidth);
  const notes = createNotesPanel({
    title: 'Things to look at',
    notes: () => options.notes().map((n, i) => ({ key: `n${i}`, ...n })),
    openInForm: options.openInForm,
  });

  const element = el('div', { className: 'card-view letter-card-view' }, [
    notes.element,
    tools,
    card,
  ]);
  return {
    element,
    setField: kit.setField,
    fieldControl: kit.fieldControl,
    fieldText: kit.fieldText,
    flush: kit.flush,
    focusPath: kit.focusPath,
    refreshNotes: notes.refresh,
  };
}
