/**
 * The Monthly letter screen (build spec 8.1). Plain DOM, no framework. The person fills a
 * LetterForm; `renderLetter` turns it into the email HTML, shown in sandboxed previews with
 * images swapped for placeholders. Copying is never blocked by a lint problem (owner decision).
 */
import { todayFrom } from '../core/dates';
import { lintOutput } from '../core/lint-output';
import { emptyLetter, letterWords, readTimeText, type LetterForm } from '../core/letter';
import { renderLetter } from '../core/render-letter';
import { browserClipboardEnv, copyText } from './clipboard';
import { clear, debounce, el } from './dom';
import type { FormContext, TypingEdit } from './form-kit';
import { createHistory } from './history';
import { changeBytes, textAfter, textBefore, toChange, type TypingChange } from './typing';
import { buildLetterForm, type LetterView } from './letter-view';
import { letterWarnings, nextMonth } from './letter-ops';
import { createPreviewFrames } from './preview-frames';

/** One typed change in one field, with the caret either side. */
type TypingPatch = TypingChange;

/** Everything the screen is drawn from. A step that is not typing keeps two of these. */
interface Snapshot {
  letter: LetterForm;
}

export function mountLetter(root: HTMLElement): void {
  /* ---------- state ---------- */
  let letter: LetterForm = emptyLetter(nextMonth(todayFrom(new Date())));
  let view: LetterView | null = null;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  const history = createHistory<Snapshot, TypingPatch>({ patchBytes: changeBytes });
  let pendingBefore: Snapshot | null = null;

  const capture = (): Snapshot => ({ letter: structuredClone(letter) });
  /** Call just before a structural change. Keeps the letter as it is now. */
  function begin(): void {
    pendingBefore ??= capture();
  }
  /** Call just after a structural change. */
  function step(label: string): void {
    const before = pendingBefore ?? capture();
    pendingBefore = null;
    history.recordSnapshot(before, capture(), label);
    updateHistoryBar();
    updateCounter();
  }

  /* ---------- top of the screen ---------- */
  const draftNote = el('section', { className: 'card' }, [
    el('p', {
      className: 'status-line',
      textContent: 'You are starting from a blank letter for next month.',
    }),
    el('p', {
      className: 'hint',
      textContent:
        "Copying last month's issue comes with drafts, in a later update. For now, fill in each section below.",
    }),
  ]);

  const undoButton = el('button', { type: 'button', className: 'btn', textContent: 'Undo' });
  const redoButton = el('button', { type: 'button', className: 'btn', textContent: 'Redo' });
  const historyNote = el('span', { className: 'history-note' });
  historyNote.setAttribute('role', 'status');
  historyNote.setAttribute('aria-live', 'polite');
  const counter = el('p', { className: 'read-time' });
  counter.setAttribute('aria-label', 'Read time and word count');
  const historyBar = el('div', { className: 'history-bar letter-bar' }, [
    undoButton,
    redoButton,
    counter,
    historyNote,
  ]);
  historyBar.setAttribute('role', 'group');
  historyBar.setAttribute('aria-label', 'Undo, redo and read time');
  historyBar.tabIndex = -1;

  function updateHistoryBar(): void {
    undoButton.disabled = !history.canUndo();
    redoButton.disabled = !history.canRedo();
  }
  function updateCounter(): void {
    const words = letterWords(letter);
    counter.textContent = `${readTimeText(words)} ${words.toLocaleString('en-US')} ${
      words === 1 ? 'word' : 'words'
    }.`;
  }

  /* ---------- form ---------- */
  const formHeading = el('h2', { textContent: 'Edit the letter' });
  formHeading.tabIndex = -1;
  const formHost = el('div', { className: 'form-host' });
  const left = el('div', { className: 'column' }, [formHeading, formHost]);

  /* ---------- output ---------- */
  const warningsBox = el('div', { className: 'warnings' });
  const copyButton = el('button', {
    type: 'button',
    className: 'btn primary',
    textContent: 'Copy letter HTML',
  });
  const copiedNote = el('span', { className: 'copied' });
  copiedNote.setAttribute('role', 'status');
  const copyNote = el('p', { className: 'hint' });
  copyNote.setAttribute('role', 'status');
  const codeArea = el('textarea', { id: 'letter-code-box', className: 'control code', rows: 12 });
  codeArea.readOnly = true;
  codeArea.spellcheck = false;
  const codeDetails = el('details', { className: 'code-details' }, [
    el('summary', { textContent: 'Show the code' }),
    el('label', {
      htmlFor: 'letter-code-box',
      className: 'label',
      textContent: 'Letter HTML (read only)',
    }),
    codeArea,
  ]);
  const frames = createPreviewFrames();

  const right = el('div', { className: 'column output letter-output' }, [
    el('section', { className: 'card' }, [
      el('h2', { textContent: 'Check and copy' }),
      warningsBox,
      el('div', { className: 'row-actions' }, [copyButton, copiedNote]),
      copyNote,
      codeDetails,
    ]),
    el('section', { className: 'card' }, [
      el('h2', { textContent: 'Preview' }),
      el('p', {
        className: 'hint',
        textContent:
          'Pictures and the logo show as grey boxes here. They appear normally once the email is sent.',
      }),
      ...frames.figures,
    ]),
  ]);

  root.append(draftNote, historyBar, el('div', { className: 'workspace' }, [left, right]));

  function showWarnings(list: string[], lintProblems: string[]): void {
    clear(warningsBox);
    if (list.length === 0 && lintProblems.length === 0) {
      warningsBox.append(
        el('p', { className: 'ok', textContent: 'Nothing to fix. This is ready to copy.' }),
      );
      return;
    }
    const ul = el('ul', { className: 'warn-list' });
    for (const text of list) ul.append(el('li', { textContent: text }));
    for (const text of lintProblems) {
      ul.append(
        el('li', {
          textContent: `Problem with the letter HTML. Tell whoever looks after this tool: ${text}`,
        }),
      );
    }
    warningsBox.append(el('p', { className: 'label', textContent: 'Things to look at' }), ul);
  }

  function refreshOutput(): void {
    updateCounter();
    let html: string;
    try {
      html = renderLetter(letter);
    } catch {
      showWarnings(['The preview could not be made from this letter.'], []);
      return;
    }
    let problems: string[];
    try {
      problems = lintOutput(html, { monthly: true });
    } catch {
      problems = ['The checker could not read the letter HTML.'];
    }
    showWarnings(letterWarnings(letter), problems);
    codeArea.value = html;
    frames.show(html);
  }
  const refreshLater = debounce(refreshOutput, 150);

  /* ---------- form wiring ---------- */
  const ctx: FormContext = {
    checks: () => [],
    suggestions: () => [],
    warnings: () => [],
    typed(edit: TypingEdit) {
      history.recordPatch(toChange(edit), edit.label);
      refreshLater.run();
      updateHistoryBar();
    },
    begin,
    step(label: string) {
      refreshLater.run();
      step(label);
    },
    history: (kind) => travel(kind, 'key'),
    swapped() {},
    removed() {},
    apply() {},
  };

  function drawForm(): void {
    clear(formHost);
    view = buildLetterForm(letter, ctx);
    formHost.append(view.element);
  }

  /* ---------- copy ---------- */
  copyButton.addEventListener('click', () => {
    refreshLater.cancel();
    let html: string;
    try {
      html = renderLetter(letter);
    } catch {
      copyNote.textContent = 'The letter HTML could not be made from this letter.';
      return;
    }
    codeArea.value = html;
    clearTimeout(copiedTimer);
    copiedNote.textContent = '';
    copyNote.textContent = '';
    const env = {
      ...browserClipboardEnv(),
      beforeSelect: () => {
        // A closed <details> hides the textarea, and a hidden textarea cannot be selected.
        codeDetails.open = true;
      },
    };
    void copyText(html, codeArea, env).then((outcome) => {
      if (outcome === 'copied') {
        copiedNote.textContent = 'Copied';
        copiedTimer = setTimeout(() => (copiedNote.textContent = ''), 6000);
      } else {
        codeDetails.open = true;
        copyNote.textContent =
          'Copying did not work here. The code is selected below. Press Ctrl+C (Command+C on a Mac) to copy it.';
      }
    });
  });

  /* ---------- undo and redo ---------- */
  function restore(snap: Snapshot): void {
    refreshLater.cancel();
    letter = snap.letter;
    copiedNote.textContent = '';
    copyNote.textContent = '';
    drawForm();
    refreshOutput();
  }

  function travel(kind: 'undo' | 'redo', from: 'button' | 'key'): void {
    if (kind === 'undo' ? !history.canUndo() : !history.canRedo()) {
      historyNote.textContent = kind === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.';
      return;
    }
    const move = kind === 'undo' ? history.undo() : history.redo();
    if (!move) return;
    const words = kind === 'undo' ? 'Undone' : 'Redone';
    let target: HTMLElement | null = null;
    if (move.kind === 'snapshot') {
      restore(move.state);
    } else {
      const patch = move.patch;
      const field = view?.fieldControl(patch.path);
      const now =
        field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
          ? field.value
          : '';
      const text = move.direction === 'undo' ? textBefore(now, patch) : textAfter(now, patch);
      const sel = move.direction === 'undo' ? patch.selBefore : patch.selAfter;
      if (field && view?.setField(patch.path, text, sel)) {
        target = view.fieldControl(patch.path);
        refreshLater.run();
      }
    }
    historyNote.textContent = `${words}: ${move.label}`;
    updateHistoryBar();
    if (from === 'key') {
      if (target) target.focus();
      else if (!root.contains(document.activeElement) || document.activeElement === document.body) {
        formHeading.focus();
      }
    } else {
      target?.scrollIntoView({ block: 'nearest' });
      // Stay on the button that was pressed. If it just switched off, use the other one.
      const pressed = kind === 'undo' ? undoButton : redoButton;
      const other = kind === 'undo' ? redoButton : undoButton;
      if (pressed.disabled) (other.disabled ? historyBar : other).focus();
      else pressed.focus();
    }
  }

  undoButton.addEventListener('click', () => travel('undo', 'button'));
  redoButton.addEventListener('click', () => travel('redo', 'button'));

  document.addEventListener('keydown', (event) => {
    if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
    // Only when this screen is the one showing. The other screen has its own history.
    if (root.getClientRects().length === 0) return;
    const key = event.key.toLowerCase();
    let kind: 'undo' | 'redo' | null = null;
    if (key === 'z') kind = event.shiftKey ? 'redo' : 'undo';
    else if (key === 'y' && event.ctrlKey && !event.shiftKey) kind = 'redo';
    if (kind === null) return;
    // Always the app's own history, so the browser's text undo never disagrees with it.
    event.preventDefault();
    travel(kind, 'key');
  });

  drawForm();
  updateHistoryBar();
  refreshOutput();
}
