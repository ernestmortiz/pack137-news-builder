# Maintainer guide

This guide is for the person who looks after the Pack 137 News Builder after the first build. It explains how the tool is put together, where to make common changes, how it is tested and released, and what has gone wrong before. Read `CLAUDE.md` first: it lists the rules that must never be broken. The full brief is `docs/build-spec.md`, and the choices made during the build are in `docs/decisions/`.

## What it is

- One web app, written in TypeScript with no UI framework (ADR 0001), built with Vite into a folder of static files (`dist/`).
- The same `dist/` is wrapped for Windows (an installer) and Android (an `.apk`) with Tauri 2. There is no Mac app: Mac volunteers use the web version (ADR 0006).
- It runs entirely on the device. No network calls, no tracking, no AI at runtime. Pasted HTML is untrusted and is never run.
- Two features: the Announcement Converter (weekly) and the Pack 137 Stories editor (monthly letter). A Settings tab holds pack links and emails.

## How a paste becomes an email

The converter is a pipeline of pure functions in `src/core`, tested without a browser:

1. `sanitize.ts` parses the paste inert and keeps only safe content.
2. `normalize.ts` flattens TroopTrack's nested wrappers and editor leftovers.
3. `extract.ts` builds the content model (`model.ts`): blocks, runs, links, marks.
4. `classify.ts` suggests one of five layouts.
5. `fill.ts` fills the form for that layout (`forms.ts` holds the form types). Smart helpers live in `src/core/helpers/` (dates, tags, shouting, people, title cleanup, small fixes, sentence case, long links, sentences). `switchLayout` moves content between layouts; with today's date it builds Date list rows from dates written in sentences.
6. `render.ts` and `src/templates/` turn a form into email HTML. `src/templates/components.ts` holds the shared patterns (card, buttons, pills, panels, date pills, links).
7. `lint-output.ts` checks every output: no classes, ids, scripts or style blocks, colors from the tokens only, no em dashes, images with alt, absolute links.

The monthly letter uses `letter.ts` (form) and `render-letter.ts` with `src/templates/letter/`. Drafts (`draft.ts`) and settings (`settings.ts`) are treated as untrusted input: size limits, field-by-field checks, migrations.

The UI is in `src/ui`: `converter.ts`, `letter.ts`, `settings-view.ts`, the form builders (`form-view.ts`, `form-kit.ts`, `letter-view.ts`), undo and redo (`history.ts`), saved work (`storage.ts`, `other-tab.ts`), and the sandboxed previews (`preview.ts`, `preview-frames.ts`, `preview-scale.ts`).

## Where to make common changes

| Change                                         | Where                                                                                                                                            | Then                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| A color, font or spacing                       | `src/config/tokens.ts` only. A hex value anywhere else fails lint.                                                                               | Run the tests; goldens show every change.                                         |
| Pack links, emails, default logo, program year | `src/config/pack.config.ts` (the defaults; volunteers can override them in Settings)                                                             | Unit tests for settings.                                                          |
| How an email part looks (button, pill, panel)  | Update spec 6.1 first, then `src/templates/components.ts`                                                                                        | Update golden fixtures on purpose; ask the owner; ideally an Outlook check.       |
| A new suggestion or helper                     | `src/core/helpers/`, wired in `suggestionsFor` in `fill.ts`                                                                                      | Test first in `tests/unit/`. Suggestions are offered, never applied (owner rule). |
| A new form field                               | `src/core/forms.ts`, the renderer, and `src/ui/form-view.ts`                                                                                     | Optional fields keep old forms rendering byte-identical.                          |
| A new announcement layout                      | `forms.ts` (the union), `fill.ts` (fill and `buildFrom`), `src/templates/announcement/`, `form-view.ts`, `classify.ts` if it should be suggested | Golden fixture with a real paste.                                                 |
| Desktop or Android wrapper                     | `src-tauri/` (read `src-tauri/README.md` first)                                                                                                  | Wrapper tests run on the pull request.                                            |

## Tests

```
npm run typecheck
npm run lint      # eslint and prettier, including the hex and em dash rules
npm test          # unit tests (Vitest with happy-dom)
npm run e2e       # browser tests (Playwright) against the built app
```

- **Golden fixtures** (`tests/fixtures/weekly/`): each real paste has the approved form (`form.json`), the edits a volunteer made (`edits.json`) and the approved output (`expected.html`). A change to the output must change these on purpose.
- **Monthly reference** (`tests/fixtures/monthly/`): the November 2026 letter.
- **Fuzz and hostile input** (`tests/unit/fuzz*`, `tests/fuzz/`): random and malicious pastes must give safe output.
- **Timing budgets**: a few tests check that huge pastes stay fast. They can fail when the machine is busy; re-run them alone before believing a failure.
- **Wrapper tests**: `cargo test` in `src-tauri`; `scripts/wrapper-smoke.sh` drives the real Linux app through WebDriver; `scripts/android-smoke.sh` drives the Android app on an emulator over DevTools. Both run in CI.

