/**
 * The Announcement Converter screen (build spec 7.1, 7.2 and 7.5).
 * Plain DOM, no framework. Pasted HTML goes only through parse(); only the content model and the
 * form reach the page, and every string is set with textContent or .value.
 */
import type { SettingsStore } from './app-settings';
import { todayFrom } from '../core/dates';
import {
  applySuggestion,
  fillForm,
  suggestionsFor,
  switchLayout,
  type CheckMe,
  type FieldPath,
  type Suggestion,
} from '../core/fill';
import { formWarnings, type FormWarning } from '../core/form-warnings';
import type { AnnouncementForm } from '../core/forms';
import { lintOutput } from '../core/lint-output';
import type { Issue, Layout } from '../core/model';
import { parse, type ParseResult } from '../core/pipeline';
import { renderAnnouncement } from '../core/render';
import { browserClipboardEnv, copyText } from './clipboard';
import { clear, debounce, el } from './dom';
import { markSpelling } from './field-kinds';
import { announce } from './announce';
import { registerFlush } from './safety';
import { codesPref, createCodesSwitch } from './codes-switch';
import { buildForm, type FormView } from './form-view';
import type { FormContext, TypingEdit } from './form-kit';
import { createHistory } from './history';
import { changeBytes, textAfter, textBefore, toChange, type TypingChange } from './typing';
import { buildGuide } from './guide';
import { capIssues, remapAfterRemove, remapAfterSwap } from './paths';
import { createPreviewFrames } from './preview-frames';

/** Largest paste accepted, in bytes (ADR 0004 UI 5). */
export const MAX_PASTE_BYTES = 2 * 1024 * 1024;

const LAYOUTS: { id: Layout; name: string; use: string }[] = [
  { id: 'message', name: 'Message', use: 'A short note' },
  { id: 'call-to-action', name: 'Call to action', use: 'One ask with one link' },
  { id: 'link-list', name: 'Link list', use: 'Several links to read' },
  { id: 'date-list', name: 'Date list', use: 'Events by date' },
  { id: 'help-wanted', name: 'Help wanted', use: 'Volunteer asks' },
];

interface Session {
  form: AnnouncementForm;
  checks: CheckMe[];
}

/** Everything the screen is drawn from. A step that is not typing keeps two of these. */
interface Snapshot {
  pasteText: string;
  parsed: ParseResult | null;
  layout: Layout | null;
  sessions: [Layout, Session][];
}

/** One typed change in one field, with the caret either side. */
interface TypingPatch extends TypingChange {
  layout: Layout;
}

function layoutName(id: Layout): string {
  return LAYOUTS.find((l) => l.id === id)?.name ?? id;
}

