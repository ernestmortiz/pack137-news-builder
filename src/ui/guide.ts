/** The five-step guide (build spec 7.1) with a drawn picture of TroopTrack's "<>" button. */
import { el, svgEl } from './dom';

/** Said once in each tool's help. The browser's own checker does the work; nothing is sent anywhere. */
export const SPELLING_NOTE =
  'Spelling is checked by your browser. Right-click an underlined word for suggestions.';

export const GUIDE_STEPS: string[] = [
  'In TroopTrack, open the announcement and press the "<>" code view button. Select all and copy.',
  'Come back here and paste into the "Paste the old HTML here" box.',
  'The tool picks a layout and fills in the form. A live preview shows the result.',
  'Fix anything marked "Check me", and change the wording if you like.',
  'Press "Copy new HTML". Go back to TroopTrack code view, replace everything, and save.',
];

/** A small local drawing of the "<>" button. Not a photo of TroopTrack; it only shows the shape. */
export function codeButtonPicture(): SVGElement {
  const svg = svgEl('svg', {
    viewBox: '0 0 56 40',
    width: '56',
    height: '40',
    role: 'img',
    class: 'code-button-picture',
  });
  svg.append(
    svgEl('title', {}, []),
    svgEl('rect', { x: '1', y: '1', width: '54', height: '38', rx: '8', class: 'cb-body' }),
    svgEl('polyline', {
      points: '23,12 14,20 23,28',
      class: 'cb-mark',
      fill: 'none',
      'stroke-width': '3.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
    svgEl('polyline', {
      points: '33,12 42,20 33,28',
      class: 'cb-mark',
      fill: 'none',
      'stroke-width': '3.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
  const title = svg.querySelector('title');
  if (title)
    title.textContent =
      'The code view button: a small box with a less than and a greater than sign';
  return svg;
}

export function buildGuide(): HTMLElement {
  const list = el('ol', { className: 'steps' });
  GUIDE_STEPS.forEach((step, i) => {
    const li = el('li', {}, [el('span', { textContent: step })]);
    if (i === 0) li.append(el('span', { className: 'step-picture' }, [codeButtonPicture()]));
    list.append(li);
  });
  return el('section', { className: 'card guide' }, [
    el('h2', { textContent: 'How it works' }),
    list,
    el('p', { className: 'hint', textContent: SPELLING_NOTE }),
  ]);
}
