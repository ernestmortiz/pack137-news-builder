# Changelog

## Unreleased

## 1.2.0 (2026-11-23)

Edit like a text editor (owner request, plan in `docs/plans/rich-editing.md`):

- Every text box with formatting shows bold, italic, struck text and links as they will look, with Bold, Italic, Strike, Link and Remove link buttons and Ctrl or Cmd + B, I and K. No more typing `**codes**`. Pasting into a box keeps only those marks and safe links.
- A "Show codes" switch brings back the typed codes for anyone who prefers them. The choice is remembered on the device.
- "Edit on the card": after pasting, and when a monthly letter opens, the tool shows the announcement or letter drawn as the email. Click any words to change them. Dates, link addresses, colors and adding or moving rows stay in the form, one click away with "Change in the form". The card and form views edit the same thing, and the choice is remembered for both screens.
- "Things to check" above the card lists the check-me notes and suggestions, each with a button that goes to it.
- The "Add a short label" and "Add a title" notes go away once those fields have text.
- Switching Call to action to Date list no longer repeats the button words at the end of the event.
- The release workflow now passes its secrets to the Cloudflare deploy, so each release updates the website by itself.

The email output is unchanged.

## 1.1.1 (2026-11-23)

Fixes from the owner's Den 15 announcement, as saved in TroopTrack:

- The gold card label and the Date list date pill stay small in TroopTrack. Its editor added `width: 100%` to every table with a style attribute, which stretched the label across the card in the saved message and the email. Those tables now carry no style attribute, like the button, and the output check rejects one that does.
- Date list rows find a date anywhere in the line, so "Den Meeting - Dec 16th 6:15pm - Fun On The Run" shows a WED DEC 16 pill above "Den Meeting - 6:15pm - Fun On The Run".
- Call to action no longer links the same page twice: when the button carries the paragraph's only link, the words stay in the paragraph without the link.
- A lone "1." in front of a single item is dropped.
- The "Add a short label" and "Add a title" notes disappear once those fields have text.
- The hosted web version is on Cloudflare Pages, with extra security headers, and each release now deploys there.

## 1.1.0 (2026-11-22)

The first published release. It includes the 1.0.0 web release below, which was signed off but not published on its own.

- Android app (Phase 8): an Android installer (`.apk`) for Android 10 and later, signed with the pack's release key. It wraps the same web build, asks for no permissions, never uses the internet and saves drafts and shrunk photos into Downloads. It was tested on an Android 14 emulator in CI (paste, copy, saving, the photo picker, saved work after a restart, the narrow screen); there was no real-phone test (owner decision). The install guide covers "Install unknown apps".
- Style choices: any button can be Navy (the default) or Gold, and a Message or Call to action paragraph can sit in a pale-yellow box.
- Date list dates show as a navy date pill above the event, such as SUN FEB 1.
- Converter fixes from the owner's first hands-on test (Scout Sunday announcement):
  - Long web addresses no longer stretch the email on phones. Any long unbroken text now wraps inside the card, in every layout and the monthly letter.
  - A link whose text is a long address gets a one-tap suggestion to show the site's name instead, such as signupgenius.com.
  - The sentence-case suggestion only appears for true Title Case, so a title that is already sentence case with names is left alone.
  - The desktop preview shrinks to fit a narrow column instead of looking cut off.
  - Switching to Date list reads dates written inside sentences. Each date becomes a row sorted by date, dateless paragraphs go under the event they follow, and the title's date is flagged rather than changed.
- Windows desktop app (Phase 7): a Windows installer, built by the release workflow on a Windows machine. It wraps the same web build in a window. The page inside can reach nothing on the computer, cannot leave the app's own pages, and never uses the internet. Download draft and Shrink a photo save into the Downloads folder. Unsigned; an install guide walks volunteers past the Windows warning.
- No Mac app: current macOS will not run an app that Apple has not notarized, which needs a paid Apple Developer ID. Mac volunteers use the web version in Safari, which works offline with every feature.
- A test installer is built on every pull request that changes the desktop app and published as a draft pre-release for the owner, and a smoke test checks the real app on Linux. Release files pass between jobs through the Actions cache, so a full artifact storage quota cannot block a release.

## 1.0.0 (2026-11-22, signed off; published as part of 1.1.0)

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
