# 0006: Desktop wrappers with Tauri 2, no bridge to the page

Date: 2026-11-22

Choice: the Windows `.exe` and macOS `.dmg` are Tauri 2 wrappers around the same `dist/` the web build ships. The page gets no Tauri API at all: no JavaScript package, no plugins, no commands and no capabilities. Everything the app does, it does with the same web features it uses in a browser.

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
- **macOS:** a universal `.dmg` for Intel and Apple silicon, ad-hoc signed. Apple silicon refuses unsigned apps outright, so the ad-hoc signature lets volunteers approve the app once in System Settings. There are no certificates (spec 3: unsigned installers).
- **Requirements:** macOS 11.3 or later, because that is the first version whose webview supports downloads.
- **Build and checks:** both installers are built by CI on its Windows and macOS machines. The tag's version must match `package.json`, which is also the version the wrapper shows.

Android: decided at the start of Phase 8. Tauri stays the first choice because the same no-bridge approach should carry over; Capacitor is the fallback the spec names.

Revisit: if the owner wants a save dialog instead of saving into Downloads, the wrapper would need the dialog plugin on the Rust side only, still with nothing exposed to the page.
