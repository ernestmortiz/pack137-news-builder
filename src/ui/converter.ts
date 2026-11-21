/**
 * The Announcement Converter screen (build spec 7.1, 7.2 and 7.5).
 * Plain DOM, no framework. Pasted HTML goes only through parse(); only the content model and the
 * form reach the page, and every string is set with textContent or .value.
 */
import { packConfig } from '../config/pack.config';
import { previewWidths } from '../config/tokens';
import { todayFrom } from '../core/dates';
import {
  applySuggestion,
  fillForm,
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
import { copyText } from './clipboard';
import { clear, debounce, el } from './dom';
import { buildForm, type FormView } from './form-view';
import type { FormContext } from './form-kit';
import { buildGuide } from './guide';
import { capIssues, remapAfterRemove, remapAfterSwap } from './paths';
import { previewDocument } from './preview';

/** Largest paste accepted, in bytes (ADR 0004 UI 5). */
export const MAX_PASTE_BYTES = 2 * 1024 * 1024;

const LAYOUTS: { id: Layout; name: string; use: string }[] = [
  { id: 'message', name: 'Message', use: 'A short note' },
  { id: 'call-to-action', name: 'Call to action', use: 'One ask with one link' },
  { id: 'link-list', name: 'Link list', use: 'Several links to read' },
  { id: 'date-list', name: 'Date list', use: 'Events by date' },
  { id: 'help-wanted', name: 'Help wanted', use: 'Volunteer asks' },
];

const PREVIEW_NAMES: Record<number, string> = {
  250: 'Small phone, with TroopTrack around it',
  375: 'Phone',
  600: 'Desktop',
};

interface Session {
  form: AnnouncementForm;
  checks: CheckMe[];
  suggestions: Suggestion[];
}

function layoutName(id: Layout): string {
  return LAYOUTS.find((l) => l.id === id)?.name ?? id;
}

export function mountConverter(root: HTMLElement): void {
  /* ---------- state ---------- */
  let parsed: ParseResult | null = null;
  let layout: Layout | null = null;
  const sessions = new Map<Layout, Session>();
  let warnings: FormWarning[] = [];
  let view: FormView | null = null;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  const current = (): Session | undefined => (layout ? sessions.get(layout) : undefined);

  /* ---------- paste section ---------- */
  const pasteArea = el('textarea', { id: 'paste-box', className: 'control paste', rows: 8 });
  pasteArea.spellcheck = false;
  pasteArea.autocomplete = 'off';
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
      textContent: 'Nothing you paste leaves this device.',
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
  const left = el('div', { className: 'column' }, [
    el('section', { className: 'card' }, [layoutBox]),
    el('section', { className: 'card' }, [formHeading, formHost]),
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
  codeArea.spellcheck = false;
  const codeDetails = el('details', { className: 'code-details' }, [
    el('summary', { textContent: 'Show the code' }),
    el('label', { htmlFor: 'code-box', className: 'label', textContent: 'New HTML (read only)' }),
    codeArea,
  ]);

  const frames = previewWidths.map((width) => {
    const frame = el('iframe', { className: 'preview-frame', width: String(width), height: '640' });
    // An empty sandbox attribute turns every permission off: no scripts, no same origin.
    frame.setAttribute('sandbox', '');
    frame.title = `Preview, ${width} pixels wide`;
    frame.setAttribute('loading', 'eager');
    const scroll = el('div', { className: 'frame-scroll' }, [frame]);
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', `Preview at ${width} pixels wide`);
    const figure = el('figure', { className: 'preview' }, [
      el('figcaption', {
        textContent: `${PREVIEW_NAMES[width] ?? 'Preview'}: ${width}px wide`,
      }),
      scroll,
    ]);
    return { frame, figure };
  });

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
      ...frames.map((f) => f.figure),
    ]),
  ]);

  const results = el('div', { className: 'workspace' }, [left, right]);
  results.hidden = true;

  root.append(buildGuide(), pasteSection, results);

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
    view?.refreshWarnings();
    showWarnings(
      warnings.map((w) => w.message),
      lintOutput(html),
    );
    codeArea.value = html;
    // The preview works on a copy of the output. The code and the copy button keep the original.
    const doc = previewDocument(html);
    for (const f of frames) f.frame.srcdoc = doc;
  }
  const refreshLater = debounce(refreshOutput, 150);

  /* ---------- form ---------- */
  const ctx: FormContext = {
    checks: () => current()?.checks ?? [],
    suggestions: () => current()?.suggestions ?? [],
    warnings: () => warnings,
    changed: () => refreshLater.run(),
    swapped(arrayPath: FieldPath, a: number, b: number) {
      const s = current();
      if (!s) return;
      s.checks = remapAfterSwap(s.checks, arrayPath, a, b);
      s.suggestions = remapAfterSwap(s.suggestions, arrayPath, a, b);
    },
    removed(arrayPath: FieldPath, index: number) {
      const s = current();
      if (!s) return;
      s.checks = remapAfterRemove(s.checks, arrayPath, index);
      s.suggestions = remapAfterRemove(s.suggestions, arrayPath, index);
    },
    apply(suggestion: Suggestion) {
      const s = current();
      if (!s) return;
      s.form = applySuggestion(s.form, suggestion);
      s.suggestions = s.suggestions.filter((x) => x !== suggestion);
      drawForm();
      refreshOutput();
      status.textContent = 'Fix applied.';
      formHeading.focus();
    },
  };

  function drawForm(): void {
    const session = current();
    clear(formHost);
    view = null;
    if (!session) return;
    warnings = formWarnings(session.form);
    view = buildForm(session.form, ctx);
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
    const session = current();
    if (!session || layout === null || next === layout) return;
    if (!sessions.has(next)) {
      // Cloned so that editing one layout can never change another layout's saved form.
      const form = structuredClone(switchLayout(session.form, next));
      sessions.set(next, { form, checks: [], suggestions: [] });
    }
    layout = next;
    drawLayoutPicker();
    drawForm();
    refreshOutput();
    status.textContent = `Switched to ${layoutName(next)}.`;
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
    for (const f of frames) f.frame.srcdoc = '';
  }

  function handlePaste(): void {
    const value = pasteArea.value;
    startOver.hidden = value === '';
    refreshLater.cancel();
    if (value.trim() === '') {
      resetResults();
      status.textContent = '';
      return;
    }
    if (new TextEncoder().encode(value).length > MAX_PASTE_BYTES) {
      resetResults();
      status.textContent =
        'That is too big to read (over 2 MB). A normal announcement is much smaller. Check that you copied only one announcement.';
      return;
    }
    let result: ParseResult;
    try {
      result = parse(value);
    } catch {
      resetResults();
      status.textContent =
        'Something went wrong reading that. Copy the HTML again from the code view and paste it here.';
      return;
    }
    if (result.model.blocks.length === 0) {
      resetResults();
      showIssues(result.issues);
      status.textContent =
        'We could not find any text in that. Check that you copied everything from the code view.';
      return;
    }
    try {
      const fill = fillForm(result, result.suggestion.layout, {
        today: todayFrom(new Date()),
        programYearStartMonth: packConfig.programYearStartMonth,
      });
      parsed = result;
      layout = result.suggestion.layout;
      sessions.clear();
      sessions.set(layout, { form: fill.form, checks: fill.checks, suggestions: fill.suggestions });
    } catch {
      resetResults();
      status.textContent =
        'Something went wrong filling in the form. Try pasting again, or tell whoever looks after this tool.';
      return;
    }
    status.textContent = `Read it. We chose ${layoutName(layout)}. You can change that below.`;
    showIssues(result.issues);
    results.hidden = false;
    drawLayoutPicker();
    drawForm();
    refreshOutput();
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
    void copyText(html, codeArea).then((outcome) => {
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
  confirmNo.addEventListener('click', () => {
    confirmBox.hidden = true;
    startOver.hidden = pasteArea.value === '';
    startOver.focus();
  });
  confirmYes.addEventListener('click', () => {
    handlePasteLater.cancel();
    refreshLater.cancel();
    pasteArea.value = '';
    resetResults();
    copiedNote.textContent = '';
    copyNote.textContent = '';
    status.textContent = 'Cleared. Paste a new announcement when you are ready.';
    confirmBox.hidden = true;
    startOver.hidden = true;
    codeDetails.open = false;
    pasteArea.focus();
  });
}
