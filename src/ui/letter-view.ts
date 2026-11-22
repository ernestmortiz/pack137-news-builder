/**
 * The form for the monthly letter (build spec 8.1 and 8.2). `buildLetterForm` reads the letter it
 * is given and edits that same object as the person types. Sections come in the fixed order from
 * spec 8.2. Optional sections have an on/off switch; off hides their fields and the renderer leaves
 * them out. Fixed headings are shown as plain text, never as fields.
 */
import { formatMonthYear, type CalendarDate, type TimeOfDay } from '../core/dates';
import type { FieldPath } from '../core/fill';
import {
  LETTER_HEADINGS,
  type AroundItem,
  type ComingItem,
  type ContributorPart,
  type HorizonItem,
  type LeadItem,
  type LetterForm,
  type PhotoField,
  type StoryBlock,
} from '../core/letter';
import type { RichText } from '../core/forms';
import { ALT_HELP, altFeedback } from './alt-ui';
import { el, uid } from './dom';
import { markSpelling } from './field-kinds';
import { createKit, type FormContext } from './form-kit';
import { paragraphs } from './form-view';
import {
  BLOCK_KINDS,
  blockName,
  defaultItemDate,
  newBlock,
  newPart,
  newPhoto,
  parseTime,
  parseYear,
  sectionName,
  setSectionEnabled,
  toTimeValue,
  whenText,
  type BlockKind,
  type OptionalSection,
} from './letter-ops';
import { dateWithYear, fromIsoDate, toIsoDate } from './paths';

export interface LetterView {
  element: HTMLElement;
  /** Put text in a field on screen without redrawing. False if the field is not there. */
  setField(path: FieldPath, value: string, selection: [number, number]): boolean;
  /** The control for a field on screen, if any. */
  fieldControl(path: FieldPath): HTMLElement | null;
  /** Bring the letter up to date with text typed a moment ago. Call before reading it. */
  flush(): void;
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: formatMonthYear({ year: 2000, month: i + 1 }).replace(/ 2000$/, ''),
}));

const URL_HINT = 'Starts with https:// or mailto:';
const PHOTO_URL_HINT = 'Starts with https://';

/* ---------- small pieces ---------- */

/** A line of warning text that shows only while `isEmpty` is true. */
function emptyNote(message: string, isEmpty: () => boolean) {
  const node = el('p', { className: 'note warn', textContent: message });
  node.hidden = !isEmpty();
  return {
    node,
    update(): void {
      node.hidden = !isEmpty();
    },
  };
}

/** An on/off switch with a visible label. A step is recorded each time it is flipped. */
function toggle(
  ctx: FormContext,
  label: string,
  get: () => boolean,
  set: (on: boolean) => void,
  stepLabel: (on: boolean) => string,
  onChange?: (on: boolean) => void,
): { wrapper: HTMLElement; input: HTMLInputElement } {
  const input = el('input', { type: 'checkbox', id: uid('sw') });
  input.setAttribute('role', 'switch');
  input.checked = get();
  const state = el('span', {
    className: 'switch-state',
    textContent: input.checked ? 'On' : 'Off',
  });
  input.addEventListener('change', () => {
    ctx.begin();
    set(input.checked);
    state.textContent = input.checked ? 'On' : 'Off';
    onChange?.(input.checked);
    ctx.step(stepLabel(input.checked));
  });
  const wrapper = el('label', { className: 'check-row switch', htmlFor: input.id }, [
    input,
    el('span', { textContent: label }),
    state,
  ]);
  return { wrapper, input };
}

/** A section card: a heading, one line of help and the body. */
function sectionCard(
  title: string,
  help: string,
  body: Node[],
  extra: Node[] = [],
): { element: HTMLElement; heading: HTMLElement; body: HTMLElement } {
  const heading = el('h3', { textContent: title });
  const bodyBox = el('div', { className: 'section-body' }, body);
  const element = el('section', { className: 'card letter-section' }, [
    heading,
    el('p', { className: 'hint', textContent: help }),
    ...extra,
    bodyBox,
  ]);
  return { element, heading, body: bodyBox };
}

