/* global process, console */
// Writes the app icon source: a navy rounded square with "137" in gold.
//
// The two colors are read from src/config/tokens.ts, the only file that holds hex values, so the
// icon follows the tokens. Run: node scripts/make-icon.mjs
// With --png it also renders src-tauri/icons/source.png at 1024 px, using the Chromium that
// Playwright installs, ready for: npx tauri icon src-tauri/icons/source.png
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = readFileSync(resolve(root, 'src/config/tokens.ts'), 'utf8');

function token(name) {
  const match = new RegExp(`\\b${name}:\\s*'(#[0-9A-Fa-f]{6})'`).exec(tokens);
  if (!match) throw new Error(`Token ${name} not found in src/config/tokens.ts`);
  return match[1];
}

const navy = token('navy');
const gold = token('gold');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="224" ry="224" fill="${navy}"/>
  <text x="512" y="512" text-anchor="middle" dominant-baseline="central" font-family="Inter, Arial, Helvetica, sans-serif" font-size="400" font-weight="700" letter-spacing="-8" fill="${gold}">137</text>
</svg>
`;

const iconDir = resolve(root, 'src-tauri/icons');
mkdirSync(iconDir, { recursive: true });
writeFileSync(resolve(iconDir, 'source.svg'), svg);
console.log('Wrote src-tauri/icons/source.svg');

if (process.argv.includes('--png')) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
    );
    await page.screenshot({
      path: resolve(iconDir, 'source.png'),
      omitBackground: true,
      clip: { x: 0, y: 0, width: 1024, height: 1024 },
    });
  } finally {
    await browser.close();
  }
  console.log('Wrote src-tauri/icons/source.png');
}
