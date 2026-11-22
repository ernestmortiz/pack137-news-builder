/* global process, console, setTimeout, fetch, WebSocket, AbortSignal, Buffer */
// Test of the real Android app on an emulator. It installs the debug APK with adb, starts the app,
// and drives the app's WebView through the Chrome DevTools Protocol (adb forwards the WebView's
// devtools socket to a local port; Tauri debug builds, and MainActivity in debug builds, turn
// WebView debugging on). Checks, mirroring tests/wrapper/smoke.mjs where they apply:
//   a. the app loads and the footer shows the package.json version
//   b. the page carries the build CSP, fetch fails, and no Tauri command can run
//   c. pasting an announcement fills the form, and Copy new HTML copies (or shows the fallback)
//   d. Download draft writes a .json into /sdcard/Download, a second press makes " (1)", an odd
//      name is saved plain, and .exe and .command downloads are refused
//   e. Shrink a photo opens the system picker; a small JPEG saved through the same download link
//      lands in /sdcard/Download
//   f. saved work survives force-stop and is offered back
//   g. the window cannot be sent to another origin
//   h. at 360 dp wide, the converter and the monthly letter do not scroll sideways
//   i. the installed app holds no permission
//
// Run it through scripts/android-smoke.sh, with an emulator already booted. Every result printed
// here was observed; nothing is assumed. Exit code 1 if any check fails.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apk = process.argv[2];
if (!apk || !existsSync(apk)) {
  console.error(`Usage: node tests/wrapper/android-smoke.mjs <path to the x86_64 debug apk>`);
  process.exit(2);
}
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const PACKAGE = 'org.pack137.newsbuilder';
const ACTIVITY = `${PACKAGE}/${PACKAGE}.MainActivity`;
const APP_ORIGIN = 'http://tauri.localhost';
const PORT = 9222;
const DOWNLOADS = '/sdcard/Download';

const results = [];
function check(name, ok, observed) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (observed !== undefined) console.log(`      observed: ${observed}`);
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function adb(...args) {
  return execFileSync('adb', args, { encoding: 'utf8', timeout: 180_000 }).trim();
}
const shell = (command) => adb('shell', command);
const downloads = () =>
  shell(`ls -1 ${DOWNLOADS}`)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('ls:') && !line.startsWith('.'))
    .sort();

async function waitFor(fn, what, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // not ready yet
    }
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(300);
  }
}

/* ---------- Chrome DevTools Protocol, over the forwarded WebView socket ---------- */

let cdp = null;

async function connect() {
  const pid = await waitFor(() => shell(`pidof ${PACKAGE}`).split(/\s+/)[0], 'the app process');
  await waitFor(
    () => shell('cat /proc/net/unix').includes(`webview_devtools_remote_${pid}`),
    `the WebView devtools socket for process ${pid}`,
  );
  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  const target = await waitFor(async () => {
    const list = await (
      await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })
    ).json();
    return list.find((t) => t.type === 'page' && t.url.startsWith(APP_ORIGIN));
  }, 'the app page in the devtools list');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((open, fail) => {
    socket.onopen = open;
    socket.onerror = () => fail(new Error('the devtools WebSocket could not open'));
  });
  let id = 0;
  const pending = new Map();
  socket.onmessage = (message) => {
    const data = JSON.parse(String(message.data));
    const waiting = data.id === undefined ? undefined : pending.get(data.id);
    if (!waiting) return;
    pending.delete(data.id);
    if (data.error) waiting.fail(new Error(JSON.stringify(data.error)));
    else waiting.done(data.result);
  };
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      id += 1;
      pending.set(id, { done, fail });
      socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.delete(id)) fail(new Error(`${method} got no answer in 60 s`));
      }, 60_000);
    });
  await send('Runtime.enable');
  cdp = { socket, send, pid, targetUrl: target.url };
}

