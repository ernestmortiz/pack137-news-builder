/**
 * Building blocks for the announcement forms. Every field has a visible label. Typing updates the
 * form object and calls `ctx.changed()`; nothing is redrawn while typing. Adding, removing or
 * moving an entry redraws only that list. Values go in through `.value` or `textContent`.
 */
import type { CheckMe, FieldPath, Suggestion } from '../core/fill';
import type { FormWarning } from '../core/form-warnings';
import type { ButtonField, RichText } from '../core/forms';
import { richToText, textToRich } from '../core/rich-text';
import { createRichBox, type RichBox } from './rich-box';
import { clear, debounce, el, uid } from './dom';
import { type FieldKind, markSpelling } from './field-kinds';
import { itemsFor, mailtoDetails, type MailLine, moveItem, samePath, warningPath } from './paths';

export interface FormContext {
  checks(): CheckMe[];
  suggestions(): Suggestion[];
  warnings(): FormWarning[];
  /** One edit in a text field (a character, a paste, a replaced selection). Is its own step. */
  typed(edit: TypingEdit): void;
  /** Call just before a structural change touches the form, so the step can keep the "before". */
  begin(): void;
  /** One finished structural change (add, remove, move, select, checkbox, date). Records a step. */
  step(label: string): void;
  /** Undo or redo asked for from inside a field (the browser's own menu, for instance). */
  history(kind: 'undo' | 'redo'): void;
  /** Two neighbouring entries of the array at `arrayPath` swapped places. */
  swapped(arrayPath: FieldPath, a: number, b: number): void;
  /** The entry at `index` of the array at `arrayPath` was removed. */
  removed(arrayPath: FieldPath, index: number): void;
  /** Apply a one-tap suggestion. The caller redraws the whole form. */
  apply(suggestion: Suggestion): void;
}

/** One change to the text of one field. Selections are [start, end] in the field's text. */
export interface TypingEdit {
  path: FieldPath;
  label: string;
  before: string;
  after: string;
  selBefore: [number, number];
  selAfter: [number, number];
}

/** How long a rich field waits after the last keystroke before the form takes its text. */
/** How long a card toolbar stays after the keyboard leaves its box (see cardRich). */
export const TOOLBAR_HOLD_MS = 250;

// True while a mouse button, finger or pen is down anywhere on the page.
let pointerIsDown = false;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => (pointerIsDown = true), true);
  for (const type of ['pointerup', 'pointercancel', 'dragend']) {
    document.addEventListener(type, () => (pointerIsDown = false), true);
  }
}

export const COMMIT_DELAY_MS = 150;

export const RICH_HINT = 'Type **bold**, _italic_, ~~struck~~ or [link text](https://example.org).';

/** The hint under a rich text box that shows its formatting (no codes to type). */
export const RICH_BOX_HINT =
  'Select words, then press Bold, Italic, Strike or Link. Or press Bold, Italic or Strike first, then type.';

interface RepeaterOptions<T> {
  /** Singular name for buttons and headings, such as "paragraph". */
  noun: string;
  arrayPath: FieldPath;
  items: T[];
  create(): T;
  /** Fields for one entry. `path` is the path of that entry. */
  body(item: T, index: number, path: FieldPath): Node[];
  addLabel: string;
  compact?: boolean;
  /** Plain words shown after the entry's number, such as "Contributor". */
  describe?(item: T): string;
  /** Other kinds of entry that can be added, each with its own button. */
  extraAdds?: { label: string; create(): T }[];
  /** Called inside the same undo step after entries `from` and `to` swapped places. */
  onMoved?(from: number, to: number): void;
  /** Called inside the same undo step after the entry at `index` was removed. */
  onRemoved?(index: number): void;
  /** A control shown just above the add button (for example a block-type picker). */
  beforeAdd?: HTMLElement;
}

/** "Label (the small tag at the top)" becomes "Label". */
function shortLabel(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, '');
}

