/**
 * The three sandboxed preview frames (build spec 7.5 and 11.5), shared by both screens.
 * An empty sandbox attribute turns every permission off: no scripts, no same origin.
 */
import { previewWidths } from '../config/tokens';
import { el } from './dom';
import { previewDocument } from './preview';
import { fitScale } from './preview-scale';

const PREVIEW_NAMES: Record<number, string> = {
  360: 'Android phone',
  390: 'iPhone',
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
    const sizer = el('div', { className: 'frame-sizer' }, [frame]);
    const scroll = el('div', { className: 'frame-scroll' }, [sizer]);
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', `${label} at ${width} pixels wide`);
    const baseCaption = `${PREVIEW_NAMES[width] ?? 'Preview'}: ${width}px wide`;
    const caption = el('figcaption', { textContent: baseCaption });
    const figure = el('figure', { className: 'preview' }, [caption, scroll]);
    const height = 640;
    // Show the frame smaller when the column is narrower than the frame. The iframe keeps its
    // real width, so the email lays out as it would at that width; only the display shrinks.
    const fit = () => {
      const style = getComputedStyle(scroll);
      const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const scale = fitScale(width, scroll.clientWidth - pad);
      sizer.style.width = `${Math.floor(width * scale)}px`;
      sizer.style.height = `${Math.ceil(height * scale)}px`;
      frame.style.transform = scale < 1 ? `scale(${scale})` : '';
      figure.dataset.scale = String(scale);
      const text = scale < 1 ? `${baseCaption} (shown smaller to fit)` : baseCaption;
      if (caption.textContent !== text) caption.textContent = text;
    };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(scroll);
    fit();
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
