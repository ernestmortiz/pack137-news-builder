/**
 * The three sandboxed preview frames (build spec 7.5 and 11.5), shared by both screens.
 * An empty sandbox attribute turns every permission off: no scripts, no same origin.
 */
import { previewWidths } from '../config/tokens';
import { el } from './dom';
import { previewDocument } from './preview';

const PREVIEW_NAMES: Record<number, string> = {
  250: 'Small phone, with TroopTrack around it',
  375: 'Phone',
  600: 'Desktop',
};

export interface PreviewFrames {
  /** One figure per width, ready to put on the page. */
  figures: HTMLElement[];
  /** Shows a copy of `html` with images swapped for placeholders. The original is never changed. */
  show(html: string): void;
  /** Empties every frame. */
  clear(): void;
}

export function createPreviewFrames(label = 'Preview'): PreviewFrames {
  const frames = previewWidths.map((width) => {
    const frame = el('iframe', { className: 'preview-frame', width: String(width), height: '640' });
    frame.setAttribute('sandbox', '');
    frame.title = `${label}, ${width} pixels wide`;
    frame.setAttribute('loading', 'eager');
    const scroll = el('div', { className: 'frame-scroll' }, [frame]);
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', `${label} at ${width} pixels wide`);
    const figure = el('figure', { className: 'preview' }, [
      el('figcaption', {
        textContent: `${PREVIEW_NAMES[width] ?? 'Preview'}: ${width}px wide`,
      }),
      scroll,
    ]);
    return { frame, figure };
  });
  return {
    figures: frames.map((f) => f.figure),
    show(html) {
      const doc = previewDocument(html);
      for (const f of frames) f.frame.srcdoc = doc;
    },
    clear() {
      for (const f of frames) f.frame.srcdoc = '';
    },
  };
}
