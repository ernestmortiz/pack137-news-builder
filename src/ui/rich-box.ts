/**
 * The rich text box: a small editor that shows bold, italic, struck words and links as they will
 * look, with a toolbar. It holds `RichText` and nothing else. The box is written with DOM calls
 * and read with a strict walk (see rich-box-dom.ts); clipboard HTML is never put in the page.
 *
 * It reports each change as before and after runs. The form kit turns those into undo steps.
 * Offsets in an edit are plain text offsets (a line break counts as one character).
 */
import type { RichText } from '../core/forms';
import type { Mark } from '../core/model';
import {
  linkAt,
  markInsertion,
  marksIn,
  plainLength,
  removeLink,
  replaceRange,
  setLink,
  toggleMark,
  toggledMarks,
} from '../core/rich-edit';
import { normalizeRich, richToText } from '../core/rich-text';
import { safeUrl } from '../templates/components';
import { el, uid } from './dom';
import { markSpelling } from './field-kinds';
import {
  getOffsets,
  readRuns,
  runsFromHtml,
  runsFromText,
  setOffsets,
  writeRuns,
} from './rich-box-dom';

export interface RichEdit {
  before: RichText;
  after: RichText;
  selBefore: [number, number];
  selAfter: [number, number];
  /** Plain words for the undo list: "typing", "bold", "pasting" and so on. */
  what: string;
}

export interface RichBoxOptions {
  runs: RichText;
  /** Rough height in lines. */
  rows: number;
  /** Words that name the toolbar for a screen reader, such as "Text of paragraph 1". */
  name: string;
  onEdit(edit: RichEdit): void;
  /** The browser's own undo or redo was asked for inside the box. */
  onHistory(kind: 'undo' | 'redo'): void;
  /** The box lost focus. */
  onBlur(): void;
}

export interface RichBox {
  /** Toolbar, link panel and box together. */
  element: HTMLElement;
  /** The editable box. Label it with aria-labelledby. */
  box: HTMLElement;
  runs(): RichText;
  /** Put runs in from outside (undo and redo). Does not report an edit. */
  set(runs: RichText, selection?: [number, number]): void;
  /** Move the caret or selection (plain text offsets). */
  select(selection: [number, number]): void;
}

const MARK_BUTTONS: { mark: Mark; text: string; keys: string }[] = [
  { mark: 'strong', text: 'Bold', keys: 'Ctrl+B' },
  { mark: 'em', text: 'Italic', keys: 'Ctrl+I' },
  { mark: 'strike', text: 'Strike', keys: '' },
];

export const LINK_REFUSED =
  'That address cannot be used. It needs to start with https://, http:// or mailto:';

const same = (a: RichText, b: RichText): boolean => richToText(a) === richToText(b);

