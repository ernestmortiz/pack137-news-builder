/**
 * The form for each of the five layouts (build spec 7.2). `buildForm` reads the form object it is
 * given and edits that same object as the person types.
 */
import type {
  AnnouncementForm,
  DateField,
  DateRow,
  DateSection,
  LinkItem,
  RichText,
  Tag,
} from '../core/forms';
import { ALT_HELP, altFeedback } from './alt-ui';
import { el, uid } from './dom';
import { boxedMoved, boxedRemoved, isBoxed, setBoxed } from './boxed';
import { shrinkControl } from './photo-shrink';
import { markSpelling } from './field-kinds';
import { createKit, type FormContext, type Kit } from './form-kit';
import { dateWithYear, fromIsoDate, toIsoDate } from './paths';

export interface FormView {
  element: HTMLElement;
  /** Redraw the warning text beside fields after a change. */
  refreshWarnings(): void;
  /** Redraw the suggestion buttons from the form as it is now. Fields are not touched. */
  refreshSuggestions(): void;
  /** Put text in a field on screen without redrawing. False if the field is not there. */
  setField(path: (string | number)[], value: string, selection: [number, number]): boolean;
  /** The control for a field on screen, if any. */
  fieldControl(path: (string | number)[]): HTMLElement | null;
  /** Bring the form up to date with text typed a moment ago. Call before reading the form. */
  flush(): void;
}

/* ---------- pieces shared by layouts ---------- */

function cardFields(kit: Kit, form: AnnouncementForm): HTMLElement {
  return kit.group('The card', [
    kit.text(
      'Label (the small tag at the top)',
      ['label'],
      () => form.label,
      (v) => (form.label = v),
      { hint: 'For example: Pack calendar, Help needed, News.' },
    ),
    kit.text(
      'Title',
      ['title'],
      () => form.title,
      (v) => (form.title = v),
    ),
  ]);
}

/** The yellow-box setting that goes with each paragraph of a list. */
export interface ParagraphBox {
  get(index: number): boolean;
  set(index: number, on: boolean): void;
  moved(from: number, to: number): void;
  removed(index: number): void;
}

const BOX_HINT =
  'Puts this paragraph in a pale-yellow box. Use it for the one thing people must not miss.';

/** The "Yellow box" tick under a paragraph. The hint shows under the first paragraph only. */
function boxRow(kit: Kit, box: ParagraphBox, index: number): HTMLElement {
  const tick = kit.checkbox(
    'Yellow box',
    () => box.get(index),
    (on) => box.set(index, on),
  );
  const hintId = uid('hint');
  if (index === 0) tick.input.setAttribute('aria-describedby', hintId);
  return el('div', { className: 'field' }, [
    tick.wrapper,
    ...(index === 0 ? [el('p', { className: 'hint', id: hintId, textContent: BOX_HINT })] : []),
  ]);
}

/**
 * A repeater over a list of rich text. The list lives in the form as `RichText[]`, so editing
 * writes straight into that array by index.
 */
export function paragraphs(
  kit: Kit,
  noun: string,
  addLabel: string,
  arrayPath: (string | number)[],
  list: RichText[],
  box?: ParagraphBox,
): HTMLElement {
  return kit.repeater<RichText>({
    noun,
    addLabel,
    arrayPath,
    items: list,
    create: () => [],
    onMoved: box?.moved,
    onRemoved: box?.removed,
    body: (_item, index, path) => [
      kit.rich(
        `Text of ${noun} ${index + 1}`,
        path,
        () => list[index] ?? [],
        (v) => {
          list[index] = v;
        },
      ),
      ...(box ? [boxRow(kit, box, index)] : []),
    ],
  });
}

/* ---------- dates ---------- */