export function mountConverter(root: HTMLElement, settings: SettingsStore): void {
  /* ---------- state ---------- */
  let parsed: ParseResult | null = null;
  let layout: Layout | null = null;
  const sessions = new Map<Layout, Session>();
  let warnings: FormWarning[] = [];
  let view: FormView | null = null;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  /** The text of the paste box as of the last time the form was filled from it. */
  let committedPaste = '';
  const history = createHistory<Snapshot, TypingPatch>({ patchBytes: changeBytes });
  let pendingBefore: Snapshot | null = null;

  function capture(): Snapshot {
    view?.flush();
    return structuredClone({
      pasteText: committedPaste,
      parsed,
      layout,
      sessions: [...sessions.entries()],
    });
  }
  /** Call just before a structural change. Keeps the screen state as it is now. */
  function begin(): void {
    pendingBefore ??= capture();
  }
  /** Call just after a structural change. */
  function step(label: string): void {
    const before = pendingBefore ?? capture();
    pendingBefore = null;
    history.recordSnapshot(before, capture(), label);
    updateHistoryBar();
  }

  /** The one-tap fixes for the form as it is now. Worked out again after every change. */
  let shownSuggestions: Suggestion[] = [];

  const current = (): Session | undefined => (layout ? sessions.get(layout) : undefined);

  /* ---------- paste section ---------- */
  const pasteArea = el('textarea', { id: 'paste-box', className: 'control paste', rows: 8 });
  markSpelling(pasteArea, 'code');
  pasteArea.autocomplete = 'off';
  pasteArea.dataset.skip = '';
  pasteArea.setAttribute('aria-describedby', 'paste-hint paste-status');
  const status = el('p', { id: 'paste-status', className: 'status' });
  status.setAttribute('role', 'status');
  const issuesBox = el('div', { className: 'issues' });

  const startOver = el('button', { type: 'button', className: 'btn', textContent: 'Start over' });
  startOver.hidden = true;
  const confirmBox = el('div', { className: 'confirm' });
  confirmBox.hidden = true;
  const confirmYes = el('button', {
    type: 'button',
    className: 'btn danger',
    textContent: 'Yes, start over',
  });
  const confirmNo = el('button', { type: 'button', className: 'btn', textContent: 'Keep working' });
  confirmBox.append(
    el('p', {
      textContent: 'Start over? This clears the pasted HTML and everything you changed.',
    }),
    el('div', { className: 'row-actions' }, [confirmYes, confirmNo]),
  );
  confirmBox.setAttribute('role', 'group');
  confirmBox.setAttribute('aria-label', 'Confirm start over');

  const pasteSection = el('section', { className: 'card paste-section' }, [
    el('label', {
      htmlFor: 'paste-box',
      className: 'label big',
      textContent: 'Paste the old HTML here',
    }),
    pasteArea,
    el('p', {
      id: 'paste-hint',
      className: 'hint',
      textContent: 'This tool never sends what you paste or type anywhere.',
    }),
    status,
    el('div', { className: 'row-actions' }, [startOver]),
    confirmBox,
    issuesBox,
  ]);

  /* ---------- results ---------- */
  const layoutBox = el('fieldset', { className: 'group layout-picker' });
  const formHeading = el('h2', { textContent: 'Edit the announcement' });
  formHeading.tabIndex = -1;
  const formHost = el('div', { className: 'form-host' });
  // Redraws the fields in the other style. Nothing typed is lost: the form is brought up to date
  // first, and no undo step is recorded.
  const codes = createCodesSwitch(() => {
    view?.flush();
    drawForm();
  });
  const left = el('div', { className: 'column' }, [
    el('section', { className: 'card' }, [layoutBox]),
    el('section', { className: 'card' }, [formHeading, codes.element, formHost]),
  ]);

  const warningsBox = el('div', { className: 'warnings' });
  const copyButton = el('button', {
    type: 'button',
    className: 'btn primary',
    textContent: 'Copy new HTML',
  });
  const copiedNote = el('span', { className: 'copied' });
  copiedNote.setAttribute('role', 'status');
  const copyNote = el('p', { className: 'hint' });
  copyNote.setAttribute('role', 'status');
  const codeArea = el('textarea', { id: 'code-box', className: 'control code', rows: 12 });
  codeArea.readOnly = true;
  markSpelling(codeArea, 'code');
  const codeDetails = el('details', { className: 'code-details' }, [
    el('summary', { textContent: 'Show the code' }),
    el('label', { htmlFor: 'code-box', className: 'label', textContent: 'New HTML (read only)' }),
    codeArea,
  ]);

  const frames = createPreviewFrames();

  const right = el('div', { className: 'column output' }, [
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
          'Pictures show as grey boxes here. They appear normally once the email is sent.',
      }),
      ...frames.figures,
    ]),
  ]);

  const results = el('div', { className: 'workspace' }, [left, right]);
  results.hidden = true;

  /* ---------- undo and redo ---------- */
  const undoButton = el('button', { type: 'button', className: 'btn', textContent: 'Undo' });
  const redoButton = el('button', { type: 'button', className: 'btn', textContent: 'Redo' });
  const historyNote = el('span', { className: 'history-note' });
  const historyBar = el('div', { className: 'history-bar' }, [undoButton, redoButton, historyNote]);
  historyBar.setAttribute('role', 'group');
  historyBar.setAttribute('aria-label', 'Undo and redo');
  historyBar.tabIndex = -1;
  historyBar.hidden = true;

  function updateHistoryBar(): void {
    undoButton.disabled = !history.canUndo();
    redoButton.disabled = !history.canRedo();
    historyBar.hidden = parsed === null && !history.canUndo() && !history.canRedo();
  }

  registerFlush(() => {
    view?.flush();
    handlePasteLater.flush();
  });
  root.append(buildGuide(), pasteSection, historyBar, results);

  /* ---------- output ---------- */
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
          textContent: `Problem with the new HTML. Tell whoever looks after this tool: ${text}`,
        }),
      );
    }
    warningsBox.append(el('p', { className: 'label', textContent: 'Things to look at' }), ul);
  }

  function refreshOutput(): void {
    view?.flush();
    const session = current();
    if (!session) return;
    let html: string;
    try {
      html = renderAnnouncement(session.form);
    } catch {
      showWarnings(['The preview could not be made from this form.'], []);
      return;
    }
    warnings = formWarnings(session.form);
    shownSuggestions = suggestionsFor(session.form);
    view?.refreshWarnings();
    view?.refreshSuggestions();
    showWarnings(
      warnings.map((w) => w.message),
      lintOutput(html),
    );
    codeArea.value = html;
    // The preview works on a copy of the output. The code and the copy button keep the original.
    frames.show(html);
  }
  const refreshLater = debounce(refreshOutput, 150);

  /* ---------- form ---------- */
  const ctx: FormContext = {
    checks: () => current()?.checks ?? [],
    suggestions: () => shownSuggestions,
    warnings: () => warnings,
    typed(edit: TypingEdit) {
      if (!layout) return;
      const { label, ...patch } = edit;
      history.recordPatch({ ...toChange(patch), layout }, label);
      refreshLater.run();
      updateHistoryBar();
    },
    begin,
    step(label: string) {
      refreshLater.run();
      step(label);
    },
    history: (kind) => travel(kind, 'key'),
    swapped(arrayPath: FieldPath, a: number, b: number) {
      const s = current();
      if (!s) return;
      s.checks = remapAfterSwap(s.checks, arrayPath, a, b);
    },
    removed(arrayPath: FieldPath, index: number) {
      const s = current();
      if (!s) return;
      s.checks = remapAfterRemove(s.checks, arrayPath, index);
    },
    apply(suggestion: Suggestion) {
      const s = current();
      if (!s) return;
      begin();
      s.form = applySuggestion(s.form, suggestion);
      drawForm();
      refreshOutput();
      status.textContent = 'Fix applied.';
      step('applied a fix');
      formHeading.focus();
    },
  };

  function drawForm(): void {
    const session = current();
    clear(formHost);
    view = null;
    if (!session) return;
    warnings = formWarnings(session.form);
    shownSuggestions = suggestionsFor(session.form);
    view = buildForm(session.form, ctx, codesPref.get);
    formHost.append(view.element);
  }

  function drawLayoutPicker(): void {
    clear(layoutBox);
    layoutBox.append(el('legend', { textContent: 'Layout' }));
    const suggested = parsed?.suggestion;
    for (const option of LAYOUTS) {
      const input = el('input', { type: 'radio', name: 'layout', value: option.id });
      input.checked = option.id === layout;
      input.addEventListener('change', () => {
        if (input.checked) switchTo(option.id);
      });
      const isSuggested = suggested?.layout === option.id;
      layoutBox.append(
        el('label', { className: 'choice' }, [
          input,
          el('span', {}, [
            el('strong', { textContent: option.name }),
            isSuggested ? el('span', { className: 'badge', textContent: 'Suggested' }) : null,
            el('small', { textContent: option.use }),
          ]),
        ]),
      );
    }
    if (suggested) {
      layoutBox.append(
        el('p', {
          className: 'hint',
          textContent: `Why ${layoutName(suggested.layout)}? ${suggested.reason}`,
        }),
        el('p', {
          className: 'hint',
          textContent:
            'You can switch at any time. Your words come with you, and going back to a layout restores what you had there.',
        }),
      );
    }
  }

  function switchTo(next: Layout): void {
    view?.flush();
    const session = current();
    if (!session || layout === null || next === layout) return;
    begin();
    if (!sessions.has(next)) {
      // Cloned so that editing one layout can never change another layout's saved form.
      // Today's date lets Date list read dates written in the text (owner request, 2026-11-22).
      const form = structuredClone(
        switchLayout(session.form, next, {
          today: todayFrom(new Date()),
          programYearStartMonth: settings.get().programYearStartMonth,
        }),
      );
      sessions.set(next, { form, checks: [] });
    }
    layout = next;
    drawLayoutPicker();
    drawForm();
    refreshOutput();
    status.textContent = `Switched to ${layoutName(next)}.`;
    step(`switched to ${layoutName(next)}`);
    // Keep keyboard focus on the chosen radio so arrow keys keep working.
    layoutBox.querySelector<HTMLInputElement>('input:checked')?.focus();
  }

  /* ---------- paste ---------- */
  function showIssues(issues: Issue[]): void {
    clear(issuesBox);
    if (issues.length === 0) return;
    const { shown, hidden } = capIssues(issues);
    const ul = el('ul', { className: 'issue-list' });
    for (const issue of shown) {
      ul.append(
        el('li', {}, [
          issue.message,
          issue.detail !== ''
            ? el('span', { className: 'detail', textContent: ` (${issue.detail})` })
            : null,
        ]),
      );
    }
    issuesBox.append(
      el('p', { className: 'label', textContent: 'What we noticed in the old HTML' }),
      ul,
    );
    if (hidden > 0) {
      issuesBox.append(el('p', { className: 'hint', textContent: `And ${hidden} more.` }));
    }
  }

  function resetResults(): void {
    parsed = null;
    layout = null;
    sessions.clear();
    view = null;
    warnings = [];
    results.hidden = true;
    clear(formHost);
    clear(layoutBox);
    clear(issuesBox);
    codeArea.value = '';
    frames.clear();
  }

  function handlePaste(): void {
    const value = pasteArea.value;
    startOver.hidden = value === '';
    refreshLater.cancel();
    if (value === committedPaste) return;
    begin();
    const done = (label: string): void => {
      committedPaste = value;
      step(label);
    };
    if (value.trim() === '') {
      resetResults();
      status.textContent = '';
      done('cleared the pasted HTML');
      return;
    }
    if (new TextEncoder().encode(value).length > MAX_PASTE_BYTES) {
      resetResults();
      status.textContent =
        'That is too big to read (over 2 MB). A normal announcement is much smaller. Check that you copied only one announcement.';
      done('pasted HTML that was too big');
      return;
    }
    let result: ParseResult;
    try {
      result = parse(value);
    } catch {
      resetResults();
      status.textContent =
        'Something went wrong reading that. Copy the HTML again from the code view and paste it here.';
      done('pasted HTML that could not be read');
      return;
    }
    if (result.model.blocks.length === 0) {
      resetResults();
      showIssues(result.issues);
      status.textContent =
        'We could not find any text in that. Check that you copied everything from the code view.';
      done('pasted HTML with no text');
      return;
    }
    try {
      const fill = fillForm(result, result.suggestion.layout, {
        today: todayFrom(new Date()),
        programYearStartMonth: settings.get().programYearStartMonth,
      });
      parsed = result;
      layout = result.suggestion.layout;
      sessions.clear();
      sessions.set(layout, { form: fill.form, checks: fill.checks });
    } catch {
      resetResults();
      status.textContent =
        'Something went wrong filling in the form. Try pasting again, or tell whoever looks after this tool.';
      done('pasted HTML that could not be filled in');
      return;
    }
    status.textContent = `Read it. We chose ${layoutName(layout)}. You can change that below.`;
    showIssues(result.issues);
    results.hidden = false;
    drawLayoutPicker();
    drawForm();
    refreshOutput();
    done('pasted new HTML');
  }
  const handlePasteLater = debounce(handlePaste, 300);
  pasteArea.addEventListener('input', () => {
    startOver.hidden = pasteArea.value === '';
    handlePasteLater.run();
  });
  pasteArea.addEventListener('paste', () => {
    // The pasted text lands after this event. Read it as soon as it does.
    setTimeout(() => {
      handlePasteLater.cancel();
      handlePaste();
    }, 0);
  });

  /* ---------- copy ---------- */
  copyButton.addEventListener('click', () => {
    view?.flush();
    const session = current();
    if (!session) return;
    refreshLater.cancel();
    let html: string;
    try {
      html = renderAnnouncement(session.form);
    } catch {
      copyNote.textContent = 'The new HTML could not be made from this form.';
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

  /* ---------- start over ---------- */
  startOver.addEventListener('click', () => {
    confirmBox.hidden = false;
    startOver.hidden = true;
    confirmNo.focus();
  });
  // Escape closes the question and puts the keyboard back on the button that asked it.
  confirmBox.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !confirmBox.hidden) {
      event.preventDefault();
      event.stopPropagation();
      confirmNo.click();
    }
  });
  confirmNo.addEventListener('click', () => {
    confirmBox.hidden = true;
    startOver.hidden = pasteArea.value === '';
    startOver.focus();
  });
  confirmYes.addEventListener('click', () => {
    handlePasteLater.cancel();
    refreshLater.cancel();
    begin();
    pasteArea.value = '';
    resetResults();
    committedPaste = '';
    step('started over');
    copiedNote.textContent = '';
    copyNote.textContent = '';
    status.textContent = 'Cleared. Paste a new announcement when you are ready.';
    confirmBox.hidden = true;
    startOver.hidden = true;
    codeDetails.open = false;
    pasteArea.focus();
  });
  /* ---------- undo and redo: doing it ---------- */
  function restore(snap: Snapshot): void {
    handlePasteLater.cancel();
    refreshLater.cancel();
    committedPaste = snap.pasteText;
    pasteArea.value = snap.pasteText;
    startOver.hidden = snap.pasteText === '';
    confirmBox.hidden = true;
    copiedNote.textContent = '';
    copyNote.textContent = '';
    resetResults();
    parsed = snap.parsed;
    layout = snap.layout;
    for (const [key, value] of snap.sessions) sessions.set(key, value);
    if (parsed === null || layout === null) return;
    results.hidden = false;
    showIssues(parsed.issues);
    drawLayoutPicker();
    drawForm();
    refreshOutput();
  }

  function travel(kind: 'undo' | 'redo', from: 'button' | 'key'): void {
    view?.flush();
    handlePasteLater.flush();
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
      const now = view?.fieldText(patch.path) ?? '';
      const text = move.direction === 'undo' ? textBefore(now, patch) : textAfter(now, patch);
      const sel = move.direction === 'undo' ? patch.selBefore : patch.selAfter;
      if (field && view?.setField(patch.path, text, sel)) {
        target = view.fieldControl(patch.path);
        refreshLater.run();
      }
    }
    historyNote.textContent = `${words}: ${move.label}`;
    announce(historyNote.textContent);
    updateHistoryBar();
    if (from === 'key') {
      if (target) target.focus();
      else if (!root.contains(document.activeElement) || document.activeElement === document.body) {
        (results.hidden ? historyBar : formHeading).focus();
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
}
