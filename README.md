# Pack 137 News Builder

A small tool for Cranford Cub Scouts Pack 137 volunteers. It turns the HTML of a TroopTrack announcement into HTML that follows the pack's design standards, and it builds the monthly "Pack 137 Stories" letter from a fill-in template. Nothing is sent anywhere: you copy the result back into TroopTrack.

Status: version 1.0.0, the web release, is signed off. Phase 7, the Windows desktop app, is merged. Mac volunteers use the web version. Phase 8, the Android app, is in progress.

## Status and releases

- [Release checklist](docs/release-checklist.md) explains how to publish a new version, including the manual email test and the desktop app check.
- [Using the web build](docs/using-the-web-build.md) explains how volunteers unzip the zip file and use the tool. A copy of it is inside each release zip as `HOW-TO-USE.md`.
- [Installing the desktop app](docs/installing-the-desktop-app.md) walks volunteers through installing the Windows app, including the warning, and points Mac volunteers to the web version. It is attached to each release.
- [src-tauri/README.md](src-tauri/README.md) is for maintainers of the desktop wrapper.

[CHANGELOG.md](CHANGELOG.md) lists what changed in each version.

## Run it

```
npm install
npm run dev
```

## Check it

```
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run build` writes a folder of static files to `dist/` that can be placed on any web host.

## Where things are

- `docs/build-spec.md` the full brief and design standards
- `docs/decisions` short notes on the choices made during the build
- `src/config/tokens.ts` colors, font and spacing
- `src/config/pack.config.ts` pack links, emails and defaults
- `src/core` reading pasted HTML and producing output (no UI code)
- `src/ui` the screens
- `tests/fixtures` approved announcement HTML and the November 2026 letter