function dateField(
  kit: Kit,
  row: DateRow,
  path: (string | number)[],
  ctx: FormContext,
): HTMLElement {
  const datePath = [...path, 'date'];
  let stash: Pick<DateField, 'end' | 'struck'> = {};

  const startInput = el('input', {
    type: 'date',
    className: 'control date',
    id: `d-${path.join('-')}`,
  });
  markSpelling(startInput, 'date');
  startInput.value = row.date ? toIsoDate(row.date.start) : '';
  const startText = el('span', { className: 'date-note' });
  const endInput = el('input', {
    type: 'date',
    className: 'control date',
    id: `e-${path.join('-')}`,
  });
  markSpelling(endInput, 'date');
  endInput.value = row.date?.end ? toIsoDate(row.date.end) : '';
  const endText = el('span', { className: 'date-note' });
  const moved = kit.checkbox(
    'Moved (strike through)',
    () => row.date?.struck === true,
    (on) => {
      if (row.date === undefined) return;
      if (on) row.date.struck = true;
      else delete row.date.struck;
    },
  );

  function show(): void {
    const start = row.date?.start;
    startText.textContent = start
      ? dateWithYear(start)
      : 'No date: this row shows as a plain link.';
    const end = row.date?.end;
    if (end === undefined) endText.textContent = '';
    else if (start && toIsoDate(end) < toIsoDate(start))
      endText.textContent = 'This is before the first date.';
    else endText.textContent = `to ${dateWithYear(end)}`;
    endInput.disabled = start === undefined;
    moved.input.disabled = start === undefined;
  }

  startInput.addEventListener('change', () => {
    ctx.begin();
    const start = fromIsoDate(startInput.value);
    if (start === undefined) {
      if (row.date) stash = { end: row.date.end, struck: row.date.struck };
      delete row.date;
      endInput.value = '';
      moved.input.checked = false;
    } else {
      const next: DateField = { start };
      const end = row.date?.end ?? stash.end;
      const struck = row.date?.struck ?? stash.struck;
      if (end) next.end = end;
      if (struck) next.struck = true;
      row.date = next;
      endInput.value = end ? toIsoDate(end) : '';
      moved.input.checked = struck === true;
    }
    show();
    ctx.step('changed a date');
  });
  endInput.addEventListener('change', () => {
    if (row.date === undefined) return;
    ctx.begin();
    const end = fromIsoDate(endInput.value);
    if (end === undefined) delete row.date.end;
    else row.date.end = end;
    show();
    ctx.step('changed an end date');
  });
  moved.input.addEventListener('change', show);
  show();

  const startLabel = el('label', {
    htmlFor: startInput.id,
    className: 'label',
    textContent: 'Date',
  });
  const endLabel = el('label', {
    htmlFor: endInput.id,
    className: 'label',
    textContent: 'End date (optional)',
  });
  return kit.group(
    'Date',
    [
      el('div', { className: 'field' }, [startLabel, startInput, startText]),
      el('div', { className: 'field' }, [endLabel, endInput, endText]),
      moved.wrapper,
      el('p', { className: 'hint', textContent: 'Leave the date empty to show a plain link row.' }),
      kit.markerList(datePath, `dm-${path.join('-')}`),
    ],
    'date-group',
  );
}

function tagsEditor(kit: Kit, row: DateRow, rowPath: (string | number)[]): HTMLElement {
  const tags: Tag[] = row.tags;
  return kit.group('Tags', [
    kit.repeater<Tag>({
      noun: 'tag',
      addLabel: 'Add a tag',
      arrayPath: [...rowPath, 'tags'],
      items: tags,
      compact: true,
      create: () => ({ text: '', strength: 'quiet' }),
      body: (tag, i, path) => [
        kit.text(
          'Tag text',
          [...path, 'text'],
          () => tags[i]?.text ?? tag.text,
          (v) => {
            const t = tags[i];
            if (t) t.text = v;
          },
          { hint: 'For example: Virtual, In person, TBD, Please RSVP.' },
        ),
        kit.select(
          'Tag style',
          [...path, 'strength'],
          [
            { value: 'quiet', label: 'Quiet (light)' },
            { value: 'strong', label: 'Strong (dark, stands out)' },
          ],
          () => tags[i]?.strength ?? tag.strength,
          (v) => {
            const t = tags[i];
            if (t) t.strength = v;
          },
        ),
      ],
    }),
  ]);
}

