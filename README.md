# Pack 137 News Builder

A small tool for Cranford Cub Scouts Pack 137 volunteers. It turns the HTML of a TroopTrack announcement into HTML that follows the pack's design standards, and it builds the monthly "Pack 137 Stories" letter from a fill-in template. Nothing is sent anywhere: you copy the result back into TroopTrack.

Status: foundation only. The converter and the letter editor are not built yet.

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
- `src/config/tokens.ts` colors, font and spacing
- `src/config/pack.config.ts` pack links, emails and defaults
- `src/core` reading pasted HTML and producing output (no UI code)
- `src/ui` the screens
- `tests/fixtures` approved announcement HTML and the November 2026 letter
