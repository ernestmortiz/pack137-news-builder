/**
 * "Edit on the card": the announcement drawn as a card in the page itself, with the same colors and
 * order as the email (build spec 6.1). Words are edited in place. Things that change the shape of
 * the card (adding, moving or removing rows, dates, addresses, colors, the yellow box, the picture)
 * stay in the form, and each has a small "Change in the form" button that jumps there.
 *
 * This is a drawing for editing, not the email. The email comes from the renderer, and the preview
 * frames stay the final check. Nothing here is written as HTML: every piece is made with DOM calls,
 * and the card never loads a picture or opens a link.
 *
 * It edits the same form object through the same FormContext as the form view, so undo, redo, the
 * draft and the output behave the same in both. Empty fields show a placeholder (a hint drawn by
 * the browser, never part of the form value, so it is never in the output).
 */
import type { CheckMe, FieldPath, Suggestion } from '../core/fill';
import { warningPath } from './paths';
import type { AnnouncementForm, ButtonField, DateRow, DateSection, RichText } from '../core/forms';
import { previewWidths } from '../config/tokens';
import { dateText, safeUrl } from '../templates/components';
import { el, clear, uid } from './dom';
import { isBoxed } from './boxed';
import { createKit, type FormContext, type Kit } from './form-kit';
import type { FormView } from './form-view';

export interface CardViewOptions {
  /** Switch to the form and put the keyboard on the control for this path. */
  openInForm(path: FieldPath): void;
  /** The card width to start with, in pixels. */
  width: number;
  /** The person picked another width. */
  onWidth(width: number): void;
}

/** One thing to look at, shown above the card. */
interface Note {
  key: string;
  message: string;
  path: FieldPath;
  fix?: Suggestion;
}

/* ---------- small pieces ---------- */

function openButton(options: CardViewOptions, what: string, path: FieldPath): HTMLButtonElement {
  const button = el('button', {
    type: 'button',
    className: 'btn small quiet ec-open',
    textContent: 'Change in the form',
  });
  button.setAttribute('aria-label', `Change in the form: ${what}`);
  button.addEventListener('click', () => options.openInForm(path));
  return button;
}

/** A name for a group of fields, read out by a screen reader like a form group's legend. */
function group(name: string, className: string, children: (Node | null)[]): HTMLElement {
  const node = el('div', { className }, children);
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', name);
  return node;
}

/* ---------- the pieces of each layout ---------- */