/** The heading text a section always has in the letter. Shown, not editable. */
function fixedHeading(text: string): HTMLElement {
  return el('p', { className: 'fixed-heading' }, [
    el('span', { className: 'fixed-tag', textContent: 'Heading in the letter' }),
    el('strong', { textContent: text }),
    el('span', { className: 'hint', textContent: 'This wording is fixed.' }),
  ]);
}

/* ---------- the form ---------- */

export function buildLetterForm(letter: LetterForm, ctx: FormContext): LetterView {
  const kit = createKit(ctx);
  const element = el('div', { className: 'form letter-form' });

  /** A date, with a time when `withTime` is true, and the finished wording shown beneath. */
  function dateTimeField(
    item: { date: CalendarDate; time?: TimeOfDay },
    withTime: boolean,
  ): HTMLElement {
    const dateInput = el('input', { type: 'date', className: 'control date', id: uid('d') });
    markSpelling(dateInput, 'date');
    dateInput.value = toIsoDate(item.date);
    const shown = el('p', { className: 'date-note' });
    const timeInput = el('input', { type: 'time', className: 'control time', id: uid('t') });
    markSpelling(timeInput, 'time');
    timeInput.step = '60';
    timeInput.value = item.time ? toTimeValue(item.time) : '';
    const noTime = el('button', {
      type: 'button',
      className: 'btn small',
      textContent: 'No time',
    });
    const yearLine = el('p', { className: 'hint' });
    const dateProblem = el('p', { className: 'note warn' });
    dateProblem.hidden = true;

    function show(): void {
      yearLine.textContent = dateWithYear(item.date);
      shown.textContent = `Shows as: ${whenText(item.date, withTime ? item.time : undefined)}${
        withTime ? '' : ` (${item.date.year})`
      }`;
      noTime.disabled = item.time === undefined;
    }

    dateInput.addEventListener('change', () => {
      const date = fromIsoDate(dateInput.value);
      dateProblem.hidden = date !== undefined;
      dateProblem.textContent = 'Pick a date. The letter keeps the last one until you do.';
      if (date === undefined) return;
      ctx.begin();
      item.date = date;
      show();
      ctx.step('changed a date');
    });
    const parts: HTMLElement[] = [
      el('div', { className: 'field' }, [
        el('label', { htmlFor: dateInput.id, className: 'label', textContent: 'Date' }),
        dateInput,
        yearLine,
        dateProblem,
      ]),
    ];
    if (withTime) {
      timeInput.addEventListener('change', () => {
        const time = parseTime(timeInput.value);
        if (time === undefined && item.time === undefined) return;
        ctx.begin();
        if (time === undefined) delete item.time;
        else item.time = time;
        show();
        ctx.step(time === undefined ? 'cleared a time' : 'changed a time');
      });
      noTime.addEventListener('click', () => {
        if (item.time === undefined) return;
        ctx.begin();
        delete item.time;
        timeInput.value = '';
        show();
        ctx.step('cleared a time');
        timeInput.focus();
      });
      parts.push(
        el('div', { className: 'field' }, [
          el('label', {
            htmlFor: timeInput.id,
            className: 'label',
            textContent: 'Time (optional)',
          }),
          el('div', { className: 'time-row' }, [timeInput, noTime]),
        ]),
      );
    }
    parts.push(shown);
    show();
    return el('div', { className: 'when' }, parts);
  }

  /** Photo address, description and caption, with the TroopTrack steps and the child-name rule. */
  function photoFields(photo: PhotoField, path: FieldPath): Node[] {
    const srcNote = emptyNote(
      'Paste the photo address from TroopTrack.',
      () => photo.src.trim() === '',
    );
    const feedback = altFeedback(
      () => photo.alt,
      () => photo.caption,
      true,
    );
    const src = kit.text(
      'Photo address',
      [...path, 'src'],
      () => photo.src,
      (v) => {
        photo.src = v;
        srcNote.update();
      },
      { url: true, hint: PHOTO_URL_HINT },
    );
    src.append(srcNote.node);
    const alt = kit.text(
      'Photo description (required)',
      [...path, 'alt'],
      () => photo.alt,
      (v) => {
        photo.alt = v;
        feedback.update();
      },
      { hint: ALT_HELP },
    );
    alt.append(feedback.node);
    return [
      el('p', {
        className: 'hint step-note',
        textContent: 'Upload the photo in TroopTrack, copy its address, paste it here.',
      }),
      src,
      alt,
      kit.text(
        'Caption (optional)',
        [...path, 'caption'],
        () => photo.caption,
        (v) => {
          photo.caption = v;
          feedback.update();
        },
        { hint: 'Shown in small italic text under the photo.' },
      ),
    ];
  }

  function contributorFields(
    block: Extract<StoryBlock, { kind: 'contributor' }>,
    path: FieldPath,
  ): Node[] {
    return [
      kit.text(
        'Name on the name tag',
        [...path, 'name'],
        () => block.name,
        (v) => (block.name = v),
        { hint: 'Shown in capitals. For the first piece you can use Opening.' },
      ),
      kit.text(
        'Role (optional)',
        [...path, 'role'],
        () => block.role,
        (v) => (block.role = v),
        { hint: 'Shown after the name, such as Program Director.' },
      ),
      kit.group('What this person wrote', [
        kit.repeater<ContributorPart>({
          noun: 'part',
          addLabel: 'Add a paragraph',
          arrayPath: [...path, 'parts'],
          items: block.parts,
          compact: true,
          create: () => newPart('paragraph'),
          extraAdds: [{ label: 'Add a bullet list', create: () => newPart('list') }],
          describe: (part) => (part.kind === 'paragraph' ? 'Paragraph' : 'Bullet list'),
          body: (part, _i, partPath) =>
            part.kind === 'paragraph'
              ? [
                  kit.rich(
                    'Paragraph text',
                    [...partPath, 'text'],
                    () => part.text,
                    (v) => (part.text = v),
                    4,
                  ),
                ]
              : [
                  kit.repeater<LeadItem>({
                    noun: 'bullet',
                    addLabel: 'Add a bullet',
                    arrayPath: [...partPath, 'items'],
                    items: part.items,
                    compact: true,
                    create: () => ({ lead: '', text: [] }),
                    body: (bullet, _j, bulletPath) => [
                      kit.text(
                        'Bold lead',
                        [...bulletPath, 'lead'],
                        () => bullet.lead,
                        (v) => (bullet.lead = v),
                        { hint: 'The first words, shown in bold. For example: Camp Crafts' },
                      ),
                      kit.rich(
                        'Text after the lead',
                        [...bulletPath, 'text'],
                        () => bullet.text,
                        (v) => (bullet.text = v),
                        2,
                      ),
                    ],
                  }),
                ],
        }),
      ]),
    ];
  }

  function statFields(block: Extract<StoryBlock, { kind: 'stats' }>, path: FieldPath): Node[] {
    const names = ['First stat', 'Second stat'];
    return block.stats.map((stat, k) =>
      kit.group(names[k] ?? `Stat ${k + 1}`, [
        kit.text(
          'Big number or figure',
          [...path, 'stats', k, 'value'],
          () => stat.value,
          (v) => (stat.value = v),
          { hint: 'Shown large in gold, such as 48 or 3,000.', kind: 'number' },
        ),
        kit.text(
          'Line of text under it',
          [...path, 'stats', k, 'text'],
          () => stat.text,
          (v) => (stat.text = v),
        ),
      ]),
    );
  }

  function sidebarFields(block: Extract<StoryBlock, { kind: 'sidebar' }>, path: FieldPath): Node[] {
    // Kept apart from the block so that switching the photo off and on again keeps what was typed.
    const photo = block.photo ?? newPhoto();
    const photoBox = kit.group('Photo in the box', photoFields(photo, [...path, 'photo']));
    photoBox.hidden = block.photo === undefined;
    const photoSwitch = toggle(
      ctx,
      'This box has a photo',
      () => block.photo !== undefined,
      (on) => {
        if (on) block.photo = photo;
        else delete block.photo;
      },
      (on) =>
        on ? 'turned on the photo in a sidebar box' : 'turned off the photo in a sidebar box',
      (on) => {
        photoBox.hidden = !on;
      },
    );
    return [
      kit.text(
        'Box title',
        [...path, 'title'],
        () => block.title,
        (v) => (block.title = v),
      ),
      kit.text(
        'Source line (optional)',
        [...path, 'source'],
        () => block.source,
        (v) => (block.source = v),
        { hint: 'Small italic line, such as: Adapted from a campfire recipe at koa.com' },
      ),
      kit.group('Text in the box', [
        paragraphs(kit, 'paragraph', 'Add a paragraph', [...path, 'body'], block.body),
      ]),
      photoSwitch.wrapper,
      photoBox,
    ];
  }

  function blockFields(block: StoryBlock, path: FieldPath): Node[] {
    switch (block.kind) {
      case 'contributor':
        return contributorFields(block, path);
      case 'photo':
        return [kit.group('Photo', photoFields(block.photo, [...path, 'photo']))];
      case 'stats':
        return statFields(block, path);
      case 'sidebar':
        return sidebarFields(block, path);
    }
  }

  function blockPicker(): { node: HTMLElement; kind(): BlockKind } {
    const select = el('select', { id: uid('pick'), className: 'control' });
    for (const b of BLOCK_KINDS) {
      select.append(el('option', { value: b.kind, textContent: `${b.name}: ${b.help}` }));
    }
    const node = el('div', { className: 'picker field' }, [
      el('label', { htmlFor: select.id, className: 'label', textContent: 'Kind of block to add' }),
      select,
    ]);
    return { node, kind: () => select.value as BlockKind };
  }

  /* ----- 2 and 3: month, summary ----- */
  const yearNote = emptyNote('Use four digits, like 2026.', () => false);
  const masthead = sectionCard(
    'Masthead',
    'The top of the letter shows the month and year. The pack name and logo are fixed.',
    [
      kit.select(
        'Month',
        ['issue', 'month'],
        MONTH_OPTIONS,
        () => String(letter.issue.month),
        (v) => (letter.issue.month = Number(v)),
      ),
      (() => {
        const field = kit.text(
          'Year',
          ['issue', 'year'],
          () => String(letter.issue.year),
          (v) => {
            const year = parseYear(v);
            if (year !== undefined) letter.issue.year = year;
            yearNote.node.hidden = year !== undefined || v.trim() === '';
          },
          { hint: 'Four digits, like 2026.', kind: 'number' },
        );
        field.append(yearNote.node);
        return field;
      })(),
    ],
  );

  const summary = sectionCard(
    'Summary line',
    'One sentence about this issue. The read time is added to it for you, and to the preview text that mail apps show beside the subject.',
    [
      kit.text(
        'Summary line',
        ['summary'],
        () => letter.summary,
        (v) => (letter.summary = v),
        { rows: 2 },
      ),
    ],
  );

  const intro = sectionCard('Intro', 'A greeting and one short paragraph.', [
    kit.text(
      'Greeting',
      ['greeting'],
      () => letter.greeting,
      (v) => (letter.greeting = v),
    ),
    kit.rich(
      'Intro paragraph',
      ['intro'],
      () => letter.intro,
      (v) => (letter.intro = v),
      4,
    ),
  ]);

  const story = sectionCard(
    'Feature story',
    'The main story. Add blocks and put them in the order you want them to read.',
    [
      kit.text(
        'Story title',
        ['story', 'title'],
        () => letter.story.title,
        (v) => (letter.story.title = v),
      ),
      (() => {
        const picker = blockPicker();
        return kit.repeater<StoryBlock>({
          noun: 'block',
          addLabel: 'Add block',
          arrayPath: ['story', 'blocks'],
          items: letter.story.blocks,
          create: () => newBlock(picker.kind()),
          beforeAdd: picker.node,
          describe: (block) => blockName(block.kind),
          body: (block, _i, path) => blockFields(block, path),
        });
      })(),
    ],
  );

  /** An optional section: a switch, and fields that collapse when it is off. */
  function optionalSection(
    key: OptionalSection,
    help: string,
    fields: Node[],
    fixed?: string,
  ): HTMLElement {
    const name = sectionName(key);
    const off = el('p', {
      className: 'hint off-note',
      textContent: 'This section is off. It is left out of the letter.',
    });
    const card = sectionCard(name, help, fields, fixed === undefined ? [] : [fixedHeading(fixed)]);
    const sync = (on: boolean): void => {
      card.body.hidden = !on;
      off.hidden = on;
    };
    const sw = toggle(
      ctx,
      `Include "${name}" in the letter`,
      () => letter[key].enabled,
      (on) => setSectionEnabled(letter, key, on),
      (on) => `turned ${name} ${on ? 'on' : 'off'}`,
      sync,
    );
    (card.heading.nextElementSibling ?? card.heading).after(sw.wrapper, off);
    sync(letter[key].enabled);
    return card.element;
  }

  const closing = optionalSection(
    'closing',
    'A thank-you panel at the end of the issue.',
    [
      kit.group('Paragraphs', [
        paragraphs(
          kit,
          'paragraph',
          'Add a paragraph',
          ['closing', 'paragraphs'],
          letter.closing.paragraphs,
        ),
      ]),
      kit.group('Thank-you list', [
        el('p', {
          className: 'hint',
          textContent: 'One line per thank-you. Put the names in **bold**.',
        }),
        paragraphs(
          kit,
          'thank-you line',
          'Add a thank-you',
          ['closing', 'thanks'],
          letter.closing.thanks,
        ),
      ]),
      kit.text(
        'Closing line',
        ['closing', 'closingLine'],
        () => letter.closing.closingLine,
        (v) => (letter.closing.closingLine = v),
        { rows: 2 },
      ),
      kit.text(
        'Signer name',
        ['closing', 'signer'],
        () => letter.closing.signer,
        (v) => (letter.closing.signer = v),
      ),
      kit.text(
        'Signer role',
        ['closing', 'signerRole'],
        () => letter.closing.signerRole,
        (v) => (letter.closing.signerRole = v),
      ),
    ],
    LETTER_HEADINGS.closing,
  );

  const photoAsk = optionalSection(
    'photoAsk',
    'One italic sentence asking families for photos or stories, and a link.',
    [
      kit.text(
        'The sentence',
        ['photoAsk', 'text'],
        () => letter.photoAsk.text,
        (v) => (letter.photoAsk.text = v),
        { rows: 2 },
      ),
      kit.text(
        'Link text',
        ['photoAsk', 'linkText'],
        () => letter.photoAsk.linkText,
        (v) => (letter.photoAsk.linkText = v),
      ),
      kit.text(
        'Link address',
        ['photoAsk', 'url'],
        () => letter.photoAsk.url,
        (v) => (letter.photoAsk.url = v),
        {
          url: true,
          hint: 'The photo form from Settings is filled in to start. Links begin with https:// or mailto:',
        },
      ),
    ],
  );

  const around = optionalSection(
    'around',
    'Short news items from around the pack.',
    [
      kit.text(
        'Intro line',
        ['around', 'intro'],
        () => letter.around.intro,
        (v) => (letter.around.intro = v),
        { rows: 2 },
      ),
      kit.repeater<AroundItem>({
        noun: 'item',
        addLabel: 'Add an item',
        arrayPath: ['around', 'items'],
        items: letter.around.items,
        create: () => ({ lead: '', text: [], link: { text: '', url: '' } }),
        body: (item, _i, path) => [
          kit.text(
            'Bold lead',
            [...path, 'lead'],
            () => item.lead,
            (v) => (item.lead = v),
            { hint: 'The first words, shown in bold.' },
          ),
          kit.rich(
            'Text',
            [...path, 'text'],
            () => item.text,
            (v) => (item.text = v),
            2,
          ),
          kit.text(
            'Link text (optional)',
            [...path, 'link', 'text'],
            () => item.link.text,
            (v) => (item.link.text = v),
          ),
          kit.text(
            'Link address (optional)',
            [...path, 'link', 'url'],
            () => item.link.url,
            (v) => (item.link.url = v),
            { url: true, hint: URL_HINT },
          ),
        ],
      }),
    ],
    LETTER_HEADINGS.around,
  );

  const coming = sectionCard(
    'Coming up',
    'Dates families need to know. This section is always in the letter.',
    [
      fixedHeading(LETTER_HEADINGS.comingUp),
      kit.text(
        'Intro line',
        ['comingUp', 'intro'],
        () => letter.comingUp.intro,
        (v) => (letter.comingUp.intro = v),
        { rows: 2 },
      ),
      kit.repeater<ComingItem>({
        noun: 'event',
        addLabel: 'Add an event',
        arrayPath: ['comingUp', 'items'],
        items: letter.comingUp.items,
        create: () => ({
          date: defaultItemDate(letter.issue),
          text: [],
          link: { text: '', url: '' },
        }),
        body: (item, _i, path) => [
          dateTimeField(item, true),
          kit.rich(
            'What is happening',
            [...path, 'text'],
            () => item.text,
            (v) => (item.text = v),
            2,
          ),
          kit.text(
            'Link text (optional)',
            [...path, 'link', 'text'],
            () => item.link.text,
            (v) => (item.link.text = v),
          ),
          kit.text(
            'Link address (optional)',
            [...path, 'link', 'url'],
            () => item.link.url,
            (v) => (item.link.url = v),
            { url: true, hint: URL_HINT },
          ),
        ],
      }),
      kit.rich(
        'How to help line',
        ['comingUp', 'howToHelp'],
        () => letter.comingUp.howToHelp,
        (v: RichText) => (letter.comingUp.howToHelp = v),
        2,
      ),
      kit.buttonGroup(
        'Button at the bottom',
        ['comingUp', 'button'],
        () => letter.comingUp.button,
        (v) => (letter.comingUp.button = v),
        'A full-width button under the list.',
      ),
    ],
  );

  const horizon = optionalSection(
    'horizon',
    'Dates further ahead. No links here, except the year at a glance.',
    [
      kit.repeater<HorizonItem>({
        noun: 'date',
        addLabel: 'Add a date',
        arrayPath: ['horizon', 'items'],
        items: letter.horizon.items,
        create: () => ({ date: defaultItemDate(letter.issue), text: '' }),
        body: (item, _i, path) => [
          dateTimeField(item, false),
          kit.text(
            'What is happening',
            [...path, 'text'],
            () => item.text,
            (v) => (item.text = v),
          ),
        ],
      }),
      kit.text(
        'Year at a glance link text',
        ['horizon', 'yearLinkText'],
        () => letter.horizon.yearLinkText,
        (v) => (letter.horizon.yearLinkText = v),
        { hint: 'The link address comes from Settings.' },
      ),
    ],
    LETTER_HEADINGS.horizon,
  );

  const feedback = sectionCard(
    'Feedback',
    'A question and a reply link. This section is always in the letter. The reply goes to the address in Settings.',
    [
      kit.text(
        'Question',
        ['feedback', 'question'],
        () => letter.feedback.question,
        (v) => (letter.feedback.question = v),
        { rows: 2 },
      ),
      kit.text(
        'Reply link text',
        ['feedback', 'linkText'],
        () => letter.feedback.linkText,
        (v) => (letter.feedback.linkText = v),
      ),
      kit.text(
        'Subject of the reply email',
        ['feedback', 'subject'],
        () => letter.feedback.subject,
        (v) => (letter.feedback.subject = v),
      ),
      kit.text(
        'Start of the reply email',
        ['feedback', 'body'],
        () => letter.feedback.body,
        (v) => (letter.feedback.body = v),
        { rows: 3, hint: 'This is already typed in when a family taps the reply link.' },
      ),
      kit.text(
        'Small note',
        ['feedback', 'note'],
        () => letter.feedback.note,
        (v) => (letter.feedback.note = v),
        { rows: 2 },
      ),
    ],
  );

  const signOff = sectionCard('Sign-off', 'One bold line at the end.', [
    kit.text(
      'Sign-off line',
      ['signOff'],
      () => letter.signOff,
      (v) => (letter.signOff = v),
    ),
  ]);

  const footer = el('section', { className: 'card letter-section' }, [
    el('h3', { textContent: 'Footer' }),
    el('p', {
      className: 'hint',
      textContent:
        'The footer is added for you. The pack links and contact email come from Settings, so there is nothing to fill in here.',
    }),
  ]);

  element.append(
    masthead.element,
    summary.element,
    intro.element,
    story.element,
    closing,
    photoAsk,
    around,
    coming.element,
    horizon,
    feedback.element,
    signOff.element,
    footer,
  );
  return { element, setField: kit.setField, fieldControl: kit.fieldControl, flush: kit.flush };
}
