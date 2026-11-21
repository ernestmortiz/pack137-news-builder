# Changelog

## Unreleased

- Parse pipeline (Phase 1 core): reads pasted TroopTrack HTML safely, cleans it, turns it into structured content, and suggests one of the five layouts.
- Date helper for dates such as "Dec 6" and "Feb 27-28". The year rule is in [ADR 0003](docs/decisions/0003-date-year-rule.md).
- Original TroopTrack HTML for the five weekly announcements added as test fixtures.
- Tests for hostile pastes, very large pastes and deeply nested HTML.
- CI no longer fails when the account's artifact storage is full.

## 0.1.0 (2026-11-21)

- Project foundation: TypeScript, Vite, Vitest, ESLint, Prettier and CI.
- Design tokens and pack defaults.
- Output linter with tests against the five approved announcements and the November 2026 letter.
- Empty app shell with the two screens.
- Agent definitions for the build.
