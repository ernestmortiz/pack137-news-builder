/**
 * The Settings screen (build spec 9). Edits a working copy as the person types. After a short pause
 * the copy goes through validateSettings: the usable result becomes the app's settings and is saved
 * on the device, and any problems are shown beside the field. A problem never blocks saving.
 */
import {
  defaultSettings,
  MAX_STANDING_LINKS,
  validateSettings,
  type PackSettings,
  type SettingsProblem,
} from '../core/settings';
import { clear, debounce, el, uid } from './dom';
import { kindOfInputType, markSpelling } from './field-kinds';
import type { SettingsStore } from './app-settings';
import {
  emailLinkDetails,
  MONTH_NAMES,
  moveLink,
  otherProblems,
  problemsAt,
} from './settings-logic';

type Path = (string | number)[];

interface Working {
  logoUrl: string;
  standingLinks: { label: string; url: string }[];
  email: { contact: string; volunteer: string; feedback: string };
  photoFormUrl: string;
  yearAtAGlanceUrl: string;
  programYearStartMonth: number;
}

const copyOf = (s: PackSettings): Working => ({
  logoUrl: s.logoUrl,
  standingLinks: s.standingLinks.map((l) => ({ label: l.label, url: l.url })),
  email: { ...s.email },
  photoFormUrl: s.photoFormUrl,
  yearAtAGlanceUrl: s.yearAtAGlanceUrl,
  programYearStartMonth: s.programYearStartMonth,
});

