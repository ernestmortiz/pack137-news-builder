/* global process, console, setTimeout, fetch, AbortSignal */
// Smoke test of the real desktop wrapper, driven through WebDriver (tauri-driver).
//
// It starts the built app, then checks what the wrapper promises:
//   a. the window loads the app and the footer shows the package.json version
//   b. the page cannot fetch, and cannot run any Tauri command (CSP in force, no capabilities)
//   c. Download draft saves a .json into the Downloads folder, and a second press makes "(1)"
//   c. other file types (.command, .exe) are refused
//   d. the window cannot be sent to another origin, cannot open another window, and a blob page
//      made by script keeps the app's policy
//
// Run it through scripts/wrapper-smoke.sh, which builds the app and starts a virtual display.
// Every result printed here was observed; nothing is assumed. Exit code 1 if any check fails.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const appPath = resolve(
  root,
  process.env.WRAPPER_APP ?? 'src-tauri/target/debug/pack137-news-builder',
);
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const driverPort = 4444;
const nativePort = 4445;
const base = `http://127.0.0.1:${driverPort}`;
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

const results = [];
function check(name, ok, observed) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (observed !== undefined) console.log(`      observed: ${observed}`);
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// A private Downloads folder, so the test never touches the real one.
const work = mkdtempSync(join(tmpdir(), 'pack137-smoke-'));
const home = join(work, 'home');
const downloads = join(home, 'Downloads');
const configHome = join(work, 'config');
mkdirSync(configHome, { recursive: true });
// SMOKE_NO_DOWNLOADS=1 sets up a computer with no Downloads folder: files must land in home.
const noDownloads = process.env.SMOKE_NO_DOWNLOADS === '1';
if (!noDownloads)
  writeFileSync(join(configHome, 'user-dirs.dirs'), `XDG_DOWNLOAD_DIR="${downloads}"\n`);
mkdirSync(noDownloads ? home : downloads, { recursive: true });
const saveDir = noDownloads ? home : downloads;
const env = {
  ...process.env,
  HOME: home,
  XDG_CONFIG_HOME: configHome,
  XDG_DATA_HOME: join(work, 'data'),
  XDG_CACHE_HOME: join(work, 'cache'),
  ...(noDownloads ? {} : { XDG_DOWNLOAD_DIR: downloads }),
};
if (noDownloads) delete env.XDG_DOWNLOAD_DIR;

if (!existsSync(appPath)) {
  console.error(`The app is not built: ${appPath}. Run scripts/wrapper-smoke.sh.`);
  process.exit(2);
}

const driver = spawn(
  'tauri-driver',
  ['--port', String(driverPort), '--native-port', String(nativePort)],
  { env, cwd: work, stdio: ['ignore', 'inherit', 'inherit'] },
);
let sessionId = null;

