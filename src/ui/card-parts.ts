/**
 * Pieces shared by the two card views (the weekly announcement in card-view.ts and the monthly
 * letter in letter-card.ts): the "Change in the form" button, a named group, the card width
 * control, and the list of things to look at above the card. Everything is made with DOM calls.
 */
import type { FieldPath, Suggestion } from '../core/fill';
import { previewWidths } from '../config/tokens';
import { clear, el, uid } from './dom';

/** A small button that jumps to a field in the form. Quiet until its row or block is in use. */
export function openButton(
  openInForm: (path: FieldPath) => void,
  what: string,
  path: FieldPath,
): HTMLButtonElement {
  const button = el('button', {
    type: 'button',
    className: 'btn small quiet ec-open',
    textContent: 'Change in the form',
  });
  button.setAttribute('aria-label', `Change in the form: ${what}`);
  button.addEventListener('click', () => openInForm(path));
  return button;
}

/** A name for a group of fields, read out by a screen reader like a form group's legend. */
export function group(name: string, className: string, children: (Node | null)[]): HTMLElement {
  const node = el('div', { className }, children);
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', name);
  return node;
}

/** The 250, 375 and 600 pixel buttons. They resize `card` at once and tell `onWidth`. */
export function widthTools(
  card: HTMLElement,
  start: number,
  onWidth: (width: number) => void,
): HTMLElement {
  const buttons = previewWidths.map((width) => {
    const button = el('button', {
      type: 'button',
      className: 'btn small',
      textContent: `${width} px`,
    });
    button.setAttribute('aria-label', `Card width ${width} pixels`);
    button.setAttribute('aria-pressed', String(width === start));
    button.addEventListener('click', () => {
      card.style.maxWidth = `${width}px`;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      onWidth(width);
    });
    return button;
  });
  const widthId = uid('card-width');
  const tools = el('div', { className: 'ec-tools' }, [
    el('span', { className: 'label', id: widthId, textContent: 'Card width' }),
    ...buttons,
  ]);
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-labelledby', widthId);
  card.style.maxWidth = `${start}px`;
  return tools;
}

/** One thing to look at, shown above the card. */
export interface CardNote {
  key: string;
  message: string;
  path: FieldPath;
  fix?: Suggestion;
}

export interface NotesPanel {
  element: HTMLElement;
  /** Redraws the list from `notes()`. Does nothing when nothing changed. */
  refresh(): void;
}

/**
 * The yellow list above the card: each note says what to look at and has "Show in the form". A note
 * with a one-tap fix also has "Make this change". Hidden while there is nothing to look at.
 */
export function createNotesPanel(options: {
  /** "Things to check" or "Things to look at". The count is added. */
  title: string;
  notes(): CardNote[];
  openInForm(path: FieldPath): void;
  apply?(fix: Suggestion): void;
}): NotesPanel {
  const heading = el('h3', { className: 'ec-notes-title' });
  const list = el('ul', { className: 'ec-notes-list' });
  const element = el('section', { className: 'ec-notes' }, [heading, list]);
  element.setAttribute('aria-labelledby', (heading.id = uid('notes')));
  let shownKey = '\u0000';

  function refresh(): void {
    const notes = options.notes();
    const key = notes.map((n) => `${n.key}\u0001${n.message}`).join('\u0002');
    if (key === shownKey) return;
    shownKey = key;
    element.hidden = notes.length === 0;
    heading.textContent = `${options.title} (${notes.length})`;
    clear(list);
    for (const note of notes) {
      const show = el('button', {
        type: 'button',
        className: 'btn small',
        textContent: 'Show in the form',
      });
      show.setAttribute('aria-label', `Show in the form: ${note.message}`);
      show.addEventListener('click', () => options.openInForm(note.path));
      const buttons: HTMLElement[] = [show];
      const fix = note.fix;
      if (fix && options.apply) {
        const apply = options.apply;
        const make = el('button', {
          type: 'button',
          className: 'btn small',
          textContent: 'Make this change',
        });
        make.setAttribute('aria-label', `Make this change: ${note.message}`);
        make.addEventListener('click', () => apply(fix));
        buttons.unshift(make);
      }
      list.append(
        el('li', {}, [
          el('span', { className: 'ec-note-text', textContent: note.message }),
          el('span', { className: 'ec-note-actions' }, buttons),
        ]),
      );
    }
  }
  refresh();
  return { element, refresh };
}
