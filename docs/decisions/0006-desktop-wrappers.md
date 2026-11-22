# 0006: Windows wrapper with Tauri 2, no bridge to the page; no Mac app

Date: 2026-11-22

Choice: the Windows `.exe` is a Tauri 2 wrapper around the same `dist/` the web build ships. There is no Mac app (see the owner decision below). The page gets no Tauri API at all: no JavaScript package, no plugins, no commands and no capabilities. Everything the app does, it does with the same web features it uses in a browser.

Reason:

- One codebase (spec 3). With no wrapper-only JavaScript, no feature can exist in one build and not the others, and the web tests cover the wrapper's behaviour.
- Smallest attack surface (spec 11.5). Pasted HTML is untrusted. If the page can call nothing in the wrapper, a mistake in the parse cannot reach files or the system. The spec allowed clipboard and file dialog capabilities; the web features cover both, so neither is granted.

How each need is met:

| Need                         | Web build                                                       | Wrapper                                                                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy HTML                    | `navigator.clipboard`, with the select-and-copy box as fallback | The same                                                                                                                                                                                                                                           |
| Open draft, Shrink a photo   | File picker (`<input type=file>`)                               | The same; the system webview shows the native picker                                                                                                                                                                                               |
| Download draft, shrunk photo | Browser download                                                | A download handler in the wrapper's Rust code saves into the Downloads folder, adding " (1)" when the name is taken, as browsers do (ADR 0004, wrapper point 2). Only drafts (`.json`) and photos (`.jpg`) are saved; other file types are refused |
| Saved work                   | Browser storage                                                 | The webview's storage, inside the app, separate from any browser                                                                                                                                                                                   |
| Content Security Policy      | BUILD_CSP meta tag                                              | The same meta tag. Tauri's own CSP setting is left empty so Tauri does not add sources to it (ADR 0004, wrapper point 1)                                                                                                                           |

Further locks in the wrapper:

- Navigation is limited to the app's own pages and the preview frames. A link or script cannot take the window to a web site.
- Navigation allows only the one origin Tauri serves on each platform.
- New windows and permission requests are refused. Developer tools are off in release builds. No updater: the app never uses the internet.
- The Windows installer downloads Microsoft WebView2 only on a PC that lacks it, which Windows 10 and 11 rarely do. That is the only network use, at install time. Shipping WebView2 inside the installer would add about 130 MB for every volunteer.
- Test installers are built only from branches in this repository, never from forks. They are published as a draft pre-release for the owner (owner decision, 2026-11-22), because the account's artifact storage quota was full. Build jobs hand files to the one job that can write through the Actions cache, which is outside that quota; the release workflow does the same.

Packaging:

- **Windows:** an NSIS installer that installs for the current user, so no administrator password is needed.
- **Build and checks:** the installer is built by CI on its Windows machine. The tag's version must match `package.json`, which is also the version the wrapper shows.

Android: decided at the start of Phase 8. Tauri stays the first choice because the same no-bridge approach should carry over; Capacitor is the fallback the spec names.

Revisit: if the owner wants a save dialog instead of saving into Downloads, the wrapper would need the dialog plugin on the Rust side only, still with nothing exposed to the page.

## Owner decision, 2026-11-22: no Mac app

A universal, ad-hoc signed `.dmg` was built and tested on the owner's Mac (Apple M5, macOS 26.6.2). The app's signature checked as valid, but macOS refused to run it: the kernel log showed `AppleSystemPolicy: Security policy would not allow process`, and the app sat paused before its first instruction, bouncing in the Dock. That held after "Open Anyway" in Privacy & Security and after removing the quarantine mark. No security software was installed. The same app from the same `.dmg` started normally on a GitHub macOS runner, where it was not marked as downloaded.

Current macOS will only run an app downloaded from the internet if Apple has notarized it, which needs an Apple Developer ID ($99 a year). The workarounds (Terminal commands, turning off Gatekeeper) are too technical or unsafe for volunteers.

Decision: drop the Mac app. Mac volunteers use the web build in Safari, which works offline with every feature. The `.dmg` is removed from both workflows, the app config and the guides.

Revisit if the pack funds an Apple Developer ID; signing and notarizing would then live only in CI secrets. Or, once the web build is hosted, Safari's File, Add to Dock gives Mac volunteers an app-like window with no signing (Phase 9).
