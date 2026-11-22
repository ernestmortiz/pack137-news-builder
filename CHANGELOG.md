# Changelog

## Unreleased

- Announcement Converter screen (Phase 3): paste the old HTML, get a suggested layout and a filled-in form, fix anything marked "Check me", see a live preview at 250, 375 and 600px, and copy the new HTML. Previews never load images from the web.
- Smart helpers: dates with weekday and assumed year, Rescheduled for struck dates, Virtual, In person, TBD and Please RSVP tags, all-caps text turned into a note, "Contact: name", site names removed from link titles, warnings for TroopTrack /manage/ links and services mentioned with no link.
- One-tap suggestions, refreshed after every edit: "&" to "and", "On going" to "Ongoing", doubled spaces, and sentence case for headings and buttons. Pack names that keep their capitals are listed in pack.config.ts.
- Undo and Redo for every change, one typed character at a time, with Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y.
- Email links show who they send to, including hidden copies, in plain words.
- Randomized scenario tests and browser tests run in CI.
- A pasted weekday that does not match its date is flagged. Words in pasted copy are never dropped; only odd characters (invisible characters, decorative bullets) are removed, and each removal is shown.
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
