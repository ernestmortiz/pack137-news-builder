/**
 * One global safety net. An error nobody caught shows a short notice in plain words, with a
 * Reload button. No stack trace or technical text is ever shown, and there is never more than one
 * notice. Pending work is settled first so the letter's autosave has run.
 */
import { flushAll } from './safety';

/**
 * Worded so it is true on every screen and whether or not the save worked: the error can happen
 * on the converter, while saving is paused, or where storage is blocked.
 */
export const ERROR_MESSAGE =
  'Something went wrong. Reload the page to carry on. Anything already saved on this device will still be there; if you can, use Download draft first to keep a copy of your letter.';

/** Errors the browser raises about layout timing that change nothing for the person. */
const HARMLESS = /ResizeObserver loop/i;

export function installErrorNotice(
  win: Window = window,
  reload: () => void = () => win.location.reload(),
): void {
  const doc = win.document;
  let shown: HTMLElement | null = null;

  function show(): void {
    // Try to save first. A failure here must not hide the notice.
    flushAll();
    if (shown?.isConnected) return;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'btn primary';
    button.textContent = 'Reload';
    button.addEventListener('click', reload);
    const message = doc.createElement('p');
    message.textContent = ERROR_MESSAGE;
    const actions = doc.createElement('div');
    actions.className = 'row-actions';
    actions.append(button);
    const box = doc.createElement('div');
    box.className = 'warnings error-notice';
    box.setAttribute('role', 'alert');
    box.append(message, actions);
    // After the masthead, so the skip link stays the first thing a keyboard reaches.
    const masthead = doc.querySelector('.masthead');
    if (masthead) masthead.after(box);
    else doc.body.prepend(box);
    shown = box;
  }

  win.addEventListener('error', (event) => {
    if (HARMLESS.test(event.message ?? '')) return;
    show();
  });
  win.addEventListener('unhandledrejection', () => show());
}
