/**
 * "Finish photos" on the Monthly letter screen. After the letter is pasted into TroopTrack and the
 * photos are inserted there, the person pastes TroopTrack's code back here. The core step adds the
 * descriptions and sizes. Nothing is sent anywhere; the pasted text is only read by the core step.
 */
import { finishPhotos } from '../core/finish-photos';
import { lintOutput } from '../core/lint-output';
import { photoSpots } from '../core/render-letter';
import type { LetterForm } from '../core/letter';
import type { PackSettings } from '../core/settings';
import { browserClipboardEnv, copyText } from './clipboard';
import { clear, debounce, el } from './dom';
import { markSpelling } from './field-kinds';
import { FINISH_STEPS, PASTE_TOO_BIG, pasteTooBig } from './finish-photos-logic';
import { createPreviewFrames } from './preview-frames';

export interface FinishPhotos {
  element: HTMLElement;
  /** The letter changed: read the pasted code again against the new photo list. */
  recheck(): void;
}

export function createFinishPhotos(deps: {
  letter: () => LetterForm;
  settings: () => PackSettings;
}): FinishPhotos {
  const paste = el('textarea', { id: 'finish-paste-box', className: 'control code', rows: 8 });
  paste.spellcheck = false;
  markSpelling(paste, 'code');
  const pasteLabel = el('label', {
    htmlFor: 'finish-paste-box',
    className: 'label',
    textContent: "Paste TroopTrack's code here",
  });
  const message = el('p', { className: 'hint' });
  message.setAttribute('role', 'status');
  const notesBox = el('div', { className: 'finish-notes' });
  const copyButton = el('button', {
    type: 'button',
    className: 'btn primary',
    textContent: 'Copy finished HTML',
  });
  copyButton.disabled = true;
  const copiedNote = el('span', { className: 'copied' });
  copiedNote.setAttribute('role', 'status');
  const copyNote = el('p', { className: 'hint' });
  copyNote.setAttribute('role', 'status');
  const codeArea = el('textarea', { id: 'finish-code-box', className: 'control code', rows: 12 });
  codeArea.readOnly = true;
  markSpelling(codeArea, 'code');
  const codeDetails = el('details', { className: 'code-details' }, [
    el('summary', { textContent: 'Show the finished code' }),
    el('label', {
      htmlFor: 'finish-code-box',
      className: 'label',
      textContent: 'Finished HTML (read only)',
    }),
    codeArea,
  ]);
  const frames = createPreviewFrames('Finished preview');
  const results = el('div', { className: 'finish-results' }, [
    notesBox,
    el('div', { className: 'row-actions' }, [copyButton, copiedNote]),
    copyNote,
    codeDetails,
    el('h3', { textContent: 'Finished preview' }),
    el('p', {
      className: 'hint',
      textContent: 'Pictures show as grey boxes here. They appear normally once the email is sent.',
    }),
    ...frames.figures,
  ]);
  results.hidden = true;

  let finished = '';
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  function reset(text: string): void {
    finished = '';
    copyButton.disabled = true;
    copiedNote.textContent = '';
    copyNote.textContent = '';
    codeArea.value = '';
    frames.clear();
    clear(notesBox);
    results.hidden = true;
    message.textContent = text;
  }

  function list(heading: string, items: string[]): void {
    if (items.length === 0) return;
    const ul = el('ul', { className: 'warn-list' });
    for (const text of items) ul.append(el('li', { textContent: text }));
    notesBox.append(el('p', { className: 'label', textContent: heading }), ul);
  }

  function process(): void {
    const text = paste.value;
    if (text.trim() === '') return reset('');
    if (pasteTooBig(text)) return reset(PASTE_TOO_BIG);
    try {
      const letter = deps.letter();
      // Photos from an older draft still have an address. The letter renders those itself.
      const ownPhotoUrls: string[] = [];
      for (const block of letter.story.blocks) {
        const photo =
          block.kind === 'photo' ? block.photo : block.kind === 'sidebar' ? block.photo : undefined;
        if (photo !== undefined && photo.src.trim() !== '') ownPhotoUrls.push(photo.src.trim());
      }
      const result = finishPhotos(text, photoSpots(letter), {
        logoUrl: deps.settings().logoUrl,
        ownPhotoUrls,
      });
      let problems: string[];
      try {
        problems = lintOutput(result.html, { monthly: true });
      } catch {
        problems = ['The checker could not read the finished HTML.'];
      }
      message.textContent = '';
      finished = result.html;
      codeArea.value = result.html;
      frames.show(result.html);
      clear(notesBox);
      list('Notes', result.notes);
      list('Problems with the finished HTML. Tell whoever looks after this tool:', problems);
      copyButton.disabled = false;
      results.hidden = false;
    } catch {
      reset('The code could not be read. Check that you pasted all of it, then try again.');
    }
  }
  const processLater = debounce(process, 300);
  paste.addEventListener('input', () => processLater.run());

  copyButton.addEventListener('click', () => {
    if (finished === '') return;
    clearTimeout(copiedTimer);
    copiedNote.textContent = '';
    copyNote.textContent = '';
    const env = {
      ...browserClipboardEnv(),
      beforeSelect: () => {
        codeDetails.open = true;
      },
    };
    void copyText(finished, codeArea, env).then((outcome) => {
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

  const steps = el('ol', { className: 'finish-steps' });
  for (const text of FINISH_STEPS) steps.append(el('li', { textContent: text }));
  const element = el('section', { className: 'card finish-photos' }, [
    el('h2', { textContent: 'Finish photos' }),
    el('p', {
      className: 'hint',
      textContent:
        'Use this after the letter is in TroopTrack with its photos. It adds each photo description and makes the photos fit phones.',
    }),
    steps,
    pasteLabel,
    paste,
    message,
    results,
  ]);
  return {
    element,
    recheck() {
      if (paste.value.trim() !== '') processLater.run();
    },
  };
}
