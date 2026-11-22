# Desktop and Android wrapper (Tauri 2)

This folder wraps the web app in the operating system's own web view, for Windows and Android. There is no Mac app: current macOS will not run an app Apple has not notarized, so Mac volunteers use the web build (ADR 0006). It is a thin shell. The web build in `dist/` is the product, and the wrapper hosts it. No feature exists in the wrapper that is not in the web build (spec section 3).

Volunteers read `docs/installing-the-desktop-app.md`. This file is for whoever maintains the wrapper.

## What the wrapper does

- Opens one window (1200 by 860, minimum 360 wide) on the bundled `dist/` files.
- Sends every download to the person's Downloads folder (the home folder if there is none). Only the kinds of file the app makes are saved: `.json` (drafts) and `.jpg` or `.jpeg` (shrunk photos). Anything else, such as `.exe` or `.command`, is refused. It keeps the file name the page suggested, reduced to plain letters, digits, spaces and `-_.()`, and adds ` (1)`, ` (2)` before the extension when the name is taken, as browsers do. It never writes over a file, a broken link counts as taken, and with no Downloads or home folder the download is refused. This is `on_download` in `src/lib.rs`. Download draft and Shrink a photo both save through a normal browser download, and the UI already says "Look in your Downloads folder" (ADR 0004, Desktop and Android wrappers, point 2).
- Locks navigation to the app's own origin. `on_navigation` allows only the origin Tauri serves on that platform: `tauri://localhost` on Linux (the smoke test), `http://tauri.localhost` on Windows and Android. The other forms are refused, because Tauri does not serve them there and they could reach the network or another program. It also allows `about:blank` and `about:srcdoc` (the sandboxed preview frames), and `blob:` addresses that carry the app's own origin (the download links). Everything else is refused. `on_new_window` refuses every new window. The Vite dev server on port 5173 is allowed only in a dev run (`cfg!(dev)`).
- Refuses every permission request (camera, location, notifications and so on). The page asks for none.
- Turns off Tauri's own drag and drop handling (`dragDropEnabled: false`), so nothing native listens for dropped files.
- The Windows installer sets up Microsoft WebView2 only if the PC lacks it (`webviewInstallMode` is the download bootstrapper). Windows 10 and 11 normally have it. That download at install time is the only time anything uses the internet; the app never does.

## What the wrapper does not do

- No JavaScript changes. The app uses web APIs only: `navigator.clipboard` with its own fallback, `<input type="file">`, `<a download>` with Blob URLs, and `localStorage`.
- No `@tauri-apps/api`, no plugins (dialog, fs, shell, clipboard, opener, updater, http), no custom commands, no IPC from the page.
- No capabilities. `src-tauri/capabilities/` does not exist, so no window is granted any command. `withGlobalTauri` is `false`, so `window.__TAURI__` does not exist.
- The `devtools` Cargo feature is off, so release builds have no inspector.
- No auto-update, no tray icon, no menus beyond the default.
- No signing keys, certificates, tokens or updater keys. Nothing of the kind may be committed. The Windows installer is unsigned (spec section 3 and 13).

If a change seems to need any of the "does not" items, stop and ask the project owner first. Each one widens what a pasted page could reach.

## The Content Security Policy decision

`app.security.csp` is `null` on purpose.

The built `dist/index.html` already carries the strict policy as a `<meta http-equiv="Content-Security-Policy">` tag. `vite.config.ts` writes it (`BUILD_CSP`), and ADR 0004 requires the wrapper to match it with nothing looser. If Tauri's own `csp` setting were a string, Tauri would add it as a header and also add its own sources, including `ipc:` and `http://ipc.localhost`, which the web build does not have. With `null`, Tauri adds nothing and the meta tag is the only policy in force.

`tests/wrapper/smoke.mjs` proves this in the running app: the page carries the policy from `dist/index.html`, `fetch("https://example.org/")` fails, and the browser reports a `connect-src` violation for it.

