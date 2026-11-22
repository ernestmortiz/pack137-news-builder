/**
 * "Shrink a photo for the letter". The person picks a photo, the tool makes a smaller JPEG copy in
 * the browser and saves it as a file. Nothing is uploaded anywhere. The decisions (sizes, quality
 * steps, file names, messages) are pure functions at the top; the canvas and the widget are below.
 */
import { announce } from './announce';
import { el } from './dom';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_PIXELS = 60_000_000;
export const MAX_WIDTH = 1104;
export const MAX_HEIGHT = 2000;
export const TARGET_BYTES = 300 * 1024;
export const FIRST_QUALITY = 0.82;
export const QUALITY_STEP = 0.08;
export const LOWEST_QUALITY = 0.58;

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif';

export const MSG = {
  tooBig: 'This file is bigger than 50 MB, so it was not opened. Choose a smaller photo.',
  unreadable:
    "This photo format can't be read here. Save or export it as a JPEG first, or try Safari.",
  tooManyPixels: 'This photo is too large to shrink on this device.',
  noSave: 'The photo could not be saved. Try a different photo.',
  working: 'Shrinking...',
} as const;

export function isTooBigFile(bytes: number): boolean {
  return bytes > MAX_FILE_BYTES;
}

export function isTooManyPixels(width: number, height: number): boolean {
  return width * height > MAX_PIXELS;
}

/** Fits inside 1104 wide and 2000 high, keeps the shape, never enlarges. */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** 0.82, 0.74, 0.66, 0.58. */
export function qualitySteps(): number[] {
  const steps: number[] = [];
  for (let q = FIRST_QUALITY; q >= LOWEST_QUALITY - 1e-9; q -= QUALITY_STEP) {
    steps.push(Math.round(q * 100) / 100);
  }
  return steps;
}

/** Tries each quality in turn and stops at the first result that is small enough. */
export async function chooseEncoding(
  encode: (quality: number) => Promise<Blob | null>,
  limit: number = TARGET_BYTES,
): Promise<{ blob: Blob; quality: number; withinLimit: boolean } | null> {
  let last: { blob: Blob; quality: number } | null = null;
  for (const quality of qualitySteps()) {
    const blob = await encode(quality);
    if (blob === null) return null;
    last = { blob, quality };
    if (blob.size <= limit) return { ...last, withinLimit: true };
  }
  return last === null ? null : { ...last, withinLimit: false };
}

/** Original name without its extension, safe characters only, plus "-letter.jpg". */
export function shrunkFileName(original: string): string {
  const dot = original.lastIndexOf('.');
  const stem = dot > 0 ? original.slice(0, dot) : original;
  const safe = stem
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `${safe === '' ? 'photo' : safe}-letter.jpg`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function resultMessage(info: {
  fileName: string;
  beforeBytes: number;
  afterBytes: number;
  width: number;
  height: number;
  withinLimit: boolean;
}): string {
  const big = info.withinLimit
    ? ''
    : ' It is still bigger than 300 KB, even at the lowest quality, but it is the smallest this tool can make.';
  return (
    `Saved ${info.fileName}: ${formatBytes(info.beforeBytes)} to ${formatBytes(info.afterBytes)}, ` +
    `${info.width} by ${info.height} pixels. Location and camera details were removed.${big} ` +
    'Now upload it to TroopTrack and paste its address above.'
  );
}

/* ---------- browser part ---------- */

export interface ShrinkResult {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  withinLimit: boolean;
}

/** Thrown with a message that is safe to show as it is. */
export class ShrinkError extends Error {}

export async function shrinkPhoto(file: File): Promise<ShrinkResult> {
  if (isTooBigFile(file.size)) throw new ShrinkError(MSG.tooBig);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ShrinkError(MSG.unreadable);
  }
  try {
    if (isTooManyPixels(bitmap.width, bitmap.height)) throw new ShrinkError(MSG.tooManyPixels);
    const size = targetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new ShrinkError(MSG.tooManyPixels);
    // White first, so a transparent PNG does not turn black in a JPEG.
    context.fillStyle = 'white';
    context.fillRect(0, 0, size.width, size.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const chosen = await chooseEncoding(
      (quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality)),
    );
    if (chosen === null) throw new ShrinkError(MSG.noSave);
    return {
      blob: chosen.blob,
      fileName: shrunkFileName(file.name),
      width: size.width,
      height: size.height,
      withinLimit: chosen.withinLimit,
    };
  } finally {
    bitmap.close();
  }
}

/** Saves through a Blob URL and a download link, the same way Download draft does. */
function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: fileName });
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* Thumbnail URLs are revoked when replaced, and when their picture leaves the page. */
const liveThumbs = new Map<HTMLImageElement, string>();
let watcher: MutationObserver | null = null;

function dropThumb(img: HTMLImageElement): void {
  const url = liveThumbs.get(img);
  if (url !== undefined) URL.revokeObjectURL(url);
  liveThumbs.delete(img);
  if (liveThumbs.size === 0) {
    watcher?.disconnect();
    watcher = null;
  }
}

function trackThumb(img: HTMLImageElement, url: string): void {
  liveThumbs.set(img, url);
  if (watcher === null && typeof MutationObserver !== 'undefined') {
    watcher = new MutationObserver(() => {
      for (const known of [...liveThumbs.keys()]) if (!known.isConnected) dropThumb(known);
    });
    watcher.observe(document.body, { childList: true, subtree: true });
  }
}

/** The button, the hidden file input and the result line. Put it beside a photo address field. */
export function shrinkControl(buttonLabel: string): HTMLElement {
  const button = el('button', { type: 'button', className: 'btn shrink-button' });
  button.textContent = buttonLabel;
  const input = el('input', { type: 'file', accept: ACCEPT });
  input.hidden = true;
  input.tabIndex = -1;
  input.setAttribute('aria-label', 'Choose a photo to shrink');
  const note = el('p', { className: 'hint shrink-note' });
  const thumb = el('img', { className: 'shrink-thumb', alt: '' });
  thumb.hidden = true;
  const root = el('div', { className: 'shrink' }, [
    el('div', { className: 'shrink-row' }, [button, thumb, note]),
    input,
  ]);

  const clearThumb = (): void => {
    dropThumb(thumb);
    thumb.hidden = true;
    thumb.removeAttribute('src');
    thumb.alt = '';
  };
  const say = (text: string): void => {
    note.textContent = text;
    announce(text);
  };

  button.addEventListener('click', () => {
    input.value = '';
    input.click();
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file === undefined) return;
    button.disabled = true;
    button.textContent = MSG.working;
    note.textContent = '';
    clearThumb();
    void shrinkPhoto(file)
      .then((result) => {
        saveFile(result.blob, result.fileName);
        const url = URL.createObjectURL(result.blob);
        thumb.src = url;
        thumb.alt = `Small preview of ${result.fileName}`;
        thumb.hidden = false;
        trackThumb(thumb, url);
        say(
          resultMessage({
            fileName: result.fileName,
            beforeBytes: file.size,
            afterBytes: result.blob.size,
            width: result.width,
            height: result.height,
            withinLimit: result.withinLimit,
          }),
        );
      })
      .catch((error: unknown) => {
        say(error instanceof ShrinkError ? error.message : MSG.noSave);
      })
      .finally(() => {
        input.value = '';
        button.disabled = false;
        button.textContent = buttonLabel;
        if (document.activeElement === document.body && button.isConnected) button.focus();
      });
  });
  return root;
}
