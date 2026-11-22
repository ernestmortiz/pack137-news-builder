/**
 * Preview helpers (build spec 7.5 and 11.5, ADR 0004 UI 6). Pure functions, no DOM.
 * The preview never loads a remote image: each <img> in a copy of the output becomes a box of the
 * same width that shows the alt text. The output the user copies is never changed.
 */
import { color, fontStack } from '../config/tokens';

/** The policy inside every preview document. Nothing loads except inline styles and data: images. */
export const PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

const IMG_TAG = /<img\b[^>]*>/gi;

function attributeOf(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return match?.[1];
}

/**
 * Replaces each <img> with a placeholder box of the same width. `html` is renderer output, where
 * attribute values are already escaped, so the alt text can be used as text as it stands.
 */
export function replaceImagesWithPlaceholders(html: string): string {
  return html.replace(IMG_TAG, (tag) => {
    const width = /^\d{1,4}$/.test(attributeOf(tag, 'width') ?? '')
      ? attributeOf(tag, 'width')
      : '';
    const alt = (attributeOf(tag, 'alt') ?? '').trim();
    const size = width ? `width:${width}px;max-width:100%;` : 'width:100%;';
    const style =
      `display:block;${size}box-sizing:border-box;min-height:48px;margin:0 0 12px 0;padding:8px;` +
      `background-color:${color.lavender};color:${color.navy};font-size:13px;line-height:1.3;` +
      'word-wrap:break-word;';
    return `<div style="${style}">${alt === '' ? 'Image' : alt}</div>`;
  });
}

/** A complete document for the preview frame's srcdoc, with its own policy. */
export function previewDocument(renderedHtml: string): string {
  return [
    '<!doctype html>',
    '<html lang="en-US">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '</head>',
    `<body style="margin:0;padding:0;background-color:${color.white};font-family:${fontStack};">`,
    replaceImagesWithPlaceholders(renderedHtml),
    '</body>',
    '</html>',
  ].join('\n');
}
