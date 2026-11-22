/**
 * Live help beside an alt text field: the help line, a character count against the limit and,
 * when asked, the problems from `altTextProblems`. Never blocks anything. The display is redrawn
 * 150 ms after the last change, like the preview.
 */
import { ALT_MAX_LENGTH, altTextProblems } from '../core/alt-text';
import { debounce, el } from './dom';

export const ALT_HELP =
  'Describe what the photo shows and why it is there. Do not name a child. Leave out "photo of"; screen readers already say it is an image.';

export interface AltFeedback {
  /** Put this under the field. */
  node: HTMLElement;
  /** Call after the alt text or the caption changes. */
  update(): void;
}

export function altFeedback(
  getAlt: () => string,
  getCaption: () => string | undefined,
  showProblems: boolean,
): AltFeedback {
  const count = el('p', { className: 'hint alt-count' });
  const problems = el('div', { className: 'alt-problems' });
  const node = el('div', { className: 'alt-feedback' }, [count, showProblems ? problems : null]);
  function draw(): void {
    const alt = getAlt();
    count.textContent = `${alt.trim().length} of ${ALT_MAX_LENGTH} characters`;
    if (!showProblems) return;
    problems.replaceChildren(
      ...altTextProblems(alt, getCaption()).map((p) =>
        el('p', { className: 'note warn', textContent: p.message }),
      ),
    );
  }
  draw();
  const later = debounce(draw, 150);
  return { node, update: () => later.run() };
}