export function mountSettings(root: HTMLElement, store: SettingsStore): void {
  let working = copyOf(store.get());
  let ownChange = false;

  /** Every message box, so one pass can fill them from the problem list. */
  const slots: { path: Path; box: HTMLElement }[] = [];

  function slot(path: Path): HTMLElement {
    const box = el('p', { className: 'note warn', id: uid('settings-problem') });
    box.hidden = true;
    slots.push({ path, box });
    return box;
  }

  function field(opts: {
    label: string;
    hint?: string;
    path: Path;
    value: string;
    type?: string;
    inputMode?: string;
    onInput: (value: string) => void;
  }): HTMLElement {
    const id = uid('settings-field');
    const box = slot(opts.path);
    const input = el('input', {
      id,
      className: 'control',
      type: opts.type ?? 'text',
      value: opts.value,
      autocomplete: 'off',
    });
    markSpelling(input, kindOfInputType(opts.type ?? 'text'));
    if (opts.inputMode) input.inputMode = opts.inputMode;
    input.setAttribute('aria-describedby', box.id);
    input.addEventListener('input', () => {
      opts.onInput(input.value);
      applyLater.run();
    });
    return el('div', { className: 'field' }, [
      el('label', { htmlFor: id, className: 'label', textContent: opts.label }),
      opts.hint ? el('p', { className: 'hint', textContent: opts.hint }) : null,
      input,
      box,
    ]);
  }

  /* ---------- sections ---------- */
  const otherBox = el('div', { className: 'warnings' });
  const savedNote = el('p', { className: 'hint' });
  savedNote.setAttribute('role', 'status');

  const emailLinkBoxes = new Map<string, HTMLElement>();
  function emailField(
    key: 'contact' | 'volunteer' | 'feedback',
    label: string,
    hint: string,
  ): HTMLElement {
    const link = el('div', { className: 'mail-lines' });
    emailLinkBoxes.set(key, link);
    const f = field({
      label,
      hint,
      path: ['email', key],
      value: working.email[key],
      type: 'email',
      inputMode: 'email',
      onInput: (v) => (working.email[key] = v),
    });
    f.append(link);
    return f;
  }

  const linksHost = el('div', { className: 'settings-links' });
  const addLink = el('button', { type: 'button', className: 'btn', textContent: 'Add a link' });
  const linksMessage = el('p', { className: 'note warn' });
  linksMessage.hidden = true;
  const linksStatus = el('p', { className: 'hint' });
  linksStatus.setAttribute('role', 'status');

  function drawLinks(focus?: { index: number; part: 'up' | 'down' | 'remove' | 'label' }): void {
    // Drop the old link boxes, keep the rest.
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i]?.path[0] === 'standingLinks') slots.splice(i, 1);
    }
    clear(linksHost);
    const total = working.standingLinks.length;
    working.standingLinks.forEach((link, index) => {
      const group = el('div', { className: 'link-row card' });
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', `Link ${index + 1} of ${total}`);
      const labelField = field({
        label: `Link ${index + 1} words`,
        path: ['standingLinks', index, 'label'],
        value: link.label,
        onInput: (v) => (link.label = v),
      });
      const urlField = field({
        label: `Link ${index + 1} address`,
        path: ['standingLinks', index, 'url'],
        value: link.url,
        type: 'url',
        inputMode: 'url',
        onInput: (v) => (link.url = v),
      });
      const up = el('button', {
        type: 'button',
        className: 'btn small',
        textContent: 'Move up',
        disabled: index === 0,
      });
      up.setAttribute('aria-label', `Move link ${index + 1} up`);
      const down = el('button', {
        type: 'button',
        className: 'btn small',
        textContent: 'Move down',
        disabled: index === total - 1,
      });
      down.setAttribute('aria-label', `Move link ${index + 1} down`);
      const remove = el('button', {
        type: 'button',
        className: 'btn small danger',
        textContent: 'Remove',
      });
      remove.setAttribute('aria-label', `Remove link ${index + 1}`);
      up.addEventListener('click', () => {
        working.standingLinks = moveLink(working.standingLinks, index, index - 1);
        linksStatus.textContent = `Moved link ${index + 1} up.`;
        drawLinks({ index: index - 1, part: index - 1 === 0 ? 'down' : 'up' });
        applyLater.run();
      });
      down.addEventListener('click', () => {
        working.standingLinks = moveLink(working.standingLinks, index, index + 1);
        linksStatus.textContent = `Moved link ${index + 1} down.`;
        drawLinks({ index: index + 1, part: index + 1 === total - 1 ? 'up' : 'down' });
        applyLater.run();
      });
      remove.addEventListener('click', () => {
        working.standingLinks.splice(index, 1);
        linksStatus.textContent = `Removed link ${index + 1}.`;
        drawLinks(
          working.standingLinks.length > 0
            ? { index: Math.min(index, working.standingLinks.length - 1), part: 'label' }
            : undefined,
        );
        if (working.standingLinks.length === 0) addLink.focus();
        applyLater.run();
      });
      group.append(
        labelField,
        urlField,
        el('div', { className: 'row-actions' }, [up, down, remove]),
      );
      linksHost.append(group);
      if (focus?.index === index) {
        const target =
          focus.part === 'up'
            ? up
            : focus.part === 'down'
              ? down
              : focus.part === 'remove'
                ? remove
                : labelField.querySelector('input');
        queueMicrotask(() => target?.focus());
      }
    });
    addLink.disabled = working.standingLinks.length >= MAX_STANDING_LINKS;
    showProblems(lastProblems);
  }

  addLink.addEventListener('click', () => {
    if (working.standingLinks.length >= MAX_STANDING_LINKS) return;
    working.standingLinks.push({ label: '', url: '' });
    linksStatus.textContent = `Added link ${working.standingLinks.length}.`;
    drawLinks({ index: working.standingLinks.length - 1, part: 'label' });
    applyLater.run();
  });

  const monthId = uid('settings-field');
  const monthBox = slot(['programYearStartMonth']);
  const monthSelect = el('select', { id: monthId, className: 'control' });
  MONTH_NAMES.forEach((name, i) =>
    monthSelect.append(el('option', { value: String(i + 1), textContent: name })),
  );
  monthSelect.value = String(working.programYearStartMonth);
  monthSelect.setAttribute('aria-describedby', monthBox.id);
  monthSelect.addEventListener('change', () => {
    working.programYearStartMonth = Number(monthSelect.value);
    applyLater.run();
  });

  /* ---------- restore ---------- */
  const restoreButton = el('button', {
    type: 'button',
    className: 'btn',
    textContent: 'Restore Pack 137 defaults',
  });
  const confirmYes = el('button', {
    type: 'button',
    className: 'btn danger',
    textContent: 'Yes, restore the defaults',
  });
  const confirmNo = el('button', {
    type: 'button',
    className: 'btn',
    textContent: 'No, keep my settings',
  });
  const confirmBox = el('div', { className: 'note warn confirm' }, [
    el('p', {
      className: 'label',
      textContent: 'Put back the original Pack 137 settings? Your changes here will be lost.',
    }),
    el('div', { className: 'row-actions' }, [confirmYes, confirmNo]),
  ]);
  confirmBox.setAttribute('role', 'alertdialog');
  confirmBox.setAttribute('aria-label', 'Restore Pack 137 defaults');
  confirmBox.hidden = true;
  restoreButton.addEventListener('click', () => {
    confirmBox.hidden = false;
    restoreButton.hidden = true;
    confirmYes.focus();
  });
  confirmBox.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !confirmBox.hidden) {
      event.preventDefault();
      event.stopPropagation();
      confirmNo.click();
    }
  });
  confirmNo.addEventListener('click', () => {
    confirmBox.hidden = true;
    restoreButton.hidden = false;
    restoreButton.focus();
  });
  confirmYes.addEventListener('click', () => {
    applyLater.cancel();
    working = copyOf(defaultSettings());
    redrawAll();
    applyNow();
    confirmBox.hidden = true;
    restoreButton.hidden = false;
    restoreButton.focus();
    savedNote.textContent = `The Pack 137 defaults are back. ${savedNote.textContent ?? ''}`.trim();
  });

  /* ---------- applying ---------- */
  let lastProblems: SettingsProblem[] = [];

  function showProblems(problems: SettingsProblem[]): void {
    for (const { path, box } of slots) {
      const messages = problemsAt(problems, path);
      box.textContent = messages.join(' ');
      box.hidden = messages.length === 0;
      const input = box.parentElement?.querySelector('input');
      if (input) input.setAttribute('aria-invalid', String(messages.length > 0));
    }
    monthSelect.setAttribute(
      'aria-invalid',
      String(problemsAt(problems, ['programYearStartMonth']).length > 0),
    );
    const extra = otherProblems(problems);
    clear(otherBox);
    if (extra.length > 0) {
      const ul = el('ul', { className: 'warn-list' });
      for (const text of extra) ul.append(el('li', { textContent: text }));
      otherBox.append(ul);
    }
    const listProblems = problemsAt(problems, ['standingLinks']);
    linksMessage.textContent = listProblems.join(' ');
    linksMessage.hidden = listProblems.length === 0;
  }

  function showEmailLinks(settings: PackSettings): void {
    for (const { key, lines } of emailLinkDetails(settings, store.letterFeedback())) {
      const box = emailLinkBoxes.get(key);
      if (!box) continue;
      clear(box);
      for (const line of lines) {
        box.append(
          line.alert
            ? el('p', { className: 'note check' }, [
                el('strong', { textContent: 'Check me: ' }),
                line.text,
              ])
            : el('p', { className: 'note mailto', textContent: line.text }),
        );
      }
    }
  }

  function applyNow(): void {
    const result = validateSettings(working);
    lastProblems = result.problems;
    ownChange = true;
    let saved: boolean;
    try {
      saved = store.set(working).saved;
    } finally {
      ownChange = false;
    }
    showProblems(result.problems);
    showEmailLinks(store.get());
    savedNote.textContent = saved
      ? ''
      : 'Could not save on this device. Your changes still work until you close this page.';
  }
  const applyLater = debounce(applyNow, 400);

  /* ---------- page ---------- */
  const body = el('div', { className: 'settings-body' });
  function buildBody(): void {
    slots.length = 0;
    slots.push({ path: ['programYearStartMonth'], box: monthBox });
    emailLinkBoxes.clear();
    clear(body);
    const emails = el('section', { className: 'card' }, [
      el('h2', { textContent: 'Pack email addresses' }),
      el('p', {
        className: 'hint',
        textContent:
          'Type the address only, such as name@example.org. The full email link each one makes is shown under it.',
      }),
      emailField('contact', 'Contact email', 'Shown in the letter footer.'),
      emailField('volunteer', 'Volunteer email', 'Used by the "I can help" button.'),
      emailField('feedback', 'Feedback email', 'Used by the "Reply with feedback" link.'),
    ]);
    body.append(
      el('section', { className: 'card' }, [
        el('h2', { textContent: 'Logo' }),
        field({
          label: 'Logo address',
          hint: 'The web address of the round logo picture. It must start with https://.',
          path: ['logoUrl'],
          value: working.logoUrl,
          type: 'url',
          inputMode: 'url',
          onInput: (v) => (working.logoUrl = v),
        }),
      ]),
      el('section', { className: 'card' }, [
        el('h2', { textContent: 'Links at the bottom of the letter' }),
        el('p', {
          className: 'hint',
          textContent: 'Each link has the words people see and the web address it opens. Up to 12.',
        }),
        linksMessage,
        linksHost,
        el('div', { className: 'row-actions' }, [addLink]),
        linksStatus,
      ]),
      emails,
      el('section', { className: 'card' }, [
        el('h2', { textContent: 'Other links' }),
        field({
          label: 'Photo form address',
          hint: 'Where families send photos. The letter uses it for the photo ask.',
          path: ['photoFormUrl'],
          value: working.photoFormUrl,
          type: 'url',
          inputMode: 'url',
          onInput: (v) => (working.photoFormUrl = v),
        }),
        field({
          label: 'Year at a glance address',
          hint: 'Used by the link in "On the horizon".',
          path: ['yearAtAGlanceUrl'],
          value: working.yearAtAGlanceUrl,
          type: 'url',
          inputMode: 'url',
          onInput: (v) => (working.yearAtAGlanceUrl = v),
        }),
      ]),
      el('section', { className: 'card' }, [
        el('h2', { textContent: 'Program year' }),
        el('label', {
          htmlFor: monthId,
          className: 'label',
          textContent: 'Program year starts in',
        }),
        el('p', {
          className: 'hint',
          textContent: 'Helps work out the year when a date in an announcement has none.',
        }),
        monthSelect,
        monthBox,
      ]),
    );
  }

  function redrawAll(): void {
    buildBody();
    monthSelect.value = String(working.programYearStartMonth);
    drawLinks();
    const result = validateSettings(working);
    lastProblems = result.problems;
    showProblems(lastProblems);
    showEmailLinks(store.get());
  }

  root.append(
    el('section', { className: 'card' }, [
      el('p', {
        className: 'status-line',
        textContent: 'These settings are saved on this device.',
      }),
      el('p', {
        className: 'hint',
        textContent:
          'They are used by the weekly announcement and the monthly letter, and they travel inside a downloaded draft. Changes save by themselves.',
      }),
      savedNote,
      el('div', { className: 'row-actions' }, [restoreButton]),
      confirmBox,
    ]),
    otherBox,
    body,
  );
  redrawAll();

  // The letter's feedback wording is part of the feedback link, so show it as it is typed.
  store.subscribeFeedback(() => showEmailLinks(store.get()));

  // A draft file or another screen changed the settings. Show them here too.
  store.subscribe((settings) => {
    if (ownChange) return;
    applyLater.cancel();
    working = copyOf(settings);
    redrawAll();
  });
}
