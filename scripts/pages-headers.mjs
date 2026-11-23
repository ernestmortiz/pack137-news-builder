/* global process, console */
// Writes the `_headers` file for the hosted web build (Cloudflare Pages).
//
// The page already carries its Content Security Policy in a meta tag, which is all the zip and the
// apps have. A host can also send it as a header, which adds what a meta tag cannot do: refuse to
// be framed by another site (frame-ancestors). The policy is read from the built index.html, so the
// header can never drift from the page. Run after `npm run build`:
//   node scripts/pages-headers.mjs dist
// It writes dist/_headers. Only the Cloudflare upload gets this file, never the zip.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The page's own policy, from its meta tag. */
export function pagePolicy(distDir) {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  if (!match) throw new Error(`No Content Security Policy meta tag in ${distDir}/index.html`);
  const policy = match[1];
  if (!policy.includes("connect-src 'none'")) {
    throw new Error("The page policy has lost connect-src 'none'; refusing to publish it.");
  }
  return policy;
}

/** Header name and value pairs sent with every file of the hosted build. */
export function headerPairs(distDir) {
  return [
    ['Content-Security-Policy', `${pagePolicy(distDir)}; frame-ancestors 'self'`],
    ['X-Frame-Options', 'SAMEORIGIN'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'no-referrer'],
    ['Cross-Origin-Opener-Policy', 'same-origin'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
  ];
}

/** The `_headers` file text: one rule for every path. */
export function headersFile(distDir) {
  const lines = ['/*', ...headerPairs(distDir).map(([name, value]) => `  ${name}: ${value}`)];
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const distDir = resolve(process.argv[2] ?? 'dist');
  writeFileSync(join(distDir, '_headers'), headersFile(distDir));
  console.log(`Wrote ${join(distDir, '_headers')}`);
}
