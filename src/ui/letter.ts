/**
 * The Monthly letter screen (build spec 8.1). Plain DOM, no framework. The person fills a
 * LetterForm; `renderLetter` turns it into the email HTML, shown in sandboxed previews with
 * images swapped for placeholders. Copying is never blocked by a lint problem (owner decision).
 */
import { formatMonthYear, todayFrom } from '../core/dates';
import {
  MAX_DRAFT_BYTES,
  nextIssueFrom,
  draftLinkWarnings,
  readDraft,
  writeDraft,
  type DraftFile,
} from '../core/draft';
import { lintOutput } from '../core/lint-output';
import { emptyLetter, letterWords, readTimeText, type LetterForm } from '../core/letter';
import { renderLetter } from '../core/render-letter';
import { browserClipboardEnv, copyText } from './clipboard';
import { clear, debounce, el } from './dom';
import { markSpelling } from './field-kinds';
import { registerFlush } from './safety';
import { announce, createThrottle, SAVE_ANNOUNCE_GAP_MS } from './announce';
import { SPELLING_NOTE } from './guide';
import type { FormContext, TypingEdit } from './form-kit';
import type { SettingsStore } from './app-settings';
import { createHistory, type History } from './history';
import {
  clockText,
  draftFileName,
  draftLinkReports,
  draftRepairNotice,
  settingsDifferences,
  startChoices,
  type RepairNotice,
  type StartChoice,
} from './settings-logic';
import type { OtherTabGuard } from './other-tab';
import type { DeviceStorage } from './storage';
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

export interface LetterDeps {
  settings: SettingsStore;
  storage: DeviceStorage;
  /** Another tab changed the saved data. Saves are held back until the person chooses. */
  guard?: OtherTabGuard;
  /** Shows one short notice at the top of the app. */
  notify?: (notice: RepairNotice) => void;
}

/** How long after the last change the draft is saved on the device. */
const AUTOSAVE_MS = 1000;

