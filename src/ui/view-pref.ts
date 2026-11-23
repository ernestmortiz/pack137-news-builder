/**
 * Which way the weekly announcement and the monthly letter are edited: on a drawing of the card, or
 * in the form. One choice is shared by both screens and remembered on this device. It is kept out of DeviceStorage (it is not saved work), and
 * every call is wrapped because storage can be blocked (private windows). A blocked store just
 * means "card", kept in memory for the visit.
 */
import { el, uid } from './dom';
import { browserStore, type KeyValueStore } from './storage';

export const EDIT_VIEW_KEY = 'pack137:edit-view';

export type EditView = 'card' | 'form';

export interface ViewPref {
  get(): EditView;
  set(view: EditView): void;
  /** Called after the value is set. Returns a function that stops listening. */
  subscribe(listener: (view: EditView) => void): () => void;
}

export function createViewPref(getStore: () => KeyValueStore | undefined = browserStore): ViewPref {
  let value: EditView | undefined;
  const listeners = new Set<(view: EditView) => void>();
  const read = (): EditView => {
    try {
      return getStore()?.getItem(EDIT_VIEW_KEY) === 'form' ? 'form' : 'card';
    } catch {
      return 'card';
    }
  };
  return {
    get() {
      value ??= read();
      return value;
    },
    set(view) {
      value = view;
      try {
        const store = getStore();
        if (store) {
          if (view === 'form') store.setItem(EDIT_VIEW_KEY, 'form');
          else store.removeItem(EDIT_VIEW_KEY);
        }
      } catch {
        // Blocked or full. The choice still holds until the page is closed.
      }
      for (const listener of [...listeners]) listener(view);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The one shared choice for the page. */
export const viewPref = createViewPref();

export interface ViewSwitch {
  element: HTMLElement;
  /** Shows which way is on. Does not call `onChange`. */
  show(view: EditView): void;
  /** The button of the way that is on, for keeping keyboard focus. */
  active(): HTMLButtonElement;
}

const CHOICES: { view: EditView; text: string }[] = [
  { view: 'card', text: 'Edit on the card' },
  { view: 'form', text: 'Edit in the form' },
];

/**
 * Two buttons side by side, labelled in plain words. The one that is on says so with aria-pressed.
 * The arrow keys move between them, and Tab, Enter and Space work as on any button.
 */
export function createViewSwitch(start: EditView, onChange: (view: EditView) => void): ViewSwitch {
  const buttons = new Map<EditView, HTMLButtonElement>();
  const element = el('div', { className: 'view-switch' });
  element.setAttribute('role', 'group');
  const legendId = uid('view-legend');
  element.setAttribute('aria-labelledby', legendId);
  element.append(
    el('p', { className: 'label', id: legendId, textContent: 'How do you want to edit?' }),
  );
  const row = el('div', { className: 'view-switch-row' });
  for (const choice of CHOICES) {
    const button = el('button', {
      type: 'button',
      className: 'btn view-choice',
      textContent: choice.text,
    });
    button.addEventListener('click', () => onChange(choice.view));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const other = CHOICES.find((c) => c.view !== choice.view);
      if (other) buttons.get(other.view)?.focus();
    });
    buttons.set(choice.view, button);
    row.append(button);
  }
  element.append(row);
  let on: EditView = start;
  const show = (view: EditView): void => {
    on = view;
    for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === view));
  };
  show(start);
  return {
    element,
    show,
    active: () => buttons.get(on) as HTMLButtonElement,
  };
}
