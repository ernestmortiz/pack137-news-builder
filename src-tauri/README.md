# Desktop wrapper (Tauri 2)

This folder wraps the web app in the operating system's own web view, for Windows and macOS. It is a thin shell. The web build in `dist/` is the product, and the wrapper hosts it. No feature exists in the wrapper that is not in the web build (spec section 3).

Volunteers read `docs/installing-the-desktop-app.md`. This file is for whoever maintains the wrapper.

## What the wrapper does

- Opens one window (1200 by 860, minimum 360 wide) on the bundled `dist/` files.
- Sends every download to the person's Downloads folder (the home folder if there is none). It keeps the file name the page suggested, reduced to a plain name, and adds ` (1)`, ` (2)` before the extension when the name is taken, as browsers do. This is `on_download` in `src/lib.rs`. Download draft and Shrink a photo both save through a normal browser download, and the UI already says "Look in your Downloads folder" (ADR 0004, Desktop and Android wrappers, point 2).
- Locks navigation to the app's own origin. `on_navigation` allows `tauri://localhost` (macOS and Linux), `http://tauri.localhost` and `https://tauri.localhost` (Windows), `about:blank` and `about:srcdoc` (the sandboxed preview frames), and `blob:` addresses that carry the app's own origin (the download links). Everything else is refused. `on_new_window` refuses every new window. The Vite dev server is allowed only in a dev run (`cfg!(dev)`).
- Refuses every permission request (camera, location, notifications and so on). The page asks for none.

## What the wrapper does not do

- No JavaScript changes. The app uses web APIs only: `navigator.clipboard` with its own fallback, `<input type="file">`, `<a download>` with Blob URLs, and `localStorage`.
- No `@tauri-apps/api`, no plugins (dialog, fs, shell, clipboard, opener, updater, http), no custom commands, no IPC from the page.
- No capabilities. `src-tauri/capabilities/` does not exist, so no window is granted any command. `withGlobalTauri` is `false`, so `window.__TAURI__` does not exist.
- The `devtools` Cargo feature is off, so release builds have no inspector.
- No auto-update, no tray icon, no menus beyond the default.
- No signing keys, certificates, tokens or updater keys. Nothing of the kind may be committed. The installers are unsigned (spec section 3 and 13). macOS builds are ad-hoc signed (`signingIdentity` is `-`), which is not a certificate and uses no secret.

If a change seems to need any of the "does not" items, stop and ask the project owner first. Each one widens what a pasted page could reach.

## The Content Security Policy decision

`app.security.csp` is `null` on purpose.

The built `dist/index.html` already carries the strict policy as a `<meta http-equiv="Content-Security-Policy">` tag. `vite.config.ts` writes it (`BUILD_CSP`), and ADR 0004 requires the wrapper to match it with nothing looser. If Tauri's own `csp` setting were a string, Tauri would add it as a header and also add its own sources, including `ipc:` and `http://ipc.localhost`, which the web build does not have. With `null`, Tauri adds nothing and the meta tag is the only policy in force.

`tests/wrapper/smoke.mjs` proves this in the running app: the page carries the policy from `dist/index.html`, `fetch("https://example.org/")` fails, and the browser reports a `connect-src` violation for it.

Do not change `csp` to a string, and do not edit the policy here. Edit `BUILD_CSP` in `vite.config.ts`, so the web build and the wrappers cannot drift apart.

## The no-IPC decision

Tauri always puts `window.__TAURI_INTERNALS__` into the page. With no capabilities, every command is refused. The smoke test calls eight commands, among them `plugin:app|version`, `plugin:event|listen`, `plugin:window|close` and `plugin:fs|read_file`, plus an unknown one. All are refused. The refusal text names the missing permission, which shows the permission check ran and found no capability. The policy also sets `connect-src 'none'`, so the page has no fetch channel to Tauri either.

## Versions

Tauri is pinned to releases that were at least two weeks old when chosen (2026-11-22):

- npm `@tauri-apps/cli` 2.12.4, exact, in `package.json`.
- Rust `tauri` `=2.12.5` and `tauri-build` `=2.7.4`, exact, in `Cargo.toml`.
- `tauri-driver` 2.1.0, for the smoke test only.
- `Cargo.lock` is committed. The Tauri family in it (`tauri-runtime`, `tauri-runtime-wry`, `tauri-utils`, `tauri-codegen`, `tauri-macros`, `wry`, `tao`) was pinned back to releases older than two weeks with `cargo update -p <crate> --precise <version>`. Other crates in the lock file were not audited for age. `cargo build` only changes the lock file when `Cargo.toml` changes, so these stay.