export function createRichBox(options: RichBoxOptions): RichBox {
  let current = normalizeRich(options.runs);
  let lastSel: [number, number] = [0, 0];
  /**
   * Pending marks: Bold, Italic or Strike pressed with a cursor and nothing selected. They are the
   * marks for the next typed text at that cursor (`pendingAt`). Any move of the cursor, a click
   * elsewhere or an edit by other means clears them.
   */
  let pending: Mark[] | null = null;
  let pendingAt = 0;
  let composing = false;
  let composeBefore: RichText = [];

  const box = el('div', { className: 'control rich-box' });
  box.id = uid('f');
  box.setAttribute('contenteditable', 'true');
  box.setAttribute('role', 'textbox');
  box.setAttribute('aria-multiline', 'true');
  box.setAttribute('autocapitalize', 'sentences');
  markSpelling(box, 'text');
  box.style.minHeight = `calc(${options.rows} * 1.45em + 20px)`;
  writeRuns(box, current);

  /* ---------- toolbar ---------- */

  const status = el('p', { className: 'hint rich-status' });
  status.setAttribute('role', 'status');
  status.hidden = true;
  const say = (words: string): void => {
    status.textContent = words;
    status.hidden = words === '';
  };

  const toolbar = el('div', { className: 'rich-toolbar' });
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', `Formatting for ${options.name}`);

  const buttons: HTMLButtonElement[] = [];
  const markButtons = new Map<Mark, HTMLButtonElement>();
  const makeButton = (text: string, className: string): HTMLButtonElement => {
    const button = el('button', {
      type: 'button',
      className: `btn rich-btn ${className}`,
      textContent: text,
    });
    button.tabIndex = buttons.length === 0 ? 0 : -1;
    // Keep the selection in the box when a button is pressed with the mouse or a finger.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('focus', () => {
      for (const b of buttons) b.tabIndex = b === button ? 0 : -1;
    });
    buttons.push(button);
    toolbar.append(button);
    return button;
  };

  const selection = (): [number, number] => {
    const live = getOffsets(box);
    if (live !== null) lastSel = live;
    return lastSel;
  };

  function updatePressed(): void {
    const [a, b] = lastSel;
    const on = pending !== null && a === b && a === pendingAt ? pending : marksIn(current, a, b);
    for (const [mark, button] of markButtons) {
      button.setAttribute('aria-pressed', String(on.includes(mark)));
    }
  }

  /** Puts `next` in the box and tells the form. */
  function change(
    next: RichText,
    selAfter: [number, number],
    selBefore: [number, number],
    what: string,
  ): void {
    const before = current;
    next = normalizeRich(next);
    pending = null;
    if (same(before, next)) return;
    current = next;
    writeRuns(box, current);
    lastSel = selAfter;
    if (box.ownerDocument.activeElement === box || getOffsets(box) !== null) {
      // Selecting inside the box can pull focus into it. A toolbar button keeps its focus.
      const held = box.ownerDocument.activeElement;
      setOffsets(box, selAfter[0], selAfter[1]);
      if (held instanceof HTMLElement && held !== box && toolbar.contains(held)) held.focus();
    }
    options.onEdit({ before, after: next, selBefore, selAfter, what });
    updatePressed();
  }

  for (const { mark, text, keys } of MARK_BUTTONS) {
    const button = makeButton(text, mark);
    button.setAttribute('aria-pressed', 'false');
    if (keys !== '') button.title = `${text} (${keys})`;
    markButtons.set(mark, button);
    button.addEventListener('click', () => applyMark(mark, text));
  }
  const linkButton = makeButton('Link', 'link');
  const unlinkButton = makeButton('Remove link', 'unlink');
  linkButton.title = 'Link (Ctrl+K)';

  function applyMark(mark: Mark, word: string): void {
    const [a, b] = selection();
    say('');
    if (a === b) {
      // Nothing selected: the mark is for the next words typed here, as in any text editor.
      const base = pending !== null && pendingAt === a ? pending : marksIn(current, a, a);
      pending = toggledMarks(base, mark);
      pendingAt = a;
      updatePressed();
      return;
    }
    pending = null;
    change(toggleMark(current, a, b, mark), [a, b], [a, b], word.toLowerCase());
  }

  unlinkButton.addEventListener('click', () => {
    const [a, b] = selection();
    const next = removeLink(current, a, b);
    if (same(next, current)) {
      say('There is no link here. Put the cursor in a link, or select it, first.');
      return;
    }
    say('');
    change(next, [a, b], [a, b], 'removing a link');
  });

  toolbar.addEventListener('keydown', (event) => {
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    let to = -1;
    if (event.key === 'ArrowRight') to = (at + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') to = (at - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = buttons.length - 1;
    if (to < 0) return;
    event.preventDefault();
    buttons[to]?.focus();
  });

  /* ---------- link panel ---------- */

  const addressId = uid('link-address');
  const address = el('input', { type: 'text', id: addressId, className: 'control' });
  address.inputMode = 'url';
  address.autocapitalize = 'none';
  address.autocomplete = 'off';
  address.spellcheck = false;
  const problem = el('p', { className: 'note warn' });
  problem.setAttribute('role', 'alert');
  problem.hidden = true;
  const save = el('button', { type: 'button', className: 'btn', textContent: 'Save link' });
  const cancel = el('button', { type: 'button', className: 'btn', textContent: 'Cancel' });
  const panel = el('div', { className: 'rich-link-panel' }, [
    el('label', { htmlFor: addressId, className: 'label', textContent: 'Link address' }),
    address,
    el('p', {
      className: 'hint',
      textContent: 'Starts with https://, http:// or mailto:',
    }),
    problem,
    el('div', { className: 'add-row' }, [save, cancel]),
  ]);
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', `Link address for ${options.name}`);
  panel.hidden = true;
  linkButton.setAttribute('aria-expanded', 'false');
  linkButton.setAttribute('aria-controls', panel.id || (panel.id = uid('link-panel')));
  let panelRange: [number, number] = [0, 0];

  function closePanel(returnFocus: boolean): void {
    panel.hidden = true;
    problem.hidden = true;
    linkButton.setAttribute('aria-expanded', 'false');
    if (returnFocus) {
      box.focus();
      setOffsets(box, panelRange[0], panelRange[1]);
    }
  }

  function openPanel(): void {
    const [a, b] = selection();
    const at = linkAt(current, a);
    if (a === b && at === null) {
      say('Select the words you want to turn into a link first.');
      return;
    }
    say('');
    panelRange = [a, b];
    address.value = at?.href ?? '';
    problem.hidden = true;
    panel.hidden = false;
    linkButton.setAttribute('aria-expanded', 'true');
    address.focus();
    address.select();
  }

  function saveLink(): void {
    const href = safeUrl(address.value);
    if (href === null) {
      problem.textContent = LINK_REFUSED;
      problem.hidden = false;
      address.setAttribute('aria-invalid', 'true');
      address.focus();
      return;
    }
    address.removeAttribute('aria-invalid');
    const [a, b] = panelRange;
    const next = setLink(current, a, b, href);
    closePanel(true);
    change(next, [a, b], [a, b], 'adding a link');
  }

  linkButton.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel(true)));
  save.addEventListener('click', saveLink);
  cancel.addEventListener('click', () => closePanel(true));
  address.addEventListener('input', () => {
    problem.hidden = true;
    address.removeAttribute('aria-invalid');
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePanel(true);
    } else if (event.key === 'Enter' && event.target === address) {
      event.preventDefault();
      saveLink();
    }
  });

  /* ---------- the box ---------- */

  let pre: [number, number] = [0, 0];

  function insert(inserted: RichText, what: string): void {
    const [a, b] = selection();
    const caret = a + plainLength(inserted);
    change(replaceRange(current, a, b, inserted), [caret, caret], [a, b], what);
  }

  box.addEventListener('beforeinput', (event) => {
    const kind = (event as InputEvent).inputType;
    if (kind === 'historyUndo' || kind === 'historyRedo') {
      event.preventDefault();
      options.onHistory(kind === 'historyUndo' ? 'undo' : 'redo');
      return;
    }
    // The toolbar is the only way to format, and the only way to paste or drop is our own.
    if (kind.startsWith('format') || kind.startsWith('insertFrom')) {
      event.preventDefault();
      return;
    }
    if (kind === 'insertParagraph' || kind === 'insertLineBreak') {
      event.preventDefault();
      current = readRuns(box);
      insert([{ kind: 'break' }], 'typing');
      return;
    }
    pre = getOffsets(box) ?? lastSel;
  });

  box.addEventListener('input', (event) => {
    let after = readRuns(box);
    const before = current;
    if (same(before, after)) return;
    const sel = getOffsets(box) ?? [plainLength(after), plainLength(after)];
    if (!composing && !(event as InputEvent).isComposing) {
      // Text typed after pressing Bold (and so on) with nothing selected gets those marks, in the
      // same undo step as the typing. Any other change just drops the pending marks.
      const marked = pending === null ? null : markInsertion(before, after, pendingAt, pending);
      pending = null;
      if (marked !== null && !same(marked, after)) {
        after = marked;
        writeRuns(box, after);
        setOffsets(box, sel[0], sel[1]);
      }
    }
    current = after;
    lastSel = sel;
    options.onEdit({ before, after, selBefore: pre, selAfter: sel, what: 'typing' });
    updatePressed();
  });

  box.addEventListener('paste', (event) => {
    event.preventDefault();
    const data = event.clipboardData;
    if (!data) return;
    const html = data.getData('text/html');
    let inserted = html === '' ? [] : runsFromHtml(html);
    if (inserted.length === 0) inserted = runsFromText(data.getData('text/plain'));
    if (inserted.length > 0) insert(inserted, 'pasting');
  });
  for (const type of ['drop', 'dragover'] as const) {
    box.addEventListener(type, (event) => event.preventDefault());
  }

  // A link in the box shows its address but never opens.
  for (const type of ['click', 'auxclick'] as const) {
    box.addEventListener(type, (event) => {
      if ((event.target as Element | null)?.closest('a')) event.preventDefault();
    });
  }

  box.addEventListener('keydown', (event) => {
    if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || event.shiftKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'b') applyMark('strong', 'Bold');
    else if (key === 'i') applyMark('em', 'Italic');
    else if (key === 'k') openPanel();
    else return;
    event.preventDefault();
  });

  // Phone keyboards type in "compositions". The pending marks go on when the word is settled.
  box.addEventListener('compositionstart', () => {
    composing = true;
    composeBefore = current;
  });
  box.addEventListener('compositionend', () => {
    composing = false;
    const marks = pending;
    pending = null;
    const marked = marks === null ? null : markInsertion(composeBefore, current, pendingAt, marks);
    if (marked !== null && !same(marked, current)) {
      const sel = getOffsets(box) ?? lastSel;
      change(marked, sel, sel, 'typing');
    }
    updatePressed();
  });

  box.addEventListener('blur', (event) => {
    const to = event.relatedTarget;
    // Going to the toolbar keeps them (press Bold, then go back and type). Going elsewhere drops them.
    if (!(to instanceof Node && element.contains(to))) pending = null;
    selection();
    // Tidy anything the browser left behind (spans, divs) so the box matches the form.
    if (!same(readRuns(box), current) || box.querySelector('div,span,font,p') !== null) {
      writeRuns(box, current);
    }
    options.onBlur();
  });

  const onSelect = (): void => {
    if (!box.isConnected) {
      document.removeEventListener('selectionchange', onSelect);
      return;
    }
    if (getOffsets(box) !== null) {
      selection();
      // Text just typed moves the cursor too. That is not "moved away": the input event comes next
      // (or has just come) and uses the pending marks, so only clear when the words are unchanged.
      const moved = lastSel[0] !== lastSel[1] || lastSel[0] !== pendingAt;
      if (pending !== null && !composing && moved && same(readRuns(box), current)) pending = null;
      updatePressed();
    }
  };
  document.addEventListener('selectionchange', onSelect);
  box.addEventListener('focus', () => {
    selection();
    if (pending !== null && (lastSel[0] !== lastSel[1] || lastSel[0] !== pendingAt)) pending = null;
    updatePressed();
  });
  updatePressed();

  const element = el('div', { className: 'rich-editor' }, [toolbar, status, panel, box]);

  return {
    element,
    box,
    runs: () => current,
    select(sel) {
      pending = null;
      const max = plainLength(current);
      lastSel = [Math.min(sel[0], max), Math.min(sel[1], max)];
      if (box.isConnected) setOffsets(box, lastSel[0], lastSel[1]);
      updatePressed();
    },
    set(runs, sel) {
      pending = null;
      current = normalizeRich(runs);
      writeRuns(box, current);
      if (sel) {
        lastSel = sel;
        if (box.ownerDocument.activeElement === box) setOffsets(box, sel[0], sel[1]);
      }
      updatePressed();
    },
  };
}