async function wd(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json.value)}`);
  return json.value;
}
const session = (path) => `/session/${sessionId}${path}`;
const run = (script, args = []) => wd('POST', session('/execute/sync'), { script, args });
const runAsync = (script, args = []) => wd('POST', session('/execute/async'), { script, args });

async function waitFor(fn, what, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // not ready yet
    }
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(250);
  }
}

async function click(xpath) {
  const found = await wd('POST', session('/element'), { using: 'xpath', value: xpath });
  await wd('POST', session(`/element/${found[ELEMENT]}/click`), {});
}

const jsonFiles = () =>
  readdirSync(saveDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

try {
  // The driver needs a moment to listen.
  await waitFor(async () => (await fetch(`${base}/status`)).ok, 'tauri-driver to start', 20_000);
  const created = await wd('POST', '/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: appPath } } },
  });
  sessionId = created.sessionId;
  await waitFor(
    () => run('return document.readyState === "complete" && !!document.querySelector("footer")'),
    'the app to load',
  );

  // a. the app loads, with the one version number
  const footer = await run('return document.querySelector("footer").textContent');
  const origin = await run('return location.origin');
  check(
    'a. window loads the app and the footer shows the package.json version',
    footer.startsWith(`Version ${version}.`),
    `origin ${origin}; footer "${footer}"`,
  );

  // b. CSP and no commands
  const csp = await run(
    'return document.querySelector("meta[http-equiv=\\"Content-Security-Policy\\"]")?.content ?? null',
  );
  const builtHtml = readFileSync(join(root, 'dist/index.html'), 'utf8');
  check(
    'b1. the page carries the strict build CSP from dist/index.html',
    typeof csp === 'string' &&
      builtHtml.includes(`content="${csp}"`) &&
      csp.includes("connect-src 'none'"),
    csp,
  );

  const fetchResult = await runAsync(`
    const done = arguments[arguments.length - 1];
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective + ' blocked ' + e.blockedURI));
    fetch('https://example.org/').then(
      () => done({ outcome: 'resolved', violations }),
      (error) => setTimeout(() => done({ outcome: 'rejected: ' + error, violations }), 300),
    );
  `);
  check(
    'b2. fetch("https://example.org/") from the page fails',
    fetchResult.outcome.startsWith('rejected'),
    JSON.stringify(fetchResult),
  );
  check(
    'b3. the failure is the CSP, not the network (a violation was reported)',
    fetchResult.violations.some((v) => v.startsWith('connect-src')),
    JSON.stringify(fetchResult.violations),
  );

  const globals = await run(
    'return { tauri: typeof window.__TAURI__, internals: typeof window.__TAURI_INTERNALS__ }',
  );
  check(
    'b4. window.__TAURI__ is not exposed (withGlobalTauri is false)',
    globals.tauri === 'undefined',
    JSON.stringify(globals),
  );

  const invokes = await runAsync(`
    const done = arguments[arguments.length - 1];
    const internals = window.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') { done({ skipped: 'no __TAURI_INTERNALS__.invoke' }); return; }
    const commands = ['plugin:app|version', 'plugin:app|name', 'plugin:path|resolve_directory', 'plugin:event|listen', 'plugin:window|close', 'plugin:webview|webview_close', 'plugin:fs|read_file', 'greet'];
    const out = {};
    Promise.all(commands.map((command) => {
      const timer = new Promise((resolve) => setTimeout(() => resolve('no answer in 5 s'), 5000));
      const call = Promise.resolve().then(() => internals.invoke(command, {})).then(
        (value) => 'RAN, returned ' + JSON.stringify(value),
        (error) => 'refused: ' + String(error),
      );
      return Promise.race([call, timer]).then((r) => { out[command] = r; });
    })).then(() => done(out));
  `);
  const ran = Object.entries(invokes).filter(([, v]) => String(v).startsWith('RAN'));
  check(
    'b5. __TAURI_INTERNALS__.invoke cannot run any command',
    !invokes.skipped && ran.length === 0,
    JSON.stringify(invokes, null, 2).replace(/\n/g, '\n      '),
  );
  await run('return document.activeElement && document.activeElement.blur(), 1');

  // c. Download draft into Downloads, then "(1)"
  await click(
    '//*[@role="tab" and contains(normalize-space(.), "Monthly letter")] | //button[contains(normalize-space(.), "Monthly letter")]',
  );
  const downloadButton = '//button[normalize-space(.)="Download draft"]';
  await waitFor(
    () =>
      run(
        'return !!Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Download draft" && b.offsetParent !== null)',
      ),
    'the Download draft button',
  );
  await click(downloadButton);
  const first = await waitFor(
    () => (jsonFiles().length >= 1 ? jsonFiles() : null),
    'the first download',
  );
  await sleep(500);
  const noteText = await run(
    'return Array.from(document.querySelectorAll("p")).map((p) => p.textContent).find((t) => t.startsWith("Saved the draft as")) ?? "(no note found)"',
  );
  const firstPath = join(saveDir, first[0]);
  let parsed = false;
  try {
    JSON.parse(readFileSync(firstPath, 'utf8'));
    parsed = true;
  } catch {
    parsed = false;
  }
  check(
    'c1. Download draft writes a .json file into the Downloads folder (home when there is none)',
    first.length === 1 && parsed,
    `${first.join(', ')} in ${saveDir}; page said: "${noteText}"`,
  );
  await click(downloadButton);
  const second = await waitFor(
    () => (jsonFiles().length >= 2 ? jsonFiles() : null),
    'the second download',
  );
  const base0 = first[0].replace(/\.json$/, '');
  check(
    'c2. a second press makes the name with " (1)"',
    second.length === 2 && second.includes(`${base0} (1).json`),
    second.join(', '),
  );
  await click(downloadButton);
  const third = await waitFor(
    () => (jsonFiles().length >= 3 ? jsonFiles() : null),
    'the third download',
  );
  check('c3. a third press makes " (2)"', third.includes(`${base0} (2).json`), third.join(', '));

  // A page-chosen name with folder parts and a character Windows refuses must come out plain,
  // inside the Downloads folder.
  await run(
    'const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["{}"], { type: "application/json" })); a.download = "..\\..\\sub/evil:name?.json"; document.body.append(a); a.click(); a.remove(); return 1',
  );
  const plain = await waitFor(
    () => (jsonFiles().some((f) => f.includes('evil')) ? jsonFiles() : null),
    'the oddly named download',
  );
  const stray = noDownloads ? [] : readdirSync(dirname(saveDir)).filter((f) => f !== 'Downloads');
  check(
    'c4. a name with folder parts is saved as a plain name inside Downloads',
    plain.includes('evil_name_.json') && stray.length === 0,
    `${plain.filter((f) => f.includes('evil')).join(', ')}; other items next to Downloads: ${stray.length}`,
  );

  // Only the kinds of file the app makes (drafts and photos) may be saved. A script that made
  // a shell script or a program must get nothing onto the disk.
  const beforeRefused = readdirSync(saveDir).sort();
  for (const name of ['Open me.command', 'setup.exe', 'draft\u202Enosj.exe']) {
    await run(
      'const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["#!/bin/sh"])); a.download = arguments[0]; document.body.append(a); a.click(); a.remove(); return 1',
      [name],
    );
  }
  await sleep(3000);
  const afterRefused = readdirSync(saveDir).sort();
  check(
    'c5. downloads of other file types (.command, .exe) are refused',
    JSON.stringify(afterRefused) === JSON.stringify(beforeRefused),
    `files before ${beforeRefused.length}, after ${afterRefused.length}`,
  );

  // d. navigation lock. A real server on this computer stands in for "the internet": the web
  // view reaches loopback addresses without a proxy, so if a navigation were allowed, the
  // server would see a request. It must see none.
  let hits = 0;
  const outside = createServer((request, response) => {
    hits += 1;
    response.setHeader('content-type', 'text/html');
    response.end('<title>outside</title><h1>outside</h1>');
  });
  await new Promise((listening) => outside.listen(0, '127.0.0.1', listening));
  const outsideUrl = `http://127.0.0.1:${outside.address().port}/`;
  try {
    const before = await run('return location.href');
    await run(
      'const target = arguments[0]; setTimeout(() => { location.href = target; }, 0); return 1',
      [outsideUrl],
    );
    await sleep(3000);
    const after = await run(
      'return { href: location.href, origin: location.origin, hasFooter: !!document.querySelector("footer") }',
    );
    check(
      'd1. location.href = (an outside address) leaves the app on its own origin',
      after.hasFooter && after.origin === origin && after.href === before && hits === 0,
      `${JSON.stringify(after)}; the outside server saw ${hits} requests`,
    );

    await run('setTimeout(() => { location.href = "https://example.org/"; }, 0); return 1');
    await sleep(1500);
    const afterHttps = await run(
      'return { origin: location.origin, hasFooter: !!document.querySelector("footer") }',
    );
    check(
      'd2. location.href = "https://example.org/" leaves the app on its own origin',
      afterHttps.hasFooter && afterHttps.origin === origin,
      JSON.stringify(afterHttps),
    );

    await run('setTimeout(() => { location.href = "data:text/html,<h1>x</h1>"; }, 0); return 1');
    await sleep(1500);
    const afterData = await run(
      'return { origin: location.origin, hasFooter: !!document.querySelector("footer") }',
    );
    check(
      'd3. a data: address is refused too',
      afterData.hasFooter && afterData.origin === origin,
      JSON.stringify(afterData),
    );

    const handlesBefore = await wd('GET', session('/window/handles'));
    const opened = await run(
      'const w = window.open(arguments[0], "_blank"); return w === null ? "null" : "a window object"',
      [outsideUrl],
    );
    await sleep(2500);
    const handlesAfter = await wd('GET', session('/window/handles'));
    check(
      'd4. window.open does not open another window or reach the outside server',
      handlesAfter.length === handlesBefore.length && hits === 0,
      `window.open returned ${opened}; windows ${handlesBefore.length} then ${handlesAfter.length}; the outside server saw ${hits} requests`,
    );

    await run(
      'const a = document.createElement("a"); a.href = arguments[0]; a.target = "_blank"; document.body.append(a); a.click(); return 1',
      [outsideUrl],
    );
    await sleep(2500);
    const handlesLink = await wd('GET', session('/window/handles'));
    check(
      'd5. a link with target="_blank" opens nothing',
      handlesLink.length === handlesBefore.length && hits === 0,
      `windows ${handlesLink.length}; the outside server saw ${hits} requests`,
    );

    // The app's own blob addresses must stay allowed (downloads go through them), so a blob
    // document must keep the app's policy: an inline script inside it must not run. This runs
    // last because it may replace the page.
    await run(
      'const u = URL.createObjectURL(new Blob(["<title>blob</title><script>window.parent.__blobRan = true; window.__blobRan = true; document.title = \'ran\';</script>"], { type: "text/html" })); setTimeout(() => { location.href = u; }, 0); return 1',
    );
    await sleep(3000);
    const blobPage = await run(
      'return { href: location.href.slice(0, 40), title: document.title, ran: window.__blobRan === true }',
    );
    check(
      'd6. a blob page made by script cannot run inline script (the policy carries over)',
      blobPage.ran === false && blobPage.title !== 'ran' && hits === 0,
      JSON.stringify(blobPage),
    );
  } finally {
    outside.close();
  }
} catch (error) {
  check('the smoke test ran to the end', false, String(error?.stack ?? error));
} finally {
  if (sessionId) {
    try {
      await wd('DELETE', session(''));
    } catch {
      // the app may already be gone
    }
  }
  driver.kill();
  rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
