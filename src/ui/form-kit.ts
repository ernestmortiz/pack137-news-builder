/**
 * Building blocks for the announcement forms. Every field has a visible label. Typing updates the
 * form object and calls `ctx.changed()`; nothing is redrawn while typing. Adding, removing or
 * moving an entry redraws only that list. Values go in through `.value` or `textContent`.
 */
import type { CheckMe, FieldPath, Suggestion } from '../core/fill';
import type { FormWarning } from '../core/form-warnings';
import type { ButtonField, RichText } from '../core/forms';
import { richToText, textToRich } from '../core/rich-text';
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
export const COMMIT_DELAY_MS = 150;

export const RICH_HINT = 'Type **bold**, _italic_, ~~struck~~ or [link text](https://example.org).';

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

export function createKit(ctx: FormContext) {
  const claimed = new Set<object>();
  /** Where suggestion buttons go. Refilled from the current form without redrawing any field. */
  const suggestSlots: { path: FieldPath; node: HTMLElement; key: string }[] = [];
  const leftover = { node: el('div', { className: 'suggest-leftovers' }), key: '' };
  let leftoverBox: HTMLElement | null = null;
  let leftoverChecks = 0;
  const warnTargets: { path: FieldPath; node: HTMLElement }[] = [];
  /** Rich fields whose latest typing has not reached the form yet. */
  const pending = new Set<{ control: HTMLElement; flush(): void }>();
  /** Brings the form up to date with everything typed. Cheap when nothing is waiting. */
  function flush(): void {
    for (const item of pending) {
      item.flush();
      if (!item.control.isConnected) pending.delete(item);
    }
  }
  /** Text fields on screen, so undo can change one without redrawing the form. */
  const fields = new Map<
    string,
    { control: HTMLInputElement | HTMLTextAreaElement; apply(value: string): void }
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
    try {
      field.control.setSelectionRange(selection[0], selection[1]);
    } catch {
      // Some input types have no caret. The value is already in.
    }
    return true;
  }

  function fieldControl(path: FieldPath): HTMLElement | null {
    const field = fields.get(JSON.stringify(path));
    return field && field.control.isConnected ? field.control : null;
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
  }

  function markerList(path: FieldPath, id: string): HTMLElement {
    const box = el('div', { className: 'markers', id });
    for (const check of itemsFor(ctx.checks(), path)) {
      claimed.add(check);
      box.append(
        el('p', { className: 'note check' }, [
          el('strong', { textContent: 'Check me: ' }),
          check.message,
        ]),
      );
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
  ): HTMLElement {
    const markersId = uid('markers');
    const described = [markersId];
    const parts: HTMLElement[] = [
      el('label', { htmlFor: control.id, className: 'label', textContent: label }),
      control,
    ];
    if (hint !== undefined) {
      const hintId = uid('hint');
      described.unshift(hintId);
      parts.push(el('p', { className: 'hint', id: hintId, textContent: hint }));
    }
    parts.push(...extras, markerList(path, markersId));
    control.setAttribute('aria-describedby', described.join(' '));
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

  function rich(
    label: string,
    path: FieldPath,
    get: () => RichText,
    set: (value: RichText) => void,
    rows = 3,
  ): HTMLElement {
    const area = el('textarea', { id: uid('f'), className: 'control rich', rows });
    markSpelling(area, 'text');
    area.value = richToText(get());
    const mail = el('div', { className: 'mailto' });
    const showMail = (runs: RichText): void => {
      const seen = new Map<string, MailLine[]>();
      for (const run of runs) {
        if (run.kind === 'text' && run.href !== undefined) {
          const lines = mailtoDetails(run.href);
          if (lines !== null) seen.set(run.href, lines);
        }
      }
      fillMail(mail, [...seen.values()]);
    };
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
      warnHere(path),
    ]);
  }

  /* ---------- lists that grow and shrink ---------- */

  function repeater<T>(o: RepeaterOptions<T>): HTMLElement {
    const root = el('div', { className: o.compact ? 'repeater compact' : 'repeater' });
    const noun = o.noun;

    function firstControl(scope: ParentNode): HTMLElement | null {
      return scope.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select');
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
    flush,
  };
}

export type Kit = ReturnType<typeof createKit>;