function buildBody(
  kit: Kit,
  form: AnnouncementForm,
  options: CardViewOptions,
): (HTMLElement | null)[] {
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
    get: () => RichText,
    set: (value: RichText) => void,
    placeholder: string,
    className?: string,
  ) => kit.cardRich(label, path, get, set, { placeholder, className });

  /** A button as the email draws it, with its words editable and a jump for the rest. */
  const button = (
    legend: string,
    path: FieldPath,
    get: () => ButtonField | undefined,
    set: (value: ButtonField) => void,
  ): HTMLElement => {
    const current = (): ButtonField => get() ?? { text: '', url: '' };
    return group(legend, 'ec-actions', [
      el('div', { className: get()?.color === 'gold' ? 'ec-btn gold' : 'ec-btn' }, [
        text(
          'Button text',
          [...path, 'text'],
          () => current().text,
          (v) => set({ ...current(), text: v }),
          'Button text',
        ),
      ]),
      openButton(options, `address and color of ${legend.toLowerCase()}`, [...path, 'url']),
    ]);
  };

  /** Date list rows, links and the like share this row shape. */
  const dateRow = (row: DateRow, rowPath: FieldPath, n: number): HTMLElement => {
    const when = dateText(row.date);
    const isLink = safeUrl(row.url) !== null;
    const what = `date, link and tags of row ${n}`;
    const eventField = text(
      'Event',
      [...rowPath, 'event'],
      () => row.event,
      (v) => (row.event = v),
      'Add an event name',
      isLink ? 'ec-event is-link' : 'ec-event',
    );
    const parts: (Node | null)[] = [];
    if (when !== null) {
      parts.push(
        el('div', { className: 'ec-row-top' }, [
          el('span', {
            className: row.date?.struck === true ? 'ec-pill ec-date is-struck' : 'ec-pill ec-date',
            textContent: when,
          }),
          openButton(options, what, [...rowPath, 'date']),
        ]),
        eventField,
      );
    } else {
      parts.push(
        el('div', { className: 'ec-line' }, [
          eventField,
          openButton(options, what, [...rowPath, 'url']),
        ]),
      );
    }
    if (row.tags.length > 0) {
      parts.push(
        group(
          'Tags',
          'ec-tags',
          row.tags.map((tag, i) =>
            text(
              'Tag text',
              [...rowPath, 'tags', i, 'text'],
              () => row.tags[i]?.text ?? tag.text,
              (v) => {
                const t = row.tags[i];
                if (t) t.text = v;
              },
              'Tag',
              tag.strength === 'strong' ? 'ec-pill ec-tag strong' : 'ec-pill ec-tag',
            ),
          ),
        ),
      );
    }
    parts.push(
      rich(
        'Note (a small line under the event)',
        [...rowPath, 'note'],
        () => row.note,
        (v) => (row.note = v),
        'Add a note',
        'ec-note',
      ),
    );
    return group(`Row ${n}`, 'ec-row', parts);
  };

  const section = (s: DateSection, path: FieldPath, n: number): HTMLElement => {
    const heading: (HTMLElement | null)[] = [];
    if (s.style === 'highlight') {
      heading.push(
        text(
          'Section name',
          [...path, 'name'],
          () => s.name,
          (v) => (s.name = v),
          'Add a section name (optional)',
          'ec-pill ec-pill-strong',
        ),
      );
    } else {
      heading.push(
        text(
          'Section name',
          [...path, 'name'],
          () => s.name,
          (v) => (s.name = v),
          'Add a section name (optional)',
          s.style === 'quiet' ? 'ec-panel-name' : 'ec-section-name',
        ),
      );
    }
    if (s.style === 'quiet') {
      heading.push(
        text(
          'Subtitle (a small line under the heading)',
          [...path, 'subtitle'],
          () => s.subtitle,
          (v) => (s.subtitle = v),
          'Add a subtitle (optional)',
          'ec-subtitle',
        ),
      );
    }
    const rows = s.rows.map((row, i) => dateRow(row, [...path, 'rows', i], i + 1));
    return group(`Section ${n}`, `ec-section ${s.style}`, [
      ...heading,
      ...(rows.length > 0
        ? [el('div', { className: 'ec-rows' }, rows)]
        : [el('p', { className: 'ec-empty', textContent: 'No rows in this section yet.' })]),
      openButton(options, `add, move or restyle the rows of section ${n}`, [...path, 'style']),
    ]);
  };

  switch (form.layout) {
    case 'message': {
      const parts: HTMLElement[] = [];
      let open: HTMLElement | null = null;
      form.paragraphs.forEach((runs, i) => {
        const field = rich(
          `Text of paragraph ${i + 1}`,
          ['paragraphs', i],
          () => form.paragraphs[i] ?? runs,
          (v) => {
            form.paragraphs[i] = v;
          },
          'Add some text',
        );
        if (isBoxed(form, i)) {
          // Boxed paragraphs next to each other share one box, as in the email.
          if (open === null) {
            open = el('div', { className: 'ec-box' });
            parts.push(open);
          }
          open.append(field);
        } else {
          open = null;
          parts.push(field);
        }
      });
      if (parts.length === 0) {
        parts.push(el('p', { className: 'ec-empty', textContent: 'No paragraphs yet.' }));
      }
      return [
        ...parts,
        openButton(options, 'add, move or remove paragraphs, or put one in a yellow box', [
          'paragraphs',
        ]),
        button(
          'Button',
          ['button'],
          () => form.button,
          (v) => (form.button = v),
        ),
      ];
    }
    case 'call-to-action': {
      const field = rich(
        'Paragraph',
        ['paragraph'],
        () => form.paragraph,
        (v) => (form.paragraph = v),
        'Add some text',
      );
      return [
        form.boxed === true ? el('div', { className: 'ec-box' }, [field]) : field,
        openButton(options, 'the yellow box', ['paragraph']),
        button(
          'Button',
          ['button'],
          () => form.button,
          (v) => (form.button = v),
        ),
      ];
    }
    case 'link-list': {
      const image = form.image;
      return [
        image !== undefined && image.src !== ''
          ? el('div', { className: 'ec-photo' }, [
              el('strong', { textContent: 'Picture' }),
              image.alt !== '' ? el('span', { textContent: ` ${image.alt}` }) : null,
            ])
          : null,
        openButton(options, 'add or change the picture', ['image', 'src']),
        rich(
          'Intro',
          ['intro'],
          () => form.intro,
          (v) => (form.intro = v),
          'Add an intro (optional)',
        ),
        form.items.length > 0
          ? el(
              'div',
              { className: 'ec-rows' },
              form.items.map((item, i) => {
                const path: FieldPath = ['items', i];
                return group(`Link ${i + 1}`, 'ec-row', [
                  el('div', { className: 'ec-line' }, [
                    text(
                      'Link text',
                      [...path, 'text'],
                      () => item.text,
                      (v) => (item.text = v),
                      'Add the link words',
                      safeUrl(item.url) !== null ? 'ec-event is-link' : 'ec-event',
                    ),
                    openButton(options, `address of link ${i + 1}`, [...path, 'url']),
                  ]),
                  text(
                    'Source or contact note (optional)',
                    [...path, 'note'],
                    () => item.note,
                    (v) => (item.note = v),
                    'Add a source or contact note (optional)',
                    'ec-small-note',
                  ),
                ]);
              }),
            )
          : el('p', { className: 'ec-empty', textContent: 'No links yet.' }),
        openButton(options, 'add, move or remove links', ['items']),
      ];
    }
    case 'date-list':
      return [
        ...form.sections.map((s, i) => section(s, ['sections', i], i + 1)),
        form.sections.length === 0
          ? el('p', { className: 'ec-empty', textContent: 'No sections yet.' })
          : null,
        openButton(options, 'add, move or remove sections', ['sections']),
      ];
    case 'help-wanted': {
      const ask = form.ask;
      return [
        rich(
          'Intro',
          ['intro'],
          () => form.intro,
          (v) => (form.intro = v),
          'Add an intro (optional)',
        ),
        group('The highlighted request', 'ec-box ec-ask', [
          text(
            'Tag on the request',
            ['ask', 'badge'],
            () => ask.badge,
            (v) => (ask.badge = v),
            'Add a tag',
            'ec-pill ec-pill-strong',
          ),
          text(
            'Request title',
            ['ask', 'title'],
            () => ask.title,
            (v) => (ask.title = v),
            'Add a request title',
            'ec-ask-title',
          ),
          ...ask.paragraphs.map((runs, i) =>
            rich(
              `Text of request paragraph ${i + 1}`,
              ['ask', 'paragraphs', i],
              () => ask.paragraphs[i] ?? runs,
              (v) => {
                ask.paragraphs[i] = v;
              },
              'Add some text',
            ),
          ),
          openButton(options, 'add, move or remove request paragraphs', ['ask', 'paragraphs']),
          button(
            'Help button',
            ['ask', 'button'],
            () => ask.button,
            (v) => (ask.button = v),
          ),
        ]),
        rich(
          'Closing line (before the second button)',
          ['outro'],
          () => form.outro,
          (v) => (form.outro = v),
          'Add a closing line (optional)',
        ),
        button(
          'Second button (optional)',
          ['secondary'],
          () => form.secondary,
          (v) => (form.secondary = v),
        ),
      ];
    }
  }
}

