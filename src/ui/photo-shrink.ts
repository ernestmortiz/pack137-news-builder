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
  unreadableHeic:
    "This photo format can't be read here. Save or export it as a JPEG first, or try Safari.",
  unreadable: "This file can't be read as a photo. Save or export it as a JPEG and try again.",
  tooManyPixels: 'This photo is too large to shrink on this device.',
  noSave: 'The photo could not be saved. Try a different photo.',
  working: 'Shrinking...',
  another: 'Another photo is being shrunk.',
} as const;

export function isTooBigFile(bytes: number): boolean {
  return bytes > MAX_FILE_BYTES;
}

export function isTooManyPixels(width: number, height: number): boolean {
  return width * height > MAX_PIXELS;
}

export const MAX_SIDE = 30_000;
/** How much of the start of the file is read to find the declared size. */
export const HEADER_BYTES = 256 * 1024;

/** True when the name or type says HEIC or HEIF. */
export function looksHeic(name: string, type: string): boolean {
  return /^image\/hei[cf]$/i.test(type) || /\.hei[cf]$/i.test(name);
}

export function unreadableMessage(name: string, type: string): string {
  return looksHeic(name, type) ? MSG.unreadableHeic : MSG.unreadable;
}

/** Too many pixels, or one side that is absurdly long. */
export function isTooLarge(width: number, height: number): boolean {
  return isTooManyPixels(width, height) || width > MAX_SIDE || height > MAX_SIDE;
}

/**
 * The width and height a file says it has, read from its first bytes without decoding it. PNG,
 * JPEG, GIF and WebP. Null when the bytes are not one of those or are cut short.
 */
