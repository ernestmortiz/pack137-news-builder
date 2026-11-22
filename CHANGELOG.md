# Changelog

## Unreleased

- Web release hardening (Phase 6): the web build works when unzipped and opened from disk with no internet; a strict page policy (no outgoing connections); spell check by the browser; faster typing in very large fields; a plain-words error notice; an accessibility pass (skip links, keyboard use, focus, live regions, 44px targets, contrast).
- Photos in the monthly letter: photos are inserted with TroopTrack's editor. The letter marks each one as a photo spot with its description and caption, and a Finish photos step takes the code back from TroopTrack and gives each photo its description and a phone-safe width.
- Shrink a photo: makes a phone-friendly copy of a photo on the device (at most 1104 px wide, about 300 KB, location and camera details removed).
- Quiet tags inside colored panels get a thin navy outline, so they still show where Outlook drops white backgrounds.
- Release workflow: pushing a version tag builds the zip and its checksum with least-privilege permissions and pinned actions. Release checklist and volunteer guide added.
- Security fixes from the final review: misleading web addresses with an @ are refused, settings changed outside the tool are flagged, and the privacy wording is exact.
- Drafts and settings (Phase 5): the monthly letter autosaves on the device and says so, offers to keep working, start next month from it or start blank, and can be downloaded and opened as a draft file. A Settings tab holds the logo, footer links, pack emails, photo form, year at a glance and program year month, kept on the device and used by both features.
- Draft files and stored values are treated as untrusted: size and total budgets, field-by-field checks, plain-word notes on anything replaced, a warning for every link that sends hidden copies, and "Keep my settings" as the default with every changed setting shown.
- The em dash lint rule now also catches em dashes in regular expressions and escapes.
- Monthly Letter Editor (Phase 4): every Pack 137 Stories section in order, optional sections that switch off, story blocks (contributor, photo, stat band, sidebar box) that can be added, removed and reordered, dated Coming up and On the horizon items, a live read time ("About a 10 minute read.", words divided by 230), preview at three widths, copy, warnings for empty required sections, and its own undo and redo.
- The November 2026 issue, rebuilt from a draft, matches the corrected reference in text, links and section order, and none of the November defects come back.
- Every email pattern, weekly and monthly, now holds up in Outlook for Windows. The monthly letter keeps the Outlook-only font block from the November issue.
- Alt text follows accessibility best practice: warnings for missing, "Photo of", file-name, caption-repeating or over-long descriptions, and alt text shown in place of a blocked image meets 4.5:1. #8A90A6 is no longer a token.
- Undo history stores only each change, with a 50 MB budget.
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