To upgrade, bump the CLI and the crates together, to the same minor, then read the Tauri changelog, run `cargo test`, run the smoke test, and build both installers from CI.

The app version is not set here. `tauri.conf.json` has `"version": "../package.json"`, so the installer, the footer and the web build share one number. `Cargo.toml` says `0.0.0` and is not shown to anyone.

## Running it

Needs Node 22 and the toolchain below.

- `npm run desktop:dev` opens the app on the Vite dev server (port 5173, strict). Changes reload.
- `npm run desktop:build` makes the installers for the computer you are on. Windows gives an NSIS `.exe`. macOS gives a `.dmg`. For one `.dmg` that runs on both Apple silicon and Intel, run `npx tauri build --target universal-apple-darwin` after `rustup target add aarch64-apple-darwin x86_64-apple-darwin`. CI does this.
- `cargo test` in this folder runs the unit tests for the download names and the navigation rules.
- `npm run build` must have run before `cargo build` or `cargo test`, because the compiler embeds `dist/`. `npx tauri build --debug --no-bundle` does both. A plain `cargo build` makes a dev binary that loads the dev server address, so use `tauri build` for anything you want to run.

## Smoke test of the real app (Linux)

`scripts/wrapper-smoke.sh` builds the debug app, starts it on a virtual display and drives it with WebDriver through `tauri-driver`. It runs twice, once on a computer with a Downloads folder and once with none. It checks:

- the window loads the app and the footer shows `Version` and the `package.json` number;
- the meta CSP is in force, a `fetch` fails with a reported violation, `window.__TAURI__` is undefined and no `__TAURI_INTERNALS__` command can run;
- Download draft writes a `.json` into a temporary Downloads folder, a second press makes ` (1)`, a third ` (2)`, and an odd name with folder parts is saved as a plain name;
- the window stays on its own origin when the page sets `location.href` to a real local web server, to `https://example.org/` or to a `data:` address, and `window.open` and a `target="_blank"` link open nothing and reach no server.

It needs `webkit2gtk-driver` and `xvfb` from apt, and `cargo install tauri-driver --version 2.1.0 --locked`. It uses a private home folder, so it never touches the real Downloads folder. Set `SKIP_BUILD=1` to reuse a built app. `.github/workflows/wrappers.yml` runs it on pull requests that touch this folder.

Known limits:

- It runs the Linux web view (WebKitGTK). Windows (WebView2) and macOS (WKWebView) are not driven by this test. Check those by hand with the installers that `wrappers.yml` builds, before tagging: open the app, press Download draft, and look in Downloads. On macOS, WKWebView downloads need macOS 11.3, which is why `minimumSystemVersion` is `11.3`.
- On Linux, the navigation lock alone also stops `window.open` and `target="_blank"`. `on_new_window` is a second guard, which has not been shown necessary on Linux. Keep it.
- On Linux, WebKitGTK's own default already saves to the Downloads folder with numbered names, so the first run cannot tell the download handler from the default. The second run, with no Downloads folder, does tell them apart: without the handler the file lands in the working folder, with it in the home folder. The file name cleanup is covered by the Rust unit tests.

## Toolchain per platform

- All: Rust (stable, 1.77.2 or newer), Node 22.
- Windows: Microsoft C++ Build Tools (the "Desktop development with C++" workload) and the WebView2 runtime. Windows 10 and 11 have WebView2. The NSIS installer is `installMode: currentUser`, so end users need no administrator rights. Tauri downloads NSIS itself at build time.
- macOS: Xcode Command Line Tools. The `.dmg` can only be built on macOS, which is why CI uses a macOS runner.
- Linux (smoke test only, not a shipped build): `build-essential`, `pkg-config`, `libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `xvfb`, `webkit2gtk-driver`.

## Icons

`icons/source.svg` is a navy rounded square with "137" in gold. `scripts/make-icon.mjs` writes it from the navy and gold values in `src/config/tokens.ts`. With `--png` it also renders `icons/source.png` at 1024 pixels using the Chromium that Playwright installs. Then:

```
node scripts/make-icon.mjs --png
npx tauri icon src-tauri/icons/source.png
```

`tauri icon` also writes Android and iOS folders. They are deleted for now. Phase 8 will need the Android one. There is no real pack logo file in the repository. Replace `source.svg` with one when the owner supplies it.

## Files

- `tauri.conf.json`: product name, identifier `org.pack137.newsbuilder`, window, bundle settings, version from `package.json`.
- `src/lib.rs`: the downloads, navigation and permission rules, with tests. `src/main.rs` only calls it.
- `Cargo.toml`, `Cargo.lock`, `build.rs`: the Rust project.
- `icons/`: the generated icon set and its source.
- `target/` and `gen/schemas/` are build output and are not committed.