/** Runs a JavaScript expression in the page (a promise is awaited) and returns its value. */
async function page(expression, { gesture = false } = {}) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: gesture,
  });
  if (result.exceptionDetails) {
    throw new Error(
      `page script failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
    );
  }
  return result.result.value;
}

/** Page helpers, as source text. They run inside the page. */
const HELPERS = `
  const visible = (e) => !!e && e.offsetParent !== null;
  const buttons = () => Array.from(document.querySelectorAll('button'));
  const buttonNamed = (text, exact = true) =>
    buttons().find((b) => visible(b) && (exact ? b.textContent.trim() === text : b.textContent.trim().startsWith(text)));
  const labelled = (text, scope = document) => {
    const label = Array.from(scope.querySelectorAll('label')).find((l) => l.textContent.trim().startsWith(text));
    return label ? label.control : null;
  };
  const setValue = (field, value) => {
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };
`;
const pageWith = (body, options) => page(`(async () => { ${HELPERS} ${body} })()`, options);

const clickButton = (text, exact = true) =>
  pageWith(
    `const b = buttonNamed(${JSON.stringify(text)}, ${exact}); if (!b) return false; b.click(); return true;`,
    { gesture: true },
  );
const clickTab = (text) =>
  pageWith(
    `const t = Array.from(document.querySelectorAll('[role=tab]')).find((e) => e.textContent.trim() === ${JSON.stringify(text)}); if (!t) return false; t.click(); return true;`,
    { gesture: true },
  );

/** A hidden download link to a Blob, the way letter.ts and photo-shrink.ts make one. */
const saveBlobAs = (name, kind) =>
  pageWith(
    `
    const name = ${JSON.stringify(name)};
    let blob;
    if (${JSON.stringify(kind)} === 'jpeg') {
      const canvas = document.createElement('canvas');
      canvas.width = 8; canvas.height = 8;
      const g = canvas.getContext('2d'); g.fillStyle = 'red'; g.fillRect(0, 0, 8, 8);
      blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.8));
    } else {
      blob = new Blob([${JSON.stringify(kind === 'script' ? '#!/bin/sh' : '{"test":true}')}], { type: 'application/octet-stream' });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.hidden = true;
    document.body.append(a); a.click(); a.remove();
    return blob.size;
  `,
    { gesture: true },
  );

function launch() {
  adb('shell', 'am', 'start', '-W', '-n', ACTIVITY);
}

const resumed = () =>
  shell('dumpsys activity activities')
    .split('\n')
    .filter((line) => /ResumedActivity/.test(line))
    .map((line) => line.trim())
    .join(' | ');

try {
  /* ---------- set up: a 360 dp wide screen, a clean install ---------- */
  const sdk = shell('getprop ro.build.version.sdk');
  console.log(`Emulator: API ${sdk}, ${shell('getprop ro.product.model')}`);
  const webview = shell('dumpsys webviewupdate')
    .split('\n')
    .filter((line) => /Current WebView package|versionName/i.test(line))
    .map((line) => line.trim())
    .join('; ');
  console.log(`WebView: ${webview || '(not reported)'}`);
  // 1080 px at 480 dpi is 360 dp, the width the converter must fit (spec 3).
  shell('wm size 1080x1920');
  shell('wm density 480');
  console.log(
    `Screen: ${shell('wm size').replace(/\n/g, ' ')}; ${shell('wm density').replace(/\n/g, ' ')}`,
  );
  shell('settings put global window_animation_scale 0');
  shell('logcat -c');
  try {
    adb('uninstall', PACKAGE);
  } catch {
    // not installed yet
  }
  adb('install', '-t', apk);
  const before = downloads();
  console.log(`Downloads folder before: ${before.length} files`);

  launch();
  await connect();
  await waitFor(
    () => page('document.readyState === "complete" && !!document.querySelector("footer")'),
    'the app to load',
  );

  /* ---------- a. the app loads, with the one version number ---------- */
  const footer = await page('document.querySelector("footer").textContent');
  const origin = await page('location.origin');
  check(
    'a. the app loads and the footer shows the package.json version',
    footer.startsWith(`Version ${version}.`) && origin === APP_ORIGIN,
    `origin ${origin}; footer "${footer}"`,
  );

  /* ---------- b. CSP and no commands ---------- */
  const csp = await page(
    'document.querySelector("meta[http-equiv=\\"Content-Security-Policy\\"]")?.content ?? null',
  );
  const builtHtml = readFileSync(join(root, 'dist/index.html'), 'utf8');
  check(
    'b1. the page carries the strict build CSP from dist/index.html',
    typeof csp === 'string' &&
      builtHtml.includes(`content="${csp}"`) &&
      csp.includes("connect-src 'none'"),
    csp,
  );

  const fetchResult = await page(`new Promise((done) => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective + ' blocked ' + e.blockedURI));
    fetch('https://example.org/').then(
      () => done({ outcome: 'resolved', violations }),
      (error) => setTimeout(() => done({ outcome: 'rejected: ' + error, violations }), 300),
    );
  })`);
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

  const globals = await page(
    '({ tauri: typeof window.__TAURI__, internals: typeof window.__TAURI_INTERNALS__ })',
  );
  check(
    'b4. window.__TAURI__ is not exposed (withGlobalTauri is false)',
    globals.tauri === 'undefined',
    JSON.stringify(globals),
  );

  const invokes = await page(`new Promise((done) => {
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
  })`);
  const ran = Object.entries(invokes).filter(([, v]) => String(v).startsWith('RAN'));
  check(
    'b5. __TAURI_INTERNALS__.invoke cannot run any command',
    !invokes.skipped && ran.length === 0,
    JSON.stringify(invokes),
  );

  /* ---------- c. paste an announcement, fill the form, copy ---------- */
  const input = readFileSync(
    join(root, 'tests/fixtures/weekly/1-pack-calendar.input.html'),
    'utf8',
  );
  const expectedForm = JSON.parse(
    readFileSync(join(root, 'tests/fixtures/weekly/1-pack-calendar.form.json'), 'utf8'),
  );
  await pageWith(
    `const box = labelled('Paste the old HTML here'); if (!box) throw new Error('no paste box'); setValue(box, ${JSON.stringify(input)}); return true;`,
  );
  const firstEvent = expectedForm.sections[0].rows[0].event;
  const filled = await waitFor(
    () =>
      pageWith(`
        const heading = Array.from(document.querySelectorAll('h2')).find((h) => visible(h) && h.textContent.trim() === 'Edit the announcement');
        const event = Array.from(document.querySelectorAll('input')).some((i) => i.value === ${JSON.stringify(firstEvent)});
        const radio = Array.from(document.querySelectorAll('input[type=radio]')).find((r) => r.checked);
        return heading && event ? { event, layout: radio && radio.labels[0] ? radio.labels[0].textContent.trim().slice(0, 30) : null } : null;
      `),
    'the form to fill',
  );
  check(
    'c1. pasting an announcement fills the form',
    filled.event === true && /^Date list/.test(filled.layout ?? ''),
    `an event field says "${firstEvent}"; layout "${filled.layout}"`,
  );

  // h (converter). The form is open, so this is the longest converter screen.
  const converterFit = await page(
    '({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth, dpr: window.devicePixelRatio })',
  );
  const wideEnough = converterFit.inner <= 360 && converterFit.inner >= 300;
  check(
    'h1. the emulator screen is 360 dp wide, and the converter does not scroll sideways',
    wideEnough && converterFit.scroll <= converterFit.inner,
    JSON.stringify(converterFit),
  );

  await clickButton('Copy new HTML');
  const copyOutcome = await waitFor(
    () =>
      pageWith(`
        const all = Array.from(document.querySelectorAll('span, p'));
        if (all.some((e) => e.children.length === 0 && e.textContent.trim() === 'Copied')) return 'copied';
        if (all.some((e) => e.textContent.startsWith('Copying did not work here'))) return 'fallback box shown';
        return null;
      `),
    'the copy result',
    10_000,
  );
  check(
    'c2. Copy new HTML copies, or shows the select-and-copy box',
    copyOutcome === 'copied' || copyOutcome === 'fallback box shown',
    `outcome: ${copyOutcome}`,
  );

  /* ---------- the monthly letter screen ---------- */
  await clickTab('Monthly letter');
  await waitFor(
    () => pageWith(`return !!buttonNamed('Download draft');`),
    'the Download draft button',
  );
  const letterFit = await page(
    '({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth })',
  );
  check(
    'h2. the monthly letter does not scroll sideways at 360 dp',
    letterFit.scroll <= letterFit.inner,
    JSON.stringify(letterFit),
  );

  /* ---------- d. Download draft into Downloads ---------- */
  const newFiles = (known) => downloads().filter((f) => !known.includes(f));
  await clickButton('Download draft');
  const first = await waitFor(() => {
    const fresh = newFiles(before).filter((f) => f.endsWith('.json'));
    return fresh.length >= 1 ? fresh : null;
  }, 'the first download');
  let parsed = false;
  try {
    JSON.parse(shell(`cat '${DOWNLOADS}/${first[0]}'`));
    parsed = true;
  } catch {
    parsed = false;
  }
  check(
    'd1. Download draft writes a .json file into /sdcard/Download',
    first.length === 1 && parsed,
    `${first.join(', ')}; valid JSON: ${parsed}`,
  );
  const baseName = first[0].replace(/\.json$/, '');
  await clickButton('Download draft');
  const second = await waitFor(() => {
    const fresh = newFiles(before).filter((f) => f.endsWith('.json'));
    return fresh.length >= 2 ? fresh : null;
  }, 'the second download');
  check(
    'd2. a second press makes the name with " (1)"',
    second.includes(`${baseName} (1).json`),
    second.join(', '),
  );
  await clickButton('Download draft');
  const third = await waitFor(() => {
    const fresh = newFiles(before).filter((f) => f.endsWith('.json'));
    return fresh.length >= 3 ? fresh : null;
  }, 'the third download');
  check('d3. a third press makes " (2)"', third.includes(`${baseName} (2).json`), third.join(', '));

  await saveBlobAs('..\\..\\sub/evil:name?.json', 'json');
  const plain = await waitFor(
    () => (downloads().includes('evil_name_.json') ? downloads() : null),
    'the oddly named download',
  );
  check(
    'd4. a name with folder parts is saved as a plain name inside Downloads',
    plain.includes('evil_name_.json'),
    plain.filter((f) => f.includes('evil')).join(', '),
  );

  const beforeRefused = downloads();
  for (const name of ['setup.exe', 'Open me.command', 'draft‮nosj.exe']) {
    await saveBlobAs(name, 'script');
  }
  await sleep(4000);
  const afterRefused = downloads();
  const refusedLog = shell('logcat -d -s Pack137Save:V');
  check(
    'd5. downloads named setup.exe and .command are refused',
    JSON.stringify(afterRefused) === JSON.stringify(beforeRefused) &&
      (refusedLog.match(/Refused a save: the file type/g) ?? []).length >= 3,
    `files before ${beforeRefused.length}, after ${afterRefused.length}; "refused" log lines: ${(refusedLog.match(/Refused a save: the file type/g) ?? []).length}`,
  );

  /* ---------- e. Shrink a photo: the picker opens, and a JPEG saves ---------- */
  const converterTab = await pageWith(`
    const t = Array.from(document.querySelectorAll('[role=tab]'))[0];
    t.click();
    return t.textContent.trim();
  `);
  await pageWith(
    `
    const radio = Array.from(document.querySelectorAll('input[type=radio]')).find((r) => r.labels[0] && r.labels[0].textContent.trim().startsWith('Link list'));
    if (!radio) throw new Error('no Link list layout');
    radio.click();
    return true;
  `,
    { gesture: true },
  );
  const shrinkShown = await waitFor(
    () => pageWith(`return !!buttonNamed('Shrink a photo');`),
    'the Shrink a photo button',
  );
  const beforePicker = resumed();
  await clickButton('Shrink a photo');
  const pickerTop = await waitFor(() => {
    const now = resumed();
    return now !== '' && !now.includes(PACKAGE) ? now : null;
  }, 'the system picker to come to the front');
  check(
    'e1. Shrink a photo opens the system picker (another app is in front)',
    shrinkShown && /documentsui|photopicker|providers\.media|gallery|photos/i.test(pickerTop),
    `tab "${converterTab}"; before: ${beforePicker}; with picker: ${pickerTop}`,
  );
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  const backInApp = await waitFor(
    () => resumed().includes(PACKAGE),
    'the app to come back',
    15_000,
  );
  check('e2. Back from the picker returns to the app', backInApp === true, resumed());

  const jpegSize = await saveBlobAs('shrink-test.jpg', 'jpeg');
  const jpegSaved = await waitFor(
    () => (downloads().includes('shrink-test.jpg') ? true : null),
    'the JPEG download',
  );
  const head = execFileSync('adb', ['exec-out', `head -c 3 '${DOWNLOADS}/shrink-test.jpg'`], {
    timeout: 30_000,
  });
  check(
    'e3. a JPEG saved through the download link lands in /sdcard/Download',
    jpegSaved === true && Buffer.from(head).toString('hex') === 'ffd8ff',
    `blob ${jpegSize} bytes; first bytes ${Buffer.from(head).toString('hex')}`,
  );

  /* ---------- f. saved work survives a force-stop ---------- */
  const typed = 'A busy month of camp and cars';
  await clickTab('Monthly letter');
  await waitFor(() => pageWith(`return !!labelled('Summary line');`), 'the Summary line field');
  await pageWith(
    `const f = document.querySelector('#panel-monthly') ? labelled('Summary line', document.querySelector('#panel-monthly')) : null; if (!f) throw new Error('no field'); setValue(f, ${JSON.stringify(typed)}); return true;`,
  );
  await waitFor(
    () =>
      pageWith(
        `return Array.from(document.querySelectorAll('#panel-monthly *')).some((e) => e.children.length === 0 && e.textContent.startsWith('Saved on this device at'));`,
      ),
    'the autosave note',
  );
  // The web view writes saved work to its storage a few seconds after the page asks. A person
  // does not swipe the app away in the same second, so wait a little first.
  await sleep(8000);
  cdp.socket.close();
  adb('shell', 'am', 'force-stop', PACKAGE);
  await sleep(1000);
  launch();
  await connect();
  await waitFor(
    () => page('document.readyState === "complete" && !!document.querySelector("footer")'),
    'the app to load again',
  );
  await clickTab('Monthly letter');
  const offered = await waitFor(
    () =>
      pageWith(`
        const heading = Array.from(document.querySelectorAll('#panel-monthly h2, #panel-monthly h3')).find((h) => h.textContent.trim() === 'You have a saved letter on this device');
        const keep = Array.from(document.querySelectorAll('#panel-monthly button')).find((b) => b.textContent.trim().startsWith('Keep working on the'));
        return heading && keep ? keep.textContent.trim() : null;
      `),
    'the saved letter to be offered back',
  );
  await pageWith(
    `Array.from(document.querySelectorAll('#panel-monthly button')).find((b) => b.textContent.trim().startsWith('Keep working on the')).click(); return true;`,
    { gesture: true },
  );
  const restored = await waitFor(
    () =>
      pageWith(
        `const f = labelled('Summary line', document.querySelector('#panel-monthly')); return f ? f.value : null;`,
      ),
    'the letter to open',
  );
  check(
    'f. after force-stop and relaunch, the saved letter is offered back with its text',
    restored === typed,
    `offered "${offered}"; Summary line "${restored}"`,
  );

  /* ---------- g. navigation lock ---------- */
  for (const [label, target] of [
    ['https://example.org/', 'https://example.org/'],
    ['a data: address', 'data:text/html,<h1>x</h1>'],
  ]) {
    await page(`setTimeout(() => { location.href = ${JSON.stringify(target)}; }, 0); 1`);
    await sleep(3000);
    const after = await page(
      '({ origin: location.origin, hasFooter: !!document.querySelector("footer") })',
    );
    check(
      `g. location.href = ${label} leaves the app on ${APP_ORIGIN}`,
      after.origin === APP_ORIGIN && after.hasFooter,
      JSON.stringify(after),
    );
  }

  /* ---------- i. no permissions ---------- */
  const dump = shell(`dumpsys package ${PACKAGE}`);
  const block = /requested permissions:\n((?:[ \t]+[^\n]*[^:\n]\n)*)/.exec(dump)?.[1] ?? '';
  const asked = block
    .split('\n')
    .map((line) => line.trim().split(':')[0])
    .filter((line) => line !== '' && !line.endsWith('DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'));
  check(
    'i. the installed app requests no permission',
    asked.length === 0,
    asked.length === 0 ? '(none)' : asked.join(', '),
  );
} catch (error) {
  check('the Android test ran to the end', false, String(error?.stack ?? error));
} finally {
  try {
    cdp?.socket.close();
  } catch {
    // already closed
  }
  const failedAny = results.some((r) => !r.ok);
  if (failedAny) {
    try {
      console.log('\n--- app log (Pack137Save, and WebView errors) ---');
      console.log(shell('logcat -d -s Pack137Save:V chromium:E AndroidRuntime:E').slice(-4000));
      console.log(`Resumed: ${resumed()}`);
      console.log(`Downloads: ${downloads().join(', ')}`);
    } catch {
      // the log is a courtesy
    }
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
