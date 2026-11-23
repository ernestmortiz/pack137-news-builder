/* global process, console, URL */
// Serves dist/ on localhost with the same headers the hosted site sends (scripts/pages-headers.mjs),
// so the browser tests can prove those headers do not break the app. Used by `npm run e2e:pages`.
//   node scripts/serve-pages.mjs [port]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { headerPairs } from './pages-headers.mjs';

const distDir = resolve('dist');
const port = Number(process.argv[2] ?? 4173);
const headers = headerPairs(distDir);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

createServer((req, res) => {
  for (const [name, value] of headers) res.setHeader(name, value);
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  let file = normalize(join(distDir, path));
  if (file !== distDir && !file.startsWith(distDir + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  res.writeHead(200).end(readFileSync(file));
}).listen(port, () => console.log(`Serving dist/ with Pages headers on ${port}`));