Do not change `csp` to a string, and do not edit the policy here. Edit `BUILD_CSP` in `vite.config.ts`, so the web build and the wrappers cannot drift apart.

## The no-IPC decision

Tauri always puts `window.__TAURI_INTERNALS__` into the page. With no capabilities, every command is refused. The smoke test calls eight commands, among them `plugin:app|version`, `plugin:event|listen`, `plugin:window|close` and `plugin:fs|read_file`, plus an unknown one. All are refused. The refusal text names the missing permission, which shows the permission check ran and found no capability. The policy's `connect-src 'none'` closes Tauri's fetch channel, but Tauri falls back to the web view's message channel, which no policy covers. So the permission check, with no capability granted, is the real barrier. Keep it that way: `tests/unit/wrapper-config.test.ts` fails if a capability appears.

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
- `npm run desktop:build` on Windows makes the NSIS `.exe`. On Linux, `npx tauri build --debug --no-bundle` makes the app for the smoke test.
- `cargo test` in this folder runs the unit tests for the download names and the navigation rules.
- `npm run build` must have run before `cargo build` or `cargo test`, because the compiler embeds `dist/`. `npx tauri build --debug --no-bundle` does both. A plain `cargo build` makes a dev binary that loads the dev server address, so use `tauri build` for anything you want to run.

## Smoke test of the real app (Linux)

`scripts/wrapper-smoke.sh` builds the debug app, starts it on a virtual display and drives it with WebDriver through `tauri-driver`. It runs twice, once on a computer with a Downloads folder and once with none. It checks:

- the window loads the app and the footer shows `Version` and the `package.json` number;
- the meta CSP is in force, a `fetch` fails with a reported violation, `window.__TAURI__` is undefined and no `__TAURI_INTERNALS__` command can run;
- Download draft writes a `.json` into a temporary Downloads folder, a second press makes ` (1)`, a third ` (2)`, an odd name with folder parts is saved as a plain name, and `.command` and `.exe` downloads are refused;
- the window stays on its own origin when the page sets `location.href` to a real local web server, to `https://example.org/` or to a `data:` address, and `window.open` and a `target="_blank"` link open nothing and reach no server, and a `blob:` page made by script cannot run inline script (the app's policy carries over).

It needs `webkit2gtk-driver` and `xvfb` from apt, and `cargo install tauri-driver --version 2.1.0 --locked`. It uses a private home folder, so it never touches the real Downloads folder. Set `SKIP_BUILD=1` to reuse a built app. `.github/workflows/wrappers.yml` runs it on pull requests that touch this folder, the UI, `index.html`, the build config or the test itself. `tests/unit/wrapper-config.test.ts` runs in the main CI on every push and fails if a capability, plugin, CSP string or extra Rust dependency appears.

`wrappers.yml` publishes its test installers as a draft pre-release named `test-build-pr-<number>`, replaced on each run and visible only to people with write access. The build jobs hand the files to the publish job through the Actions cache, keyed by run, because artifacts count against the account's storage quota and the cache does not; `release.yml` does the same. Only the publish job can write. Install a test installer only when it was built from a branch in this repository. The installer jobs do not run for pull requests from forks, because a fork could put anything in an installer.

Known limits:

- It runs the Linux web view (WebKitGTK). Windows (WebView2) is not driven by this test. Check it by hand with the installer that `wrappers.yml` builds, before tagging: open the app, press Download draft, and look in Downloads.
- On Linux, the navigation lock alone also stops `window.open` and `target="_blank"`. `on_new_window` is a second guard, which has not been shown necessary on Linux. Keep it.
- On Linux, WebKitGTK's own default already saves to the Downloads folder with numbered names, so the first run cannot tell the download handler from the default. The second run, with no Downloads folder, does tell them apart: without the handler the file lands in the working folder, with it in the home folder. The file name cleanup is covered by the Rust unit tests.

## Android (Phase 8, first step: a test APK from CI)

The Android project is `gen/android`, made by `npx tauri android init` and committed (Tauri's advice). `gen/schemas` stays ignored. It was edited by hand, so do not regenerate it over the top without reading `git diff`:

- `AndroidManifest.xml`: no `uses-permission` at all (the template adds `INTERNET`), no TV entries, `allowBackup="false"` so Google does not copy saved work to the cloud, `usesCleartextTraffic="false"` in every build type (the template turns it on for debug builds).
- `app/build.gradle.kts`: `minSdk = 29` (Android 10, spec 13), and the two `usesCleartextTraffic` placeholders removed.
- `MainActivity.kt`: pads the window by the system bar, cutout and keyboard insets. Android 15 and later force apps edge to edge, which would put the page under the status bar. It also registers the save channel (see "Saving files on Android") and, in debug builds only, turns WebView debugging on for the emulator test.
- `DownloadSaver.kt`, `SaveRules.kt`: the save channel and its rules (below). `app/src/test/` has the JVM unit tests of `SaveRules`.
- `res/mipmap-*`, `res/values/ic_launcher_background.xml`: the pack icon instead of Tauri's.
- Drawables and the Hello World layout of the template are unused; the layout was left in place.

What Tauri 2.12.5 with wry 0.57.1 gives the page on Android, from the source in `Cargo.lock` (paths are inside `~/.cargo/registry/src/*/`):

- File picker: yes. `wry-0.57.1/src/android/kotlin/RustWebChromeClient.kt` implements `onShowFileChooser` (line 310) and opens the system picker (`showFilePicker`, line 399). It asks for no permission unless the input has the `capture` attribute, which the app does not use. The system picker needs no storage permission on Android 10 and later.
- Downloads: no. There is no `DownloadListener` anywhere in `wry-0.57.1/src/android`, and `src/android/mod.rs` never reads the download handler. `on_download` is not called on Android, so an `<a download>` with a Blob address does nothing by itself. The app adds its own way to save; see "Saving files on Android" below.
- `on_navigation` applies: `RustWebView.kt` `loadUrl` and `RustWebViewClient.kt` `shouldOverrideUrlLoading` both call it (`src/android/binding.rs` line 345). `on_permission_request` applies for camera, microphone, location, protected media and MIDI. `on_new_window` does not apply (tauri `webview/mod.rs`, documented "Android / iOS: Not supported"); the navigation lock and `javaScriptCanOpenWindowsAutomatically` with no `onCreateWindow` mean `window.open` opens nothing, but that has not been seen on a phone.
- Origin: `http://tauri.localhost` (tauri `protocol/mod.rs` line 32, `cfg!(windows) || cfg!(target_os = "android")`). `is_app_origin` in `src/lib.rs` uses that form on Android.
- Storage: `RustWebView.kt` sets `domStorageEnabled`, so `localStorage` is kept in the app's private data. Not yet seen across a restart on a phone.
- Clipboard: `http://tauri.localhost` counts as a secure context in Chromium (any `*.localhost`), so `navigator.clipboard.writeText` should work after a tap, with the app's own fallback if it does not. Not yet seen on a phone.
- Network: the app is served by `shouldInterceptRequest` (`RustWebViewClient.kt`), which does not use the network stack, so the `INTERNET` permission is removed. The CI job fails if the APK asks for any permission other than the one AndroidX adds to every app. Whether the WebView starts without `INTERNET` is known only from experience of other apps, not from a test here; if the test APK shows a blank page, that is the first thing to check.
- `on_download` and `on_new_window` stay in `lib.rs` and do nothing on Android, so there is one codebase. The save script is added from `lib.rs` under `#[cfg(target_os = "android")]`.

### Saving files on Android

The page is unchanged. Download draft and Shrink a photo make a hidden `<a download>` with a Blob address, and press it. The Android web view has no download handler, so two small pieces handle it, with nothing else exposed to the page:

1. `src/android-save.js`, added by `lib.rs` as an initialization script on Android only. It wraps `URL.createObjectURL` to remember the Blob behind each address (and forgets it on `URL.revokeObjectURL`). It listens for `click` on the document, in the capture phase, for an `<a download>` whose `blob:` address it remembers. It cancels the click, reads the Blob with `FileReader.readAsDataURL` (not `fetch`, which the page's `connect-src 'none'` blocks), and posts `{ name, dataUrl }` as a JSON string to `window.pack137Save`. It stops at 8 MB, and does nothing if `pack137Save` is missing (a frame without it, or a web view too old for it).
2. `MainActivity.onWebViewCreate` registers `pack137Save` with `WebViewCompat.addWebMessageListener`, for the origin `http://tauri.localhost` only and only if the web view supports it. `DownloadSaver` accepts a message only from the main frame of that origin. It parses the JSON, cleans the name with `SaveRules.sanitizeFileName` (a port of `sanitize_file_name` in `lib.rs`: plain ASCII letters, digits, spaces and `-_.()`, 120 characters, reserved Windows names prefixed, and only `.json`, `.jpg` and `.jpeg`), decodes the data URL, refuses more than 8 MB, and writes with `MediaStore.Downloads` (`IS_PENDING` while writing). That needs no storage permission on Android 10 and later, and it cannot write anywhere but Downloads. A taken name gets ` (1)`, ` (2)` before the extension. A refusal or a failure shows nothing (the page already says "Look in your Downloads folder") and is logged under the tag `Pack137Save`.

No Tauri plugin is used for this: a plugin would put commands and a capability on the page, which the no-bridge design (ADR 0006) rules out. The channel is one object that takes one kind of message and can write one kind of file in one folder. `tests/unit/wrapper-config.test.ts` fails if the listener is registered for another origin, or if the saver gains another way to write.

`SaveRules.kt` has no Android classes so JVM tests can run it: `app/src/test/java/org/pack137/newsbuilder/SaveRulesTest.kt` has the same cases as the Rust tests. CI runs them with `./gradlew :app:testArm64DebugUnitTest` in `gen/android`, after the APK build (the Android project needs the files that build generates). The part that touches MediaStore is tested only on the emulator.

### Building

CI is the path (`wrappers.yml`, jobs `android` and `android-emulator`): Java 17, the runner's Android SDK and NDK, `rustup target add aarch64-linux-android`, then `npx tauri android build --debug --apk --target aarch64`. Locally you need Android Studio's SDK (platform 37 and build tools), an NDK, `ANDROID_HOME`, `NDK_HOME` and Java 17 or later.

The APK is a debug build signed with the Android debug key that Gradle makes on the runner. No keystore, password or token exists anywhere in the repository or the secrets, so each build has a different signature and Android refuses to update over the previous one: uninstall the old test app first (its saved work goes with it). ### Emulator test (the release gate)

The owner has no Android device, so the emulator test is the gate for releasing it for internal tests. The job `android-emulator` builds an x86_64 debug APK from the same source (the only difference from the shipped test APK is the CPU type), enables KVM, and runs it on an emulator with `reactivecircus/android-emulator-runner` (pinned to a commit). `scripts/android-smoke.sh` waits for the boot and runs `tests/wrapper/android-smoke.mjs`, which:

- sets the screen to 1080 by 1920 pixels at 480 dpi, which is 360 dp wide, installs the APK and starts it;
- forwards the WebView's devtools socket (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`) and talks to the page with the Chrome DevTools Protocol over Node's built-in WebSocket. It does not use Playwright's `connectOverCDP`: that expects a full Chrome browser behind the socket, and the raw protocol has fewer parts that could not be tried without an emulator. The debug build allows this: wry turns debugging on in debug builds and `MainActivity` does too, under `BuildConfig.DEBUG`;
- checks the version footer, the build policy, a failing `fetch`, that no Tauri command runs, pasting `1-pack-calendar.input.html`, Copy new HTML (it records whether the clipboard worked or the fallback box appeared), Download draft into `/sdcard/Download` with the ` (1)` and ` (2)` names, a plain name for an odd one, refusal of `setup.exe` and `.command`, that Shrink a photo brings the system picker to the front (read from `dumpsys activity`), a small JPEG saved through the same download link, saved work offered back after `am force-stop` and a relaunch, the navigation lock, no sideways scroll on the converter and the letter at 360 dp, and that the installed app requests no permission;
- prints PASS or FAIL with what it observed for each, exits 1 on any FAIL, and prints the app log (`Pack137Save`) when something failed.

It runs on API 34 (the gate) and API 29. The API 29 run is informational (`continue-on-error`): that system image has a Chromium 74 WebView that CI cannot update. Run it by hand with any booted x86_64 emulator: `npx tauri android build --debug --apk --target x86_64`, `npm run build`, then `scripts/android-smoke.sh <the apk>`.

What it cannot show: a real phone's picker (the test only proves the picker opens, not that a chosen photo is shrunk), the Play Protect warning, and WebView versions other than the one on the image.

A release APK needs a permanent key, which is the owner's decision and does not exist yet; `release.yml` has no Android job until it does. It would need the key and its passwords as repository secrets used only by a release job, `tauri android build --apk` (release profile), the same permission check, and the same hand-off through the Actions cache.

## Toolchain per platform

- All: Rust, the release pinned in `rust-toolchain.toml` (rustup installs it on first use, or run `rustup toolchain install` in this folder), and Node 22. CI checks that `Cargo.lock` matches `Cargo.toml` (`cargo fetch --locked`).
- Windows: Microsoft C++ Build Tools (the "Desktop development with C++" workload) and the WebView2 runtime. Windows 10 and 11 have WebView2. The NSIS installer is `installMode: currentUser`, so end users need no administrator rights. Tauri downloads NSIS itself at build time.
- Android: Java 17 or later, the Android SDK (platform 37, build tools) and NDK, `ANDROID_HOME` and `NDK_HOME`, and `rustup target add aarch64-linux-android`. The Gradle wrapper downloads Gradle 9.6.1 and the Android Gradle plugin from `services.gradle.org`, Google's Maven and Maven Central at build time; the app itself never uses the network.
- Linux (smoke test only, not a shipped build): `build-essential`, `pkg-config`, `libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `xvfb`, `webkit2gtk-driver`.

## Icons

`icons/source.svg` is a navy rounded square with "137" in gold. `scripts/make-icon.mjs` writes it from the navy and gold values in `src/config/tokens.ts`. With `--png` it also renders `icons/source.png` at 1024 pixels using the Chromium that Playwright installs. Then:

```
node scripts/make-icon.mjs --png
npx tauri icon src-tauri/icons/source.png
```

`tauri icon` also writes Android and iOS folders. They are not kept in `icons/`. The Android launcher icons were made from the same `source.png` (`npx tauri icon src-tauri/icons/source.png -o <empty folder>`) and copied into `gen/android/app/src/main/res/`, with the adaptive icon's background colour set to the navy from `src/config/tokens.ts`. There is no real pack logo file in the repository. Replace `source.svg` with one when the owner supplies it.

## Files

- `tauri.conf.json`: product name, identifier `org.pack137.newsbuilder`, window, bundle settings, version from `package.json`.
- `src/lib.rs`: the downloads, navigation and permission rules, with tests. `src/main.rs` only calls it.
- `src/android-save.js`: the Android save script (see above).
- `Cargo.toml`, `Cargo.lock`, `build.rs`: the Rust project.
- `gen/android/`: the Android project (see above).
- `icons/`: the generated icon set and its source.
- `target/` and `gen/schemas/` are build output and are not committed.