/* ---------- the whole view ---------- */

export function buildCardView(
  form: AnnouncementForm,
  ctx: FormContext,
  options: CardViewOptions,
): FormView {
  const kit = createKit(ctx, () => false);

  const header = group('The card', 'ec-head', [
    kit.cardText(
      'Label (the small tag at the top)',
      ['label'],
      () => form.label,
      (v) => (form.label = v),
      { placeholder: 'Add a label', className: 'ec-pill ec-label' },
    ),
    kit.cardText(
      'Title',
      ['title'],
      () => form.title,
      (v) => (form.title = v),
      { placeholder: 'Add a title', className: 'ec-title' },
    ),
  ]);
  const body = el('div', { className: 'ec-body' }, buildBody(kit, form, options));
  const card = el('div', { className: 'ec' }, [header, body]);
  card.style.maxWidth = `${options.width}px`;

  /* ---------- card width ---------- */
  const widthButtons = previewWidths.map((width) => {
    const button = el('button', {
      type: 'button',
      className: 'btn small',
      textContent: `${width} px`,
    });
    button.setAttribute('aria-label', `Card width ${width} pixels`);
    button.setAttribute('aria-pressed', String(width === options.width));
    button.addEventListener('click', () => {
      card.style.maxWidth = `${width}px`;
      widthButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      options.onWidth(width);
    });
    return button;
  });
  const widthId = uid('card-width');
  const tools = el('div', { className: 'ec-tools' }, [
    el('span', { className: 'label', id: widthId, textContent: 'Card width' }),
    ...widthButtons,
  ]);
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-labelledby', widthId);

  /* ---------- things to check ---------- */
  const notesHeading = el('h3', { className: 'ec-notes-title' });
  const notesList = el('ul', { className: 'ec-notes-list' });
  const notes = el('section', { className: 'ec-notes' }, [notesHeading, notesList]);
  notes.setAttribute('aria-labelledby', (notesHeading.id = uid('notes')));
  let shownKey = '\u0000';

  function currentNotes(): Note[] {
    const list: Note[] = [];
    const checks: CheckMe[] = ctx.checks();
    for (const check of checks) {
      // "Add a label" style notes go once the field has words, as in the form.
      if (check.kind === 'missing' && kit.fieldText(check.path).trim() !== '') continue;
      list.push({ key: `c${list.length}`, message: check.message, path: check.path });
    }
    for (const fix of ctx.suggestions()) {
      list.push({ key: `s${list.length}`, message: fix.message, path: fix.path, fix });
    }
    for (const warning of ctx.warnings()) {
      const at = warningPath(warning);
      if (at !== undefined)
        list.push({ key: `w${list.length}`, message: warning.message, path: at });
    }
    return list;
  }

  function refreshNotes(): void {
    const list = currentNotes();
    const key = list.map((n) => `${n.key}\u0001${n.message}`).join('\u0002');
    if (key === shownKey) return;
    shownKey = key;
    notes.hidden = list.length === 0;
    notesHeading.textContent = `Things to check (${list.length})`;
    clear(notesList);
    for (const note of list) {
      const show = el('button', {
        type: 'button',
        className: 'btn small',
        textContent: 'Show in the form',
      });
      show.setAttribute('aria-label', `Show in the form: ${note.message}`);
      show.addEventListener('click', () => options.openInForm(note.path));
      const buttons: HTMLElement[] = [show];
      const fix = note.fix;
      if (fix) {
        const apply = el('button', {
          type: 'button',
          className: 'btn small',
          textContent: 'Make this change',
        });
        apply.setAttribute('aria-label', `Make this change: ${note.message}`);
        apply.addEventListener('click', () => ctx.apply(fix));
        buttons.unshift(apply);
      }
      notesList.append(
        el('li', {}, [
          el('span', { className: 'ec-note-text', textContent: note.message }),
          el('span', { className: 'ec-note-actions' }, buttons),
        ]),
      );
    }
  }
  refreshNotes();

  const element = el('div', { className: 'card-view' }, [notes, tools, card]);
  return {
    element,
    refreshWarnings() {
      kit.refreshWarnings();
      refreshNotes();
    },
    refreshSuggestions() {
      kit.refreshSuggestions();
      refreshNotes();
    },
    setField: kit.setField,
    fieldControl: kit.fieldControl,
    fieldText: kit.fieldText,
    flush: kit.flush,
    focusPath: kit.focusPath,
  };
}