/** Shows each email link's full value and its plain breakdown. A cc or bcc stands out. */
function fillMail(box: HTMLElement, groups: MailLine[][]): void {
  clear(box);
  for (const lines of groups) {
    for (const line of lines) {
      if (line.alert) {
        box.append(
          el('p', { className: 'note check' }, [
            el('strong', { textContent: 'Check me: ' }),
            line.text,
          ]),
        );
      } else {
        box.append(el('p', { className: 'note mailto', textContent: line.text }));
      }
    }
  }
  box.hidden = box.childElementCount === 0;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * `showCodes` says whether rich fields show typed codes (a textarea) or the formatting box. It is
 * asked each time a rich field is built, so redrawing the form picks up a changed choice. Without
 * it the kit shows the typed codes.
 */
export function createKit(ctx: FormContext, showCodes: () => boolean = () => true) {
  const claimed = new Set<object>();
  /** Where suggestion buttons go. Refilled from the current form without redrawing any field. */
  const suggestSlots: { path: FieldPath; node: HTMLElement; key: string }[] = [];
  const leftover = { node: el('div', { className: 'suggest-leftovers' }), key: '' };
  let leftoverBox: HTMLElement | null = null;
  let leftoverChecks = 0;
  const warnTargets: { path: FieldPath; node: HTMLElement }[] = [];
  /** "Add a label" style notes, hidden while their field has text (CheckKind 'missing'). */
  const missingNotes: { path: FieldPath; node: HTMLElement }[] = [];
  function refreshMissing(): void {
    for (const note of missingNotes) {
      const field = fields.get(JSON.stringify(note.path));
      if (field !== undefined) note.node.hidden = field.text().trim() !== '';
    }
  }
  /** Rich fields whose latest typing has not reached the form yet. */
  const pending = new Set<{ control: HTMLElement; flush(): void }>();
  /** Brings the form up to date with everything typed. Cheap when nothing is waiting. */
  function flush(): void {
    for (const item of pending) {
      item.flush();
      if (!item.control.isConnected) pending.delete(item);
    }
  }
  /** Other controls (menus, dates) by path, so a "Change in the form" button can focus one. */
  const controls = new Map<string, HTMLElement>();
  /** Lists by path. Focusing one goes to its first control, or its add button when it is empty. */
  const containers = new Map<string, HTMLElement>();
  /** Text fields on screen, so undo can change one without redrawing the form. */
  const fields = new Map<
    string,
    {
      control: HTMLElement;
      /** The field's text as the history sees it (the typed codes for a rich field). */
      text(): string;
      apply(value: string): void;
      /** Place the caret. Missing for a plain input, which uses setSelectionRange. */
      select?(selection: [number, number]): void;
    }
  >();

  /**
   * Makes every edit of a text control its own step. `commit` pushes the new text into the form.
   * Returns the function that puts a value in from outside (undo and redo).
   */
  function trackTyping(
    control: HTMLInputElement | HTMLTextAreaElement,
    path: FieldPath,
    label: string,
    commit: (value: string) => void,
    lazy = false,
  ): void {
    let known = control.value;
    // A very large field is slow to parse. The undo step is still recorded per edit, but the form
    // value catches up on a short pause, on leaving the field, and before anything reads the form.
    const later = lazy ? debounce(() => commit(control.value), COMMIT_DELAY_MS) : null;
    if (later) {
      pending.add({ control, flush: later.flush });
      control.addEventListener('blur', later.flush);
    }
    let pre: [number, number] = [0, 0];
    control.addEventListener('beforeinput', (event) => {
      const kind = (event as InputEvent).inputType;
      if (kind === 'historyUndo' || kind === 'historyRedo') {
        event.preventDefault();
        ctx.history(kind === 'historyUndo' ? 'undo' : 'redo');
        return;
      }
      pre = [control.selectionStart ?? 0, control.selectionEnd ?? 0];
    });
    control.addEventListener('input', () => {
      const before = known;
      const after = control.value;
      known = after;
      if (later) later.run();
      else commit(after);
      if (before === after) return;
      ctx.typed({
        path,
        label: `typing in ${shortLabel(label)}`,
        before,
        after,
        selBefore: pre,
        selAfter: [control.selectionStart ?? after.length, control.selectionEnd ?? after.length],
      });
    });
    fields.set(JSON.stringify(path), {
      control,
      text: () => control.value,
      apply(value) {
        control.value = value;
        known = value;
        later?.cancel();
        commit(value);
      },
    });
  }

  /** Put `value` in the field at `path` and place the caret. False if that field is not on screen. */
  function setField(path: FieldPath, value: string, selection: [number, number]): boolean {
    const field = fields.get(JSON.stringify(path));
    if (!field || !field.control.isConnected) return false;
    field.apply(value);
    if (field.select) {
      field.select(selection);
      return true;
    }
    try {
      (field.control as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(
        selection[0],
        selection[1],
      );
    } catch {
      // Some input types have no caret. The value is already in.
    }
    return true;
  }

  /** The text of the field at `path` as the history sees it, or '' if it is not on screen. */
  function fieldText(path: FieldPath): string {
    const field = fields.get(JSON.stringify(path));
    return field && field.control.isConnected ? field.text() : '';
  }

  function fieldControl(path: FieldPath): HTMLElement | null {
    const field = fields.get(JSON.stringify(path));
    return field && field.control.isConnected ? field.control : null;
  }

  /** Lets `focusPath` find a control that is not a text field (a menu, a date). */
  function register(path: FieldPath, control: HTMLElement): void {
    controls.set(JSON.stringify(path), control);
  }

  const FOCUS_TARGET =
    'input:not([type=hidden]):not([type=file]), textarea, select, [contenteditable=true]';

  /**
   * Moves the keyboard to the control for `path`. A path with nothing of its own (the year inside a
   * date, say) falls back to the nearest part that has a control. False if nothing is on screen.
   */
  function focusPath(path: FieldPath): boolean {
    for (let n = path.length; n > 0; n--) {
      const key = JSON.stringify(path.slice(0, n));
      let target: HTMLElement | null | undefined = fields.get(key)?.control ?? controls.get(key);
      const list = containers.get(key);
      if (!target && list) {
        target = list.querySelector<HTMLElement>(FOCUS_TARGET) ?? list.querySelector('.add-button');
      }
      if (target?.isConnected) {
        target.focus();
        target.scrollIntoView?.({ block: 'center' });
        return true;
      }
    }
    return false;
  }

  /* ---------- markers beside a field ---------- */

  function fillWarnings(path: FieldPath, node: HTMLElement): void {
    clear(node);
    for (const warning of ctx.warnings()) {
      const at = warningPath(warning);
      if (at !== undefined && samePath(at, path)) {
        node.append(el('p', { className: 'note warn', textContent: warning.message }));
      }
    }
  }

  function warnHere(path: FieldPath): HTMLElement {
    const node = el('div', { className: 'warn-slot' });
    warnTargets.push({ path, node });
    fillWarnings(path, node);
    return node;
  }

  /** Redraws the warning text beside fields. Call after any change. */
  function refreshWarnings(): void {
    for (const target of warnTargets) {
      if (target.node.isConnected) fillWarnings(target.path, target.node);
    }
    refreshMissing();
  }

  function markerList(path: FieldPath, id: string): HTMLElement {
    const box = el('div', { className: 'markers', id });
    for (const check of itemsFor(ctx.checks(), path)) {
      claimed.add(check);
      const note = el('p', { className: 'note check' }, [
        el('strong', { textContent: 'Check me: ' }),
        check.message,
      ]);
      if (check.kind === 'missing') {
        missingNotes.push({ path, node: note });
        const field = fields.get(JSON.stringify(path));
        if (field !== undefined) note.hidden = field.text().trim() !== '';
      }
      box.append(note);
    }
    const slot = el('div', { className: 'suggest-slot' });
    suggestSlots.push({ path, node: slot, key: '' });
    box.append(slot);
    box.append(warnHere(path));
    return box;
  }

  function fillSlot(slot: { node: HTMLElement; key: string }, items: Suggestion[]): void {
    const key = items.map((s) => `${s.message}\u0000${s.from}\u0000${s.to}`).join('\u0001');
    if (key === slot.key) return;
    slot.key = key;
    clear(slot.node);
    for (const suggestion of items) {
      const button = el('button', {
        type: 'button',
        className: 'btn suggest',
        textContent: suggestion.message,
      });
      button.addEventListener('click', () => ctx.apply(suggestion));
      slot.node.append(el('div', { className: 'suggestion' }, [button]));
    }
  }

  /** Puts the suggestions for the form as it is now beside their fields. Fields are not touched. */
  function refreshSuggestions(): void {
    const list = ctx.suggestions();
    const placed = new Set<Suggestion>();
    for (const slot of suggestSlots) {
      const items = itemsFor(list, slot.path);
      for (const item of items) placed.add(item);
      fillSlot(slot, items);
    }
    fillSlot(
      leftover,
      list.filter((s) => !placed.has(s)),
    );
    if (leftoverBox) leftoverBox.hidden = leftoverChecks === 0 && leftover.key === '';
  }

  /** Markers and suggestions nobody claimed, for the top of the form. */
  function leftovers(): HTMLElement {
    const checks = ctx.checks().filter((c) => !claimed.has(c));
    const box = el('div', { className: 'leftovers' }, [
      el('p', { className: 'note', textContent: 'Also worth a look:' }),
    ]);
    for (const check of checks) {
      box.append(el('p', { className: 'note check', textContent: check.message }));
    }
    leftoverChecks = checks.length;
    box.append(leftover.node);
    leftoverBox = box;
    refreshSuggestions();
    return box;
  }

  /* ---------- fields ---------- */

  function wrap(
    label: string,
    control: HTMLElement,
    path: FieldPath,
    hint: string | undefined,
    extras: HTMLElement[] = [],
    /** The real control when `control` is a wrapper around it (a rich text box with a toolbar). */
    inner?: HTMLElement,
  ): HTMLElement {
    const markersId = uid('markers');
    const described = [markersId];
    const labelNode = el('label', {
      htmlFor: (inner ?? control).id,
      className: 'label',
      textContent: label,
    });
    if (inner) {
      // A div cannot be reached through `for`, so the label names it by id and focuses it on click.
      labelNode.id = uid('label');
      inner.setAttribute('aria-labelledby', labelNode.id);
      labelNode.addEventListener('click', () => inner.focus());
    }
    const parts: HTMLElement[] = [labelNode, control];
    if (hint !== undefined) {
      const hintId = uid('hint');
      described.unshift(hintId);
      parts.push(el('p', { className: 'hint', id: hintId, textContent: hint }));
    }
    parts.push(...extras, markerList(path, markersId));
    (inner ?? control).setAttribute('aria-describedby', described.join(' '));
    return el('div', { className: 'field' }, parts);
  }

  function text(
    label: string,
    path: FieldPath,
    get: () => string,
    set: (value: string) => void,
    options: {
      hint?: string;
      url?: boolean;
      placeholder?: string;
      rows?: number;
      /** What the field holds. Free words are spell checked; numbers and the like are not. */
      kind?: FieldKind;
    } = {},
  ): HTMLElement {
    const input: HTMLInputElement | HTMLTextAreaElement =
      options.rows !== undefined
        ? el('textarea', { id: uid('f'), className: 'control', rows: options.rows })
        : el('input', { type: 'text', id: uid('f'), className: 'control' });
    input.value = get();
    markSpelling(input, options.url === true ? 'url' : (options.kind ?? 'text'));
    if (options.placeholder !== undefined) input.placeholder = options.placeholder;
    const extras: HTMLElement[] = [];
    let showMailNow = (): void => {};
    if (options.url === true && input instanceof HTMLInputElement) {
      input.inputMode = 'url';
      input.autocapitalize = 'none';
      input.autocomplete = 'off';
      const mail = el('div', { className: 'mailto' });
      const showMail = (): void => {
        fillMail(mail, [mailtoDetails(input.value) ?? []]);
      };
      showMail();
      extras.push(mail);
      showMailNow = showMail;
    }
    trackTyping(input, path, label, (value) => {
      set(value);
      showMailNow();
    });
    return wrap(label, input, path, options.hint, extras);
  }

  /** Fills the mailto details under a rich field from the links in its text. */
  function mailFiller(mail: HTMLElement): (runs: RichText) => void {
    return (runs) => {
      const seen = new Map<string, MailLine[]>();
      for (const run of runs) {
        if (run.kind === 'text' && run.href !== undefined) {
          const lines = mailtoDetails(run.href);
          if (lines !== null) seen.set(run.href, lines);
        }
      }
      fillMail(mail, [...seen.values()]);
    };
  }

  /**
   * A rich text box that shows its formatting. Every edit is recorded for undo as the typed codes
   * (`richToText`), so undo, redo and the draft work as they do for the plain text version. The
   * form catches up after a short pause, on leaving the box, and before anything reads the form.
   */
  function makeRich(
    label: string,
    path: FieldPath,
    get: () => RichText,
    set: (value: RichText) => void,
    rows: number,
  ): { editor: RichBox; mail: HTMLElement } {
    const mail = el('div', { className: 'mailto' });
    const showMail = mailFiller(mail);
    const commit = (runs: RichText): void => {
      set(runs);
      showMail(runs);
    };
    showMail(get());
    const editor = createRichBox({
      runs: get(),
      rows,
      name: shortLabel(label),
      onEdit(edit) {
        later.run();
        ctx.typed({
          path,
          label: `${edit.what} in ${shortLabel(label)}`,
          before: richToText(edit.before),
          after: richToText(edit.after),
          selBefore: edit.selBefore,
          selAfter: edit.selAfter,
        });
      },
      onHistory: (kind) => ctx.history(kind),
      onBlur: () => later.flush(),
    });
    const later = debounce(() => commit(editor.runs()), COMMIT_DELAY_MS);
    pending.add({ control: editor.box, flush: later.flush });
    fields.set(JSON.stringify(path), {
      control: editor.box,
      text: () => richToText(editor.runs()),
      apply(value) {
        const runs = textToRich(value);
        editor.set(runs);
        later.cancel();
        commit(runs);
      },
      select: (selection) => editor.select(selection),
    });
    return { editor, mail };
  }

  function richBox(
    label: string,
    path: FieldPath,
    get: () => RichText,
    set: (value: RichText) => void,
    rows: number,
  ): HTMLElement {
    const { editor, mail } = makeRich(label, path, get, set, rows);
    return wrap(label, editor.element, path, RICH_BOX_HINT, [mail], editor.box);
  }

  /* ---------- fields drawn on the card ---------- */

  /**
   * Text that sits on the drawn card and looks like card text. It is a one-line-high text area that
   * grows with its words (the wrapper repeats the text in a hidden copy, see `.ec-field`), so a long
   * title wraps instead of scrolling. Enter does nothing and a pasted line break becomes a space,
   * as in a plain text input. Typing, undo and redo go through the same code as the form's fields.
   */
  function cardText(
    label: string,
    path: FieldPath,
    get: () => string,
    set: (value: string) => void,
    options: { placeholder: string; className?: string },
  ): HTMLElement {
    const area = el('textarea', { className: 'ec-input', rows: 1 });
    area.value = get();
    area.placeholder = options.placeholder;
    area.setAttribute('aria-label', label);
    markSpelling(area, 'text');
    const wrapper = el('div', { className: `ec-field ${options.className ?? ''}`.trim() });
    // The hidden copy that sizes the box. An empty field is sized by its placeholder.
    const size = (): void => {
      wrapper.dataset.value = area.value === '' ? options.placeholder : area.value;
    };
    size();
    trackTyping(area, path, label, set);
    const key = JSON.stringify(path);
    const tracked = fields.get(key);
    if (tracked) {
      fields.set(key, {
        ...tracked,
        apply(value) {
          tracked.apply(value);
          size();
        },
      });
    }
    area.addEventListener('input', size);
    area.addEventListener('beforeinput', (event) => {
      const input = event as InputEvent;
      if (input.inputType === 'insertLineBreak' || input.inputType === 'insertParagraph') {
        event.preventDefault();
        return;
      }
      if (input.inputType !== 'insertFromPaste' && input.inputType !== 'insertFromDrop') return;
      const words = input.dataTransfer?.getData('text/plain') || input.data || '';
      if (!/[\r\n]/.test(words)) return;
      event.preventDefault();
      area.setRangeText(
        words.replace(/\s*[\r\n]+\s*/g, ' '),
        area.selectionStart,
        area.selectionEnd,
        'end',
      );
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    wrapper.append(area);
    return wrapper;
  }

  /**
   * A formatting box on the card. Same box, same undo steps as in the form; here it has no visible
   * label (the card shows what it is), so its name is the form's label. Its toolbar shows directly
   * under it, in the page flow (so it never covers text), while the box or the toolbar has the
   * keyboard (see `.ec-float`). It comes after the box in the page order too, so Tab from the box
   * reaches it and Shift+Tab comes back.
   */
  function cardRich(
    label: string,
    path: FieldPath,
    get: () => RichText,
    set: (value: RichText) => void,
    options: { placeholder: string; className?: string },
  ): HTMLElement {
    const { editor } = makeRich(label, path, get, set, 1);
    editor.box.setAttribute('aria-label', label);
    editor.box.style.minHeight = '';
    editor.box.dataset.placeholder = options.placeholder;
    editor.box.setAttribute('aria-placeholder', options.placeholder);
    editor.box.classList.add('ec-rich');
    const float = el('div', { className: 'ec-float' });
    for (const part of ['.rich-toolbar', '.rich-status', '.rich-link-panel']) {
      const node = editor.element.querySelector(part);
      if (node) float.append(node);
    }
    editor.element.append(float);
    // On a small screen the keyboard can hide what is under the box, so bring the toolbar into view.
    editor.box.addEventListener('focus', () => {
      requestAnimationFrame(() => {
        // Not every test page has scrollIntoView.
        if (float.isConnected && 'scrollIntoView' in float)
          float.scrollIntoView({ block: 'nearest' });
      });
    });
    // The toolbar is in the page flow, so taking it away moves everything under it up. If that
    // happened the moment a finger or mouse went down on a button below (the "Change in the form"
    // button, say), the press would miss. So it stays a moment after the keyboard leaves, and
    // until the press is over.
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    editor.element.addEventListener('focusin', () => {
      clearTimeout(hideTimer);
      editor.element.classList.add('is-open');
    });
    editor.element.addEventListener('focusout', (event) => {
      const to = event.relatedTarget;
      if (to instanceof Node && editor.element.contains(to)) return;
      clearTimeout(hideTimer);
      let waited = 0;
      const attempt = (): void => {
        if (editor.element.contains(editor.element.ownerDocument.activeElement)) return;
        // Never wait more than a couple of seconds, in case the press ended out of sight.
        if (pointerIsDown && (waited += 100) < 2000) hideTimer = setTimeout(attempt, 100);
        else editor.element.classList.remove('is-open');
      };
      hideTimer = setTimeout(attempt, TOOLBAR_HOLD_MS);
    });
    return el('div', { className: `ec-rich-wrap ${options.className ?? ''}`.trim() }, [
      editor.element,
    ]);
  }

  function rich(
    label: string,
    path: FieldPath,
    get: () => RichText,
    set: (value: RichText) => void,
    rows = 3,
  ): HTMLElement {
    if (!showCodes()) return richBox(label, path, get, set, rows);
    const area = el('textarea', { id: uid('f'), className: 'control rich', rows });
    markSpelling(area, 'text');
    area.value = richToText(get());
    const mail = el('div', { className: 'mailto' });
    const showMail = mailFiller(mail);
    showMail(get());
    trackTyping(
      area,
      path,
      label,
      (value) => {
        const runs = textToRich(value);
        set(runs);
        showMail(runs);
      },
      true,
    );
    return wrap(label, area, path, RICH_HINT, [mail]);
  }

  function select<V extends string>(
    label: string,
    path: FieldPath,
    options: { value: V; label: string }[],
    get: () => V,
    set: (value: V) => void,
    onChange?: (value: V) => void,
  ): HTMLElement {
    const control = el('select', { id: uid('f'), className: 'control' });
    for (const o of options) {
      control.append(el('option', { value: o.value, textContent: o.label }));
    }
    control.value = get();
    register(path, control);
    control.addEventListener('change', () => {
      ctx.begin();
      const value = control.value as V;
      set(value);
      onChange?.(value);
      ctx.step(`changed ${shortLabel(label)}`);
    });
    return wrap(label, control, path, undefined);
  }

  function checkbox(label: string, get: () => boolean, set: (value: boolean) => void) {
    const input = el('input', { type: 'checkbox', id: uid('f') });
    input.checked = get();
    input.addEventListener('change', () => {
      ctx.begin();
      set(input.checked);
      ctx.step(`changed ${shortLabel(label)}`);
    });
    const wrapper = el('label', { className: 'check-row', htmlFor: input.id }, [
      input,
      el('span', { textContent: label }),
    ]);
    return { wrapper, input };
  }

  function group(legend: string, children: Node[], className = ''): HTMLElement {
    return el('fieldset', { className: `group ${className}`.trim() }, [
      el('legend', { textContent: legend }),
      ...children,
    ]);
  }

  function buttonGroup(
    legend: string,
    path: FieldPath,
    get: () => ButtonField | undefined,
    set: (value: ButtonField) => void,
    hint: string,
  ): HTMLElement {
    const current = (): ButtonField => get() ?? { text: '', url: '' };
    return group(legend, [
      el('p', { className: 'hint', textContent: hint }),
      text(
        'Button text',
        [...path, 'text'],
        () => current().text,
        (v) => set({ ...current(), text: v }),
      ),
      text(
        'Button link',
        [...path, 'url'],
        () => current().url,
        (v) => set({ ...current(), url: v }),
        { url: true, hint: 'Starts with https:// or mailto:' },
      ),
      select(
        'Button color',
        [...path, 'color'],
        [
          { value: 'navy', label: 'Navy' },
          { value: 'gold', label: 'Gold' },
        ],
        () => current().color ?? 'navy',
        (v) => {
          // Navy is the default, so choosing it removes the key.
          const next: ButtonField = { ...current() };
          if (v === 'gold') next.color = 'gold';
          else delete next.color;
          set(next);
        },
      ),
      warnHere(path),
    ]);
  }

  /* ---------- lists that grow and shrink ---------- */

  function repeater<T>(o: RepeaterOptions<T>): HTMLElement {
    const root = el('div', { className: o.compact ? 'repeater compact' : 'repeater' });
    const noun = o.noun;
    containers.set(JSON.stringify(o.arrayPath), root);

    function firstControl(scope: ParentNode): HTMLElement | null {
      return scope.querySelector<HTMLElement>(
        'input:not([type=hidden]):not([type=file]), textarea, select',
      );
    }

    function build(after?: () => HTMLElement | null): void {
      // Forget the warning slots of the part that is about to be redrawn.
      for (let k = warnTargets.length - 1; k >= 0; k--) {
        const target = warnTargets[k];
        if (target !== undefined && root.contains(target.node)) warnTargets.splice(k, 1);
      }
      for (let k = suggestSlots.length - 1; k >= 0; k--) {
        const slot = suggestSlots[k];
        if (slot !== undefined && root.contains(slot.node)) suggestSlots.splice(k, 1);
      }
      clear(root);
      const list = el('ol', { className: 'repeat-list' });
      o.items.forEach((item, i) => {
        const titleId = uid('title');
        const n = i + 1;
        const described = o.describe ? o.describe(item) : '';
        const name = described === '' ? `${noun} ${n}` : `${noun} ${n}, ${described}`;
        const up = el('button', {
          type: 'button',
          className: 'btn small',
          textContent: 'Move up',
          disabled: i === 0,
        });
        up.setAttribute('aria-label', `Move up: ${name}`);
        const down = el('button', {
          type: 'button',
          className: 'btn small',
          textContent: 'Move down',
          disabled: i === o.items.length - 1,
        });
        down.setAttribute('aria-label', `Move down: ${name}`);
        const remove = el('button', {
          type: 'button',
          className: 'btn small danger',
          textContent: 'Remove',
        });
        remove.setAttribute('aria-label', `Remove ${name}`);
        up.dataset.act = 'up';
        down.dataset.act = 'down';

        const move = (to: number): void => {
          const other = o.items[to];
          if (other === undefined) return;
          ctx.begin();
          moveItem(o.items, i, to);
          o.onMoved?.(i, to);
          ctx.swapped(o.arrayPath, Math.min(i, to), Math.max(i, to));
          ctx.step(`moved a ${noun} ${to > i ? 'down' : 'up'}`);
          build(() => {
            const li = root.querySelector('.repeat-list')?.children[to];
            const same = to > i ? 'down' : 'up';
            const other = same === 'down' ? 'up' : 'down';
            const pick = li?.querySelector<HTMLButtonElement>(`[data-act=${same}]`);
            return pick && !pick.disabled
              ? pick
              : (li?.querySelector<HTMLButtonElement>(`[data-act=${other}]`) ?? null);
          });
        };
        up.addEventListener('click', () => move(i - 1));
        down.addEventListener('click', () => move(i + 1));
        remove.addEventListener('click', () => {
          ctx.begin();
          o.items.splice(i, 1);
          o.onRemoved?.(i);
          ctx.removed(o.arrayPath, i);
          ctx.step(`removed a ${noun}`);
          build(() => root.querySelector<HTMLElement>('.add-button'));
        });

        const body = o.body(item, i, [...o.arrayPath, i]);
        list.append(
          el('li', { className: 'repeat-item' }, [
            el('div', { className: 'repeat-head' }, [
              el('p', {
                className: 'repeat-title',
                id: titleId,
                textContent:
                  described === ''
                    ? `${sentenceCase(noun)} ${n}`
                    : `${sentenceCase(noun)} ${n}: ${described}`,
              }),
              el('div', { className: 'repeat-actions' }, [up, down, remove]),
            ]),
            el('div', { className: 'repeat-body' }, body),
          ]),
        );
        const li = list.lastElementChild;
        li?.setAttribute('role', 'group');
        li?.setAttribute('aria-labelledby', titleId);
        // A path inside this entry that has no control of its own lands on the entry's first field.
        if (li instanceof HTMLElement) containers.set(JSON.stringify([...o.arrayPath, i]), li);
      });
      const adds = [{ label: o.addLabel, create: o.create }, ...(o.extraAdds ?? [])];
      const addButtons = adds.map((a, k) => {
        const add = el('button', {
          type: 'button',
          className: 'btn add-button',
          textContent: a.label,
        });
        if (k > 0) add.dataset.extra = 'true';
        add.addEventListener('click', () => {
          ctx.begin();
          o.items.push(a.create());
          ctx.step(`added a ${noun}`);
          build(() => {
            const last = root.querySelector('.repeat-list')?.lastElementChild;
            return last ? firstControl(last) : null;
          });
        });
        return add;
      });
      if (o.items.length === 0) {
        root.append(el('p', { className: 'hint', textContent: `No ${noun}s yet.` }));
      } else {
        root.append(list);
      }
      if (o.beforeAdd) root.append(o.beforeAdd);
      root.append(el('div', { className: 'add-row' }, addButtons));
      refreshSuggestions();
      after?.()?.focus();
    }

    build();
    return root;
  }

  return {
    text,
    rich,
    cardText,
    cardRich,
    register,
    focusPath,
    select,
    checkbox,
    group,
    buttonGroup,
    repeater,
    warnHere,
    wrap,
    markerList,
    leftovers,
    refreshWarnings,
    refreshSuggestions,
    setField,
    fieldControl,
    fieldText,
    flush,
  };
}

export type Kit = ReturnType<typeof createKit>;