function rowFields(kit: Kit, row: DateRow, path: (string | number)[], ctx: FormContext): Node[] {
  return [
    dateField(kit, row, path, ctx),
    kit.text(
      'Event',
      [...path, 'event'],
      () => row.event,
      (v) => (row.event = v),
    ),
    kit.text(
      'Event link',
      [...path, 'url'],
      () => row.url,
      (v) => (row.url = v),
      { url: true, hint: 'Starts with https:// or mailto:' },
    ),
    tagsEditor(kit, row, path),
    kit.rich(
      'Note (a small line under the event)',
      [...path, 'note'],
      () => row.note,
      (v) => (row.note = v),
      2,
    ),
  ];
}

function sectionFields(
  kit: Kit,
  section: DateSection,
  path: (string | number)[],
  ctx: FormContext,
): Node[] {
  const subtitle = kit.text(
    'Subtitle (a small line under the heading)',
    [...path, 'subtitle'],
    () => section.subtitle,
    (v) => (section.subtitle = v),
    { hint: 'Shown only for a quiet box.' },
  );
  subtitle.hidden = section.style !== 'quiet';
  return [
    kit.text(
      'Section name',
      [...path, 'name'],
      () => section.name,
      (v) => (section.name = v),
      { hint: 'Leave empty for no heading.' },
    ),
    kit.select(
      'Section style',
      [...path, 'style'],
      [
        { value: 'plain', label: 'Plain (no box)' },
        { value: 'highlight', label: 'Highlighted box (gold)' },
        { value: 'quiet', label: 'Quiet box (light)' },
      ],
      () => section.style,
      (v) => (section.style = v),
      (v) => {
        subtitle.hidden = v !== 'quiet';
      },
    ),
    subtitle,
    kit.repeater<DateRow>({
      noun: 'row',
      addLabel: 'Add a row',
      arrayPath: [...path, 'rows'],
      items: section.rows,
      create: () => ({ event: '', url: '', tags: [], note: [] }),
      body: (row, _i, rowPath) => rowFields(kit, row, rowPath, ctx),
    }),
  ];
}

/* ---------- the five layouts ---------- */

