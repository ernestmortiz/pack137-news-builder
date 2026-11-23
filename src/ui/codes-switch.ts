/**
 * The "Show codes" choice. Off (the default) shows every rich text field as a box that displays
 * bold, italic, struck text and links as they will look. On shows the typed codes in a plain text
 * box, for anyone who prefers them. One choice is shared by the weekly and monthly screens and
 * remembered on this device. Storage can be blocked (private windows), so every call is wrapped
 * and a blocked store just means "off", kept in memory for the visit.
 */
import { el, uid } from './dom';
import { browserStore, type KeyValueStore } from './storage';

export const SHOW_CODES_KEY = 'pack137:show-codes';

export interface CodesPref {
  get(): boolean;
  set(on: boolean): void;
  /** Called after the value changes. Returns a function that stops listening. */
  subscribe(listener: (on: boolean) => void): () => void;
}

export function createCodesPref(
  getStore: () => KeyValueStore | undefined = browserStore,
): CodesPref {
  let value: boolean | undefined;
  const listeners = new Set<(on: boolean) => void>();
  const read = (): boolean => {
    try {
      return getStore()?.getItem(SHOW_CODES_KEY) === 'on';
    } catch {
      return false;
    }
  };
  return {
    get() {
      value ??= read();
      return value;
    },
    set(on) {
      value = on;
      try {
        const store = getStore();
        if (store) {
          if (on) store.setItem(SHOW_CODES_KEY, 'on');
          else store.removeItem(SHOW_CODES_KEY);
        }
      } catch {
        // Blocked or full. The choice still holds until the page is closed.
      }
      for (const listener of [...listeners]) listener(on);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The one shared choice for the page. */
export const codesPref = createCodesPref();

export const CODES_HINT = 'Type **bold**, _italic_ and [link text](https://...) yourself.';

/**
 * The switch shown at the top of an edit form. It is a real checkbox with a visible label, so it
 * works with a keyboard and a screen reader. It follows the shared choice when the other screen
 * changes it. `onChange` runs after the choice changes from anywhere; redraw the form there.
 */
export function createCodesSwitch(
  onChange: () => void,
  pref: CodesPref = codesPref,
): { element: HTMLElement; input: HTMLInputElement } {
  const input = el('input', { type: 'checkbox', id: uid('codes') });
  input.checked = pref.get();
  const hintId = uid('hint');
  input.setAttribute('aria-describedby', hintId);
  const element = el('div', { className: 'codes-switch field' }, [
    el('label', { className: 'check-row', htmlFor: input.id }, [
      input,
      el('span', { textContent: 'Show codes' }),
    ]),
    el('p', { className: 'hint', id: hintId, textContent: CODES_HINT }),
  ]);
  input.addEventListener('change', () => pref.set(input.checked));
  pref.subscribe((on) => {
    input.checked = on;
    onChange();
  });
  return { element, input };
}
