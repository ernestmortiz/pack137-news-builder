# Pack 137 News Builder

The full brief is `docs/build-spec.md`. Read it before writing code. This file repeats what must never be broken.

## Non-negotiables

- Output HTML: table layout, inline styles only, no classes, ids, scripts or style blocks. Only the section 6.1 patterns.
- Colors come from `src/config/tokens.ts`. A hex value anywhere else fails lint.
- No em dashes in copy, output HTML or docs.
- No runtime AI calls, no network calls, no tracking. Pasted HTML is untrusted and is parsed inert.
- Every emitted string must pass `lintOutput` in `src/core/lint-output.ts`.
- One codebase for web, Windows, macOS and Android. No feature in one build only.
- Never commit signing keys, certificates or tokens.

## How work runs

- The main session (Fable) orchestrates and delegates to the agents in `.claude/agents/` per spec section 10. It writes the extract, classify and date-helper code itself.
- One phase at a time (spec section 12). Stop for the owner's review after each.
- Test first in `src/core`. Small commits, conventional commit messages.
- Do not accept an agent's "done" without running the checks yourself.

## Commands

- `npm run dev` start the app locally
- `npm run typecheck`, `npm run lint`, `npm test`
- `npm run build` writes the static web build to `dist/`

## Status

Phases 0 to 3 are complete and merged. Phase 4 (monthly letter editor) is built and awaiting the owner's review. Next: Phase 5, drafts and settings.
