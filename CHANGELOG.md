# Changelog

## Unreleased

- Renderer (Phase 2): turns a filled-in form for any of the five layouts into email-safe HTML. All five approved weekly announcements render to their approved output. The forms and the comparison rule are in [ADR 0005](docs/decisions/0005-announcement-forms-and-golden-rule.md).
- The output linter now checks only real markup, so ordinary text such as "id=5" no longer fails it. It also flags buttons under 44px and divs nested inside divs.
- When links are nested around the same text, only the outermost link is kept.
- Previews will not load remote images (owner decision).
- Buttons keep their 44px height in Outlook for Windows. Images with no alt text are kept, and the tool lists warnings for buttons with no valid link, empty sections, links that cannot be used and images with no alt text.
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