export function declaredSize(bytes: Uint8Array): { width: number; height: number } | null {
  const at = (i: number): number => bytes[i] ?? -1;
  const ok = (width: number, height: number) =>
    width > 0 && height > 0 ? { width, height } : null;
  const ascii = (i: number, text: string): boolean =>
    [...text].every((c, k) => at(i + k) === c.charCodeAt(0));
  const be16 = (i: number) => at(i) * 256 + at(i + 1);
  const le16 = (i: number) => at(i) + at(i + 1) * 256;
  const le24 = (i: number) => at(i) + at(i + 1) * 256 + at(i + 2) * 65536;
  const be32 = (i: number) => at(i) * 16777216 + at(i + 1) * 65536 + at(i + 2) * 256 + at(i + 3);
  const complete = (end: number) => bytes.length >= end;

  // PNG: signature, then the IHDR chunk with width and height.
  if (at(0) === 0x89 && ascii(1, 'PNG') && at(4) === 0x0d && at(5) === 0x0a) {
    if (!complete(24) || !ascii(12, 'IHDR')) return null;
    return ok(be32(16), be32(20));
  }
  // GIF: logical screen descriptor.
  if (ascii(0, 'GIF8')) {
    return bytes.length >= 10 ? ok(le16(6), le16(8)) : null;
  }
  // WebP: RIFF container with a VP8, VP8L or VP8X chunk first.
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
    if (ascii(12, 'VP8 ')) {
      if (bytes.length < 30 || at(23) !== 0x9d || at(24) !== 0x01 || at(25) !== 0x2a) return null;
      return ok(le16(26) & 0x3fff, le16(28) & 0x3fff);
    }
    if (ascii(12, 'VP8L')) {
      if (bytes.length < 25 || at(20) !== 0x2f) return null;
      const bits = at(21) + at(22) * 256 + at(23) * 65536 + at(24) * 16777216;
      return ok((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (ascii(12, 'VP8X')) {
      return bytes.length >= 30 ? ok(le24(24) + 1, le24(27) + 1) : null;
    }
    return null;
  }
  // JPEG: walk the segments until a start-of-frame marker.
  if (at(0) === 0xff && at(1) === 0xd8) {
    let i = 2;
    while (i < bytes.length) {
      if (at(i) !== 0xff) return null;
      while (at(i) === 0xff) i += 1; // fill bytes
      const marker = at(i);
      i += 1;
      if (marker < 0) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue; // no length
      if (marker === 0xd9 || marker === 0xda) return null; // end or scan: no frame header seen
      const length = be16(i);
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        if (length < 8 || i + 7 > bytes.length) return null;
        return ok(be16(i + 5), be16(i + 3));
      }
      if (length < 2) return null;
      i += length;
    }
  }
  return null;
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
  /** Where the photo goes next: pasted by address (announcement) or inserted at a photo spot. */
  next?: 'address' | 'spot';
}): string {
  const big = info.withinLimit
    ? ''
    : ' It is still bigger than 300 KB, even at the lowest quality, but it is the smallest this tool can make.';
  return (
    `Saved ${info.fileName}: ${formatBytes(info.beforeBytes)} to ${formatBytes(info.afterBytes)}, ` +
    `${info.width} by ${info.height} pixels. Location and camera details were removed.${big} ` +
    (info.next === 'spot'
      ? 'Insert it in TroopTrack where the photo spot is, then use Finish photos.'
      : 'Now upload it to TroopTrack and paste its address above.')
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

/**
 * Decodes at a smaller size when the declared size is big, so a large photo never sits in memory
 * at full size. Only one side is given, so the shape is kept whichever way the photo is turned;
 * it is the shorter declared side, so nothing is ever enlarged.
 */
async function decode(
  file: File,
  declared: { width: number; height: number } | null,
): Promise<ImageBitmap> {
  if (declared !== null && Math.max(declared.width, declared.height) > MAX_WIDTH) {
    try {
      return await createImageBitmap(file, {
        imageOrientation: 'from-image',
        resizeWidth: Math.min(MAX_WIDTH, declared.width, declared.height),
        resizeQuality: 'high',
      });
    } catch {
      // Resize options not supported here: decode plainly, the canvas shrinks it afterwards.
    }
  }
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

export async function shrinkPhoto(file: File): Promise<ShrinkResult> {
  if (isTooBigFile(file.size)) throw new ShrinkError(MSG.tooBig);
  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const declared = declaredSize(header);
  if (declared === null && !looksHeic(file.name, file.type)) {
    throw new ShrinkError(unreadableMessage(file.name, file.type));
  }
  // Refuse before decoding: a tiny file can declare billions of pixels.
  if (declared !== null && isTooLarge(declared.width, declared.height)) {
    throw new ShrinkError(MSG.tooManyPixels);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file, declared);
  } catch {
    throw new ShrinkError(unreadableMessage(file.name, file.type));
  }
  try {
    if (isTooLarge(bitmap.width, bitmap.height)) throw new ShrinkError(MSG.tooManyPixels);
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

/* One photo is shrunk at a time across the whole page. */
let running: object | null = null;
const controls = new Set<{ sync(): void; root: HTMLElement }>();

function syncAll(): void {
  for (const control of controls) {
    if (!control.root.isConnected) controls.delete(control);
    else control.sync();
  }
}

/** The button, the hidden file input and the result line. Put it beside a photo address field. */
export function shrinkControl(
  buttonLabel: string,
  next: 'address' | 'spot' = 'address',
): HTMLElement {
  const self = {};
  const button = el('button', { type: 'button', className: 'btn shrink-button' });
  button.textContent = buttonLabel;
  const input = el('input', { type: 'file', accept: ACCEPT });
  input.hidden = true;
  input.tabIndex = -1;
  input.setAttribute('aria-label', 'Choose a photo to shrink');
  const note = el('p', { className: 'hint shrink-note' });
  const lock = el('p', { className: 'hint shrink-lock', textContent: MSG.another });
  lock.hidden = true;
  const thumb = el('img', { className: 'shrink-thumb', alt: '' });
  thumb.hidden = true;
  const root = el('div', { className: 'shrink' }, [
    el('div', { className: 'shrink-row' }, [button, thumb, note]),
    lock,
    input,
  ]);

  const sync = (): void => {
    button.disabled = running !== null;
    button.textContent = running === self ? MSG.working : buttonLabel;
    lock.hidden = running === null || running === self;
  };
  controls.add({ sync, root });
  sync();

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
    if (running !== null) return;
    input.value = '';
    input.click();
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file === undefined || running !== null) return;
    running = self;
    syncAll();
    note.textContent = '';
    clearThumb();
    void shrinkPhoto(file)
      .then((result) => {
        saveFile(result.blob, result.fileName);
        if (thumb.isConnected) {
          const url = URL.createObjectURL(result.blob);
          thumb.src = url;
          thumb.alt = `Small preview of ${result.fileName}`;
          thumb.hidden = false;
          trackThumb(thumb, url);
        }
        say(
          resultMessage({
            fileName: result.fileName,
            beforeBytes: file.size,
            afterBytes: result.blob.size,
            width: result.width,
            height: result.height,
            withinLimit: result.withinLimit,
            next,
          }),
        );
      })
      .catch((error: unknown) => {
        say(error instanceof ShrinkError ? error.message : MSG.noSave);
      })
      .finally(() => {
        input.value = '';
        running = null;
        syncAll();
        if (document.activeElement === document.body && button.isConnected) button.focus();
      });
  });
  return root;
}