## Continuous integration

All workflows are in `.github/workflows/`. Actions are pinned to commit SHAs, tokens are read-only except in the one publish job, and checkouts do not keep credentials.

- **`ci.yml`** on every push and pull request: typecheck, lint, unit tests, build and browser tests.
- **`wrappers.yml`** on pull requests that touch the wrapper, the UI or the build:
  - Linux smoke test of the real app.
  - Windows installer build.
  - Android test APK build (debug-signed, a new throwaway key each run) with checks for no permissions and Android 10 minimum.
  - Android emulator test on Android 14: the release gate (22 checks). Android 10 runs for information only: that emulator image has a 2019 web view that cannot run the app.
  - Publish: the installers go into a draft pre-release called "Test build for pull request #N", visible only to people with write access. Delete these drafts after merging.
- **`release.yml`** on a version tag: see the release checklist.

Files pass between jobs through the Actions cache, not as artifacts, because the account's artifact storage quota filled up during the build.

## Releasing

Follow `docs/release-checklist.md`. In short: set the version in `package.json` and the changelog, merge to main, wait for green CI, then push a tag `vX.Y.Z` that matches `package.json`. From Git Bash on the owner's PC:

```
git fetch origin
git tag vX.Y.Z origin/main
git push origin vX.Y.Z
```

Do not create the release on GitHub's website; the workflow creates it, and stops if one already exists. If any job fails, nothing is published.

## The Android signing key

- Every Android update must be signed with the same key. If it is lost, volunteers must uninstall and reinstall, which removes their saved work.
- The key exists only in the owner's backup (password manager) and in the `android-release` environment on GitHub (Settings, Environments), as two environment secrets: `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD`.
- That environment only accepts release tags (`v*`), and only the `android-sign` job in `release.yml` uses it. That job runs nothing but the Android SDK's own `zipalign` and `apksigner`, and checks the result is signed "Pack 137 News Builder", not a debug key.
- Never commit the key, put it in repository secrets, or replace it without the owner.

## Wrappers in brief

- **No bridge to the page.** The page gets no Tauri commands, plugins or capabilities. A unit test (`tests/unit/wrapper-config.test.ts`) fails if one appears.
- **Navigation and windows.** Navigation is locked to the app's own origin, new windows are refused, and downloads are limited to `.json` and `.jpg`.
- **The Android exception.** Android's web view cannot download files, so a small script and `DownloadSaver.kt` save drafts and photos into Downloads through one message channel, open only to the app's own pages (ADR 0006).
- **Hand edits in the Android project.** `src-tauri/gen/android` was generated by `tauri android init` and then edited by hand: the manifest, `MainActivity.kt`, `DownloadSaver.kt` and `SaveRules.kt`. If you ever regenerate it, carry those edits over.

## Things that have gone wrong before

- **Artifact storage quota full**: uploads failed. Hand-offs now use the Actions cache.
- **Runner disk full**: the emulator image could not install. The emulator job now frees disk space first.
- **`ubuntu-latest` moved to a new Ubuntu**: a package name changed. The smoke test job is pinned to `ubuntu-24.04`; move it on purpose.
- **Photo picker**: once ignored a single Back press on the emulator. The test presses up to three times and logs the count.
- **Unsigned Mac app**: current macOS blocked it, so the Mac app was dropped (ADR 0006). Revisit only with a paid Apple Developer ID.
- **Year guessing**: a date without a year is read as the next time it comes round, so an old paste shows next year's weekday. That is intended (ADR 0003).

## Regular upkeep

- **Before each release**: the manual email test in the release checklist (Gmail, Apple Mail, Outlook).
- **Every few months**: update npm packages, Rust crates and the pinned action SHAs. CI warns that some pinned actions run on an old Node version; update them to newer releases by SHA.
- **Follow-up still open**: add Gradle's published checksum for the Android build's Gradle wrapper (`distributionSha256Sum`).
- **If TroopTrack changes its editor**: new paste shapes may need sanitize or normalize changes. Add the new paste as a fixture first.

## Open decisions (spec section 13)

- Where the web version is hosted (until then, the zip is the release).
- How volunteers get the installers (release page link, or a shared drive).
- Who else will use and maintain the tool.

## Working with Claude Code

The build used Claude Code with the agents in `.claude/agents/` (parser, renderer, UI, tests, packaging, docs, email review, security review). `CLAUDE.md` tells any session the rules and how work runs: one phase at a time, test first in `src/core`, small commits, and never trusting an agent's "done" without running the checks.