function layoutFields(kit: Kit, form: AnnouncementForm, ctx: FormContext): HTMLElement[] {
  switch (form.layout) {
    case 'message':
      return [
        cardFields(kit, form),
        kit.group('Text', [
          paragraphs(kit, 'paragraph', 'Add a paragraph', ['paragraphs'], form.paragraphs, {
            get: (i) => isBoxed(form, i),
            set: (i, on) => setBoxed(form, i, on),
            moved: (from, to) => boxedMoved(form, from, to),
            removed: (i) => boxedRemoved(form, i),
          }),
        ]),
        kit.buttonGroup(
          'Button (optional)',
          ['button'],
          () => form.button,
          (v) => (form.button = v),
          'Leave both empty for no button.',
        ),
      ];
    case 'call-to-action':
      return [
        cardFields(kit, form),
        kit.group('Text', [
          kit.rich(
            'Paragraph',
            ['paragraph'],
            () => form.paragraph,
            (v) => (form.paragraph = v),
            4,
          ),
          el('div', { className: 'field' }, [
            kit.checkbox(
              'Yellow box',
              () => form.boxed === true,
              (on) => {
                if (on) form.boxed = true;
                else delete form.boxed;
              },
            ).wrapper,
            el('p', { className: 'hint', textContent: BOX_HINT }),
          ]),
        ]),
        kit.buttonGroup(
          'Button',
          ['button'],
          () => form.button,
          (v) => (form.button = v),
          'The one thing you want people to do.',
        ),
      ];
    case 'link-list': {
      const altCount = altFeedback(
        () => form.image?.alt ?? '',
        () => undefined,
        false,
      );
      const pictureSrc = kit.text(
        'Picture address',
        ['image', 'src'],
        () => form.image?.src ?? '',
        (v) => setImage(form, { src: v }),
        {
          url: true,
          hint: 'Upload the picture in TroopTrack, then paste its address here. Photo too big? Use Shrink a photo first. The preview shows a box instead of the picture.',
        },
      );
      pictureSrc.append(shrinkControl('Shrink a photo'));
      return [
        cardFields(kit, form),
        kit.group('Intro', [
          kit.rich(
            'Intro',
            ['intro'],
            () => form.intro,
            (v) => (form.intro = v),
          ),
        ]),
        kit.group('Picture (optional)', [
          pictureSrc,
          kit.text(
            'Picture description',
            ['image', 'alt'],
            () => form.image?.alt ?? '',
            (v) => {
              setImage(form, { alt: v });
              altCount.update();
            },
            { hint: ALT_HELP },
          ),
          altCount.node,
        ]),
        kit.group('Links', [
          kit.repeater<LinkItem>({
            noun: 'link',
            addLabel: 'Add a link',
            arrayPath: ['items'],
            items: form.items,
            create: () => ({ text: '', url: '', note: '' }),
            body: (item, _i, path) => [
              kit.text(
                'Link text',
                [...path, 'text'],
                () => item.text,
                (v) => (item.text = v),
              ),
              kit.text(
                'Link address',
                [...path, 'url'],
                () => item.url,
                (v) => (item.url = v),
                { url: true, hint: 'Starts with https:// or mailto:' },
              ),
              kit.text(
                'Source or contact note (optional)',
                [...path, 'note'],
                () => item.note,
                (v) => (item.note = v),
              ),
            ],
          }),
        ]),
      ];
    }
    case 'date-list':
      return [
        cardFields(kit, form),
        kit.group('Sections', [
          kit.repeater<DateSection>({
            noun: 'section',
            addLabel: 'Add a section',
            arrayPath: ['sections'],
            items: form.sections,
            create: () => ({ name: '', style: 'plain', subtitle: '', rows: [] }),
            body: (section, _i, path) => sectionFields(kit, section, path, ctx),
          }),
        ]),
      ];
    case 'help-wanted':
      return [
        cardFields(kit, form),
        kit.group('Intro', [
          kit.rich(
            'Intro',
            ['intro'],
            () => form.intro,
            (v) => (form.intro = v),
          ),
        ]),
        kit.group('The highlighted request', [
          kit.text(
            'Tag on the request',
            ['ask', 'badge'],
            () => form.ask.badge,
            (v) => (form.ask.badge = v),
            { hint: 'For example: Highest need.' },
          ),
          kit.text(
            'Request title',
            ['ask', 'title'],
            () => form.ask.title,
            (v) => (form.ask.title = v),
          ),
          paragraphs(
            kit,
            'request paragraph',
            'Add a paragraph',
            ['ask', 'paragraphs'],
            form.ask.paragraphs,
          ),
          kit.buttonGroup(
            'Help button',
            ['ask', 'button'],
            () => form.ask.button,
            (v) => (form.ask.button = v),
            'Usually an email link so people can reply.',
          ),
        ]),
        kit.group('Closing', [
          kit.rich(
            'Closing line (before the second button)',
            ['outro'],
            () => form.outro,
            (v) => (form.outro = v),
          ),
          kit.buttonGroup(
            'Second button (optional)',
            ['secondary'],
            () => form.secondary,
            (v) => (form.secondary = v),
            'Leave both empty for no second button.',
          ),
        ]),
      ];
  }
}

function setImage(
  form: Extract<AnnouncementForm, { layout: 'link-list' }>,
  part: { src?: string; alt?: string },
): void {
  const next = { src: form.image?.src ?? '', alt: form.image?.alt ?? '', ...part };
  if (next.src === '' && next.alt === '') delete form.image;
  else form.image = next;
}

export function buildForm(form: AnnouncementForm, ctx: FormContext): FormView {
  const kit = createKit(ctx);
  const element = el('div', { className: 'form' });
  const fields = layoutFields(kit, form, ctx);
  element.append(...fields);
  element.prepend(kit.leftovers());
  return {
    element,
    refreshWarnings: kit.refreshWarnings,
    refreshSuggestions: kit.refreshSuggestions,
    setField: kit.setField,
    fieldControl: kit.fieldControl,
    flush: kit.flush,
  };
}