export function mountLetter(root: HTMLElement, deps: LetterDeps): void {
  const { settings, storage } = deps;
  /* ---------- state ---------- */
  const blankLetter = (): LetterForm =>
    emptyLetter(nextMonth(todayFrom(new Date())), settings.get());
  let letter: LetterForm = blankLetter();
  let view: LetterView | null = null;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  const newHistory = (): History<Snapshot, TypingPatch> =>
    createHistory<Snapshot, TypingPatch>({ patchBytes: changeBytes });
  let history = newHistory();
  let pendingBefore: Snapshot | null = null;

  const capture = (): Snapshot => {
    view?.flush();
    return { letter: structuredClone(letter) };
  };
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
  const statusLine = el('p', {
    className: 'status-line',
    textContent: 'You are starting from a blank letter for next month.',
  });
  const draftNote = el('section', { className: 'card' }, [
    statusLine,
    el('p', {
      className: 'hint',
      textContent:
        'Fill in each section below. Your work is saved on this device as you go. Use Download draft to keep a copy or to move it to another device.',
    }),
    el('p', { className: 'hint', textContent: SPELLING_NOTE }),
  ]);
  // Shown instead of the editor when a saved draft is found, or when a draft file is opened.
  const choicePanel = el('section', { className: 'card choice-panel' });
  choicePanel.hidden = true;
  choicePanel.tabIndex = -1;
  choicePanel.dataset.skip = '';

  const undoButton = el('button', { type: 'button', className: 'btn', textContent: 'Undo' });
  const redoButton = el('button', { type: 'button', className: 'btn', textContent: 'Redo' });
  // Not a live region: autosave would speak again and again. `announce` speaks it sparingly.
  const saveNote = el('span', { className: 'history-note save-note' });
  const downloadButton = el('button', {
    type: 'button',
    className: 'btn',
    textContent: 'Download draft',
  });
  const openButton = el('button', { type: 'button', className: 'btn', textContent: 'Open draft' });
  const openInput = el('input', { type: 'file', accept: '.json,application/json' });
  openInput.hidden = true;
  openInput.setAttribute('aria-label', 'Choose a draft file to open');
  const fileNote = el('p', { className: 'hint' });
  fileNote.setAttribute('role', 'status');
  const historyNote = el('span', { className: 'history-note' });
  const counter = el('p', { className: 'read-time' });
  counter.setAttribute('aria-label', 'Read time and word count');
  const historyBar = el('div', { className: 'history-bar letter-bar' }, [
    undoButton,
    redoButton,
    counter,
    historyNote,
    saveNote,
    downloadButton,
    openButton,
    openInput,
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
  formHeading.dataset.skip = '';
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
  markSpelling(codeArea, 'code');
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

  const workspace = el('div', { className: 'workspace' }, [left, right]);
  root.append(draftNote, choicePanel, historyBar, fileNote, workspace);

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
    view?.flush();
    updateCounter();
    settings.setLetterFeedback(letter.feedback);
    let html: string;
    try {
      html = renderLetter(letter, settings.get());
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
      saveLater();
      refreshLater.run();
      updateHistoryBar();
    },
    begin,
    step(label: string) {
      saveLater();
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
    view?.flush();
    refreshLater.cancel();
    let html: string;
    try {
      html = renderLetter(letter, settings.get());
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
    saveLater();
    copiedNote.textContent = '';
    copyNote.textContent = '';
    drawForm();
    refreshOutput();
  }

  function travel(kind: 'undo' | 'redo', from: 'button' | 'key'): void {
    view?.flush();
    if (kind === 'undo' ? !history.canUndo() : !history.canRedo()) {
      historyNote.textContent = kind === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.';
      announce(historyNote.textContent);
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
        saveLater();
        refreshLater.run();
      }
    }
    historyNote.textContent = `${words}: ${move.label}`;
    announce(historyNote.textContent);
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

  /* ---------- autosave (spec 8.3) ---------- */
  const speakSave = createThrottle(SAVE_ANNOUNCE_GAP_MS);
  function reportSave(ok: boolean, when: Date): void {
    saveNote.textContent = ok
      ? `Saved on this device at ${clockText(when)}`
      : 'Could not save on this device';
    if (!ok) announce('Could not save on this device');
    else if (speakSave('saved', Date.now())) announce('Saved on this device');
  }
  function saveNow(): void {
    view?.flush();
    const when = new Date();
    let ok: boolean;
    try {
      ok = storage.saveDraft(writeDraft(letter, settings.get(), when));
    } catch {
      ok = false;
    }
    reportSave(ok, when);
  }
  const saveSoon = debounce(saveNow, AUTOSAVE_MS);
  let saving = true;
  // "Keep my version here" in the other-tab notice saves this letter at once.
  deps.guard?.onKeep(() => {
    if (saving) saveNow();
  });
  function saveLater(): void {
    if (saving) saveSoon.run();
  }
  // Closing or hiding the page counts as the last change, so nothing typed in the last second is lost.
  const settleAndSave = (): void => {
    view?.flush();
    saveSoon.flush();
  };
  registerFlush(settleAndSave);
  window.addEventListener('pagehide', settleAndSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') settleAndSave();
  });

  /* ---------- choices: saved draft and opened files ---------- */
  function showEditor(on: boolean): void {
    workspace.hidden = !on;
    historyBar.hidden = !on;
    draftNote.hidden = !on;
    choicePanel.hidden = on;
  }

  /** Replaces the whole letter. `asStep` makes it one undoable step; otherwise history starts fresh. */
  function loadLetter(next: LetterForm, asStep: string | null, status: string): void {
    refreshLater.cancel();
    if (asStep !== null) begin();
    else {
      history = newHistory();
      pendingBefore = null;
    }
    letter = next;
    statusLine.textContent = status;
    drawForm();
    refreshOutput();
    if (asStep !== null) step(asStep);
    else updateHistoryBar();
    historyNote.textContent = '';
    copiedNote.textContent = '';
    copyNote.textContent = '';
  }

  function textList(items: string[]): HTMLElement {
    const ul = el('ul', { className: 'warn-list' });
    for (const text of items) ul.append(el('li', { textContent: text }));
    return ul;
  }

  // Escape in the "open this draft?" question is the same as its Cancel button.
  let escapeChoice: (() => void) | null = null;
  choicePanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && escapeChoice && !choicePanel.hidden) {
      event.preventDefault();
      escapeChoice();
    }
  });

  function offerSavedDraft(draft: DraftFile): void {
    escapeChoice = null;
    saving = false;
    clear(choicePanel);
    const buttons = el('div', { className: 'choice-list' });
    let first: HTMLButtonElement | null = null;
    const pick = (choice: StartChoice): void => {
      const when = new Date();
      let next: LetterForm;
      let status: string;
      if (choice.id === 'blank') {
        next = blankLetter();
        status = 'You are starting from a blank letter for next month.';
      } else if (choice.id === 'next' && choice.issue) {
        next = nextIssueFrom(draft.letter, choice.issue);
        status = `You are starting the ${formatMonthYear(choice.issue)} letter from the saved one.`;
      } else {
        next = draft.letter;
        status = `You are working on the ${formatMonthYear(draft.letter.issue)} letter from this device.`;
      }
      saving = true;
      showEditor(true);
      loadLetter(next, null, status);
      if (choice.id === 'keep') reportSave(true, new Date(draft.savedAt || when));
      formHeading.focus();
    };
    for (const choice of startChoices(draft)) {
      const b = el('button', {
        type: 'button',
        className: choice.id === 'keep' ? 'btn primary' : 'btn',
        textContent: choice.label,
      });
      b.addEventListener('click', () => pick(choice));
      first ??= b;
      buttons.append(b);
    }
    const saved = new Date(draft.savedAt);
    choicePanel.append(
      el('h2', { textContent: 'You have a saved letter on this device' }),
      el('p', {
        className: 'hint',
        textContent: Number.isNaN(saved.getTime())
          ? 'Choose how to begin.'
          : `It was last saved at ${clockText(saved)} on ${saved.toLocaleDateString('en-US')}. Choose how to begin.`,
      }),
      buttons,
    );
    showEditor(false);
    first?.focus();
  }

  /* ---------- download and open a draft file ---------- */
  downloadButton.addEventListener('click', () => {
    view?.flush();
    fileNote.textContent = '';
    try {
      const text = writeDraft(letter, settings.get(), new Date());
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = el('a', { href: url, download: draftFileName(letter.issue) });
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      fileNote.textContent = `Saved the draft as ${draftFileName(letter.issue)}. Look in your Downloads folder.`;
    } catch {
      fileNote.textContent = 'The draft file could not be made.';
    }
  });

  openButton.addEventListener('click', () => {
    openInput.value = '';
    openInput.click();
  });

  function offerOpenedDraft(
    name: string,
    result: Extract<ReturnType<typeof readDraft>, { ok: true }>,
  ): void {
    const { draft } = result;
    const notes = [...result.notes];
    if (result.migrated)
      notes.unshift('This draft was written by an older version and has been brought up to date.');
    const sameSettings = JSON.stringify(draft.settings) === JSON.stringify(settings.get());
    clear(choicePanel);
    const finish = (useSettings: boolean): void => {
      escapeChoice = null;
      if (useSettings) {
        settings.set(draft.settings);
        settings.markSeen();
      }
      saving = true;
      showEditor(true);
      loadLetter(
        draft.letter,
        'opened a draft',
        `You opened ${name}. It is the ${formatMonthYear(draft.letter.issue)} letter.`,
      );
      saveLater();
      fileNote.textContent = useSettings
        ? 'Opened the draft with its settings. Undo puts your earlier letter back, but not your earlier settings.'
        : 'Opened the draft. Undo puts your earlier letter back.';
      formHeading.focus();
    };
    const cancel = el('button', {
      type: 'button',
      className: 'btn',
      textContent: 'Cancel, do not open it',
    });
    cancel.addEventListener('click', () => {
      escapeChoice = null;
      saving = true;
      showEditor(true);
      fileNote.textContent = 'Nothing was changed.';
      openButton.focus();
    });
    const actions = el('div', { className: 'choice-list' });
    let first: HTMLButtonElement;
    if (sameSettings) {
      first = el('button', {
        type: 'button',
        className: 'btn primary',
        textContent: 'Open this draft',
      });
      first.addEventListener('click', () => finish(false));
      actions.append(first, cancel);
    } else {
      // Keeping your own settings is the safe default, so it is the primary and focused button.
      first = el('button', {
        type: 'button',
        className: 'btn primary',
        textContent: 'Keep my settings',
      });
      first.addEventListener('click', () => finish(false));
      const use = el('button', {
        type: 'button',
        className: 'btn',
        textContent: 'Use the settings from this draft',
      });
      use.addEventListener('click', () => finish(true));
      actions.append(first, use, cancel);
    }
    const differences = sameSettings ? [] : settingsDifferences(settings.get(), draft.settings);
    let reports: ReturnType<typeof draftLinkReports> = [];
    try {
      reports = draftLinkReports(
        draftLinkWarnings,
        draft.letter,
        settings.get(),
        draft.settings,
        !sameSettings,
      );
    } catch {
      reports = [];
    }
    const linkSection = (): HTMLElement => {
      const box = el('div', { className: 'warnings' }, [
        el('p', { className: 'label', textContent: "Where this draft's links go" }),
      ]);
      const any = reports.some((r) => r.lines.length > 0);
      if (!any) {
        box.append(el('p', { className: 'hint', textContent: 'Nothing unusual was found.' }));
      }
      for (const report of reports) {
        if (report.lines.length === 0) continue;
        if (report.heading !== '') {
          box.append(el('p', { className: 'hint', textContent: `${report.heading}:` }));
        }
        box.append(textList(report.lines));
      }
      return box;
    };
    const differenceSection = (): HTMLElement => {
      const ul = el('ul', { className: 'warn-list' });
      for (const d of differences) {
        const li = el('li', { textContent: d.text });
        if (d.hostText !== '') li.append(el('br'), d.hostText);
        ul.append(li);
      }
      return el('div', { className: 'warnings' }, [
        el('p', { className: 'label', textContent: 'Settings that are different' }),
        el('p', {
          className: 'hint',
          textContent:
            "Each line shows your value, then an arrow, then the draft's value. If you use the draft's settings, they are saved on this device and used for every letter you make. You cannot undo that with the Undo button. You can change them again in Settings.",
        }),
        ul,
      ]);
    };
    choicePanel.append(
      el('h2', { textContent: `Open ${name}?` }),
      el('p', {
        className: 'hint',
        textContent: `This is the ${formatMonthYear(draft.letter.issue)} letter. Opening it replaces the letter on screen. You can undo that.`,
      }),
      ...(notes.length > 0
        ? [
            el('div', { className: 'warnings' }, [
              el('p', { className: 'label', textContent: 'Things to know about this file' }),
              textList(notes),
            ]),
          ]
        : []),
      sameSettings
        ? el('p', {
            className: 'hint',
            textContent: 'The draft uses the same settings as you have now.',
          })
        : el('p', {
            className: 'hint',
            textContent:
              'The draft was written with different settings (links, emails or logo). Do you want to use its settings too?',
          }),
      ...(sameSettings ? [] : [differenceSection()]),
      linkSection(),
      actions,
    );
    escapeChoice = () => cancel.click();
    // Save what was typed in the last second before the panel takes over, then pause saving.
    settleAndSave();
    saving = false;
    showEditor(false);
    first.focus();
  }

  openInput.addEventListener('change', () => {
    const file = openInput.files?.[0];
    if (!file) return;
    fileNote.textContent = '';
    if (file.size > MAX_DRAFT_BYTES) {
      fileNote.textContent = `That file is too big to be a letter draft (the limit is ${Math.round(MAX_DRAFT_BYTES / (1024 * 1024))} MB).`;
      return;
    }
    void file
      .text()
      .then((text) => {
        const result = readDraft(text);
        if (!result.ok) {
          fileNote.textContent = result.message;
          return;
        }
        offerOpenedDraft(file.name, result);
      })
      .catch(() => {
        fileNote.textContent = 'That file could not be read.';
      });
  });

  // A changed setting changes the links in the letter, so draw the preview again.
  settings.subscribe(() => {
    refreshLater.run();
    saveLater();
  });

  drawForm();
  updateHistoryBar();
  refreshOutput();

  const found = storage.loadDraft();
  if (found?.ok) {
    const notice = draftRepairNotice(found.notes);
    if (notice) deps.notify?.(notice);
    offerSavedDraft(found.draft);
  } else if (found && !found.ok) {
    fileNote.textContent = 'A saved letter on this device could not be read, so it was not used.';
  }
}
