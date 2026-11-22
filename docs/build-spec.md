# Pack 137 News Builder: Build Spec

Last updated: 2026-11-21
Status: spec only. Nothing is built.

This file is the starting brief for building the Pack 137 News Builder in Claude Code. It records decisions made during planning. Items marked ASSUMPTION or OPEN are not confirmed. Read the whole file before writing code.

Related:
- Design system "Pack 137 News": https://claude.ai/artifact/TaYJ9fYTp4up3cmAez7bvL
- Press list: `claude/pack137-in-the-news.md` (this project)
- Pack app spec (separate product, not part of this build): `claude/pack137-app-build-spec.md`

## 1. Goal

A small tool that lets a volunteer with no HTML knowledge produce on-brand HTML for TroopTrack. Two jobs:

1. **Announcement Converter (weekly).** Paste the existing HTML from a TroopTrack announcement, get back clean HTML that follows the Pack 137 News design standards, copy it back into TroopTrack.
2. **Monthly Letter Editor (long form).** Open the set template for the monthly email, "Pack 137 Stories", edit it through form fields, copy the finished HTML into TroopTrack.

The tool must be cheap to run (target $0 a year), work offline, and be simple enough to hand to another volunteer.

## 2. Non-goals

- Sending email. TroopTrack sends. This tool only produces HTML.
- Logging in to TroopTrack or calling its API. Copy and paste only.
- A free-form HTML or drag-and-drop editor. Users fill in fields; the tool owns the markup.
- AI calls at runtime. See section 5.
- Accounts, a server, a database, analytics or tracking of any kind.
- iOS build. Not requested.

## 3. Deliverables: four builds from one codebase

| Build | Artifact | Who it is for |
|---|---|---|
| Web | Static files (`dist/`) for the pack's hosted site | Default. Everyone should use this unless they need offline. |
| Windows | `.exe` installer | Volunteers on a PC who want an installed app |
| macOS | `.dmg` | Volunteers on a Mac |
| Android | `.apk` | Volunteers on an Android phone or tablet. Geared to the weekly Announcement Converter. |

Decisions (2026-11-21):
- Installers ship unsigned. No paid certificates. Install notes must walk the user past the Windows SmartScreen prompt, the macOS Gatekeeper approval and the Android "install unknown apps" setting.
- The Android build is primarily for the Converter, so the Converter must be fully usable at 360px wide. The Monthly Letter Editor must open and work on Android but is not tuned for phones.
- Web deployment target is undecided. The web build must be a plain folder of static files with relative paths so it can be dropped on any host or subfolder.

Rules:
- One web codebase. The three installable builds are thin wrappers around the same web app. No feature may exist in one build and not the others.
- The web build is the source of truth and ships first. Wrappers come after the web app is accepted (see section 12).
- Every build shows the same version number in its footer, taken from one place (`package.json`).

## 4. Proposed stack

Verify current versions and docs before starting. These are proposals, not tested choices.

- Language and build: TypeScript, Vite. No UI framework required; a small one (Preact or Svelte) is acceptable if the orchestrator judges the editor forms need it. Decide once in Phase 0 and record it.
- Runtime dependencies: as close to zero as possible. Inter is bundled locally, not loaded from a font CDN, so the app works offline.
- Tests: Vitest with a DOM implementation (jsdom or happy-dom). Playwright for end-to-end and screenshot checks.
- Wrappers: Tauri 2 for Windows, macOS and Android. It wraps a web front end in the operating system's own webview and has build targets for all three. Fallback if Tauri's Android path proves troublesome: Capacitor for Android, Tauri kept for desktop. Decide in Phase 6 with a one-day spike, not earlier.
- CI: GitHub Actions. Lint, typecheck, test and web build on every push. Release workflow builds the four artifacts on tags, using a Windows runner for the `.exe`, a macOS runner for the `.dmg`, and a Linux runner for the `.apk` and web bundle.
- Repo and hosting accounts must be owned by a shared pack account, not a personal one.

Platform facts to plan around (verify at build time):
- The `.dmg` can only be built on macOS. Use the CI macOS runner so no volunteer needs a Mac to release.
- Tauri desktop builds need Rust plus the platform toolchain (Microsoft C++ Build Tools and WebView2 on Windows, Xcode Command Line Tools on macOS). Android needs the Android SDK, NDK and Java.
- Unsigned installers work but warn the user. Windows shows a SmartScreen prompt; macOS Gatekeeper blocks first launch until the user approves it in settings; Android requires allowing installs from the browser or file manager. See section 13 for the signing decision.

## 5. Key design decision: deterministic, no AI at runtime

The converter is rule-based. It parses the pasted HTML, pulls the content into a structured form, lets the user correct it, and renders that form through fixed templates.

Why:
- No API key, no cost, no account to hand over.
- Same input always gives the same output, so it can be tested with golden files.
- Works offline in all four builds.

Consequence: the tool cannot rewrite copy the way a person would. It restyles and restructures. It may suggest fixes (section 7.4) but the user decides wording. Copy edits happen in the form fields.

## 6. Design standards (the output contract)

Every piece of HTML the tool emits must follow these. They are the acceptance criteria for the renderer.

Tokens:
- navy `#151B4D`: headings, buttons, pills, link text
- navy-masthead `#0D1431`: monthly letter masthead only
- gold `#F7A823`: accent, only on navy or with navy text
- gold-light `#F9B93E`: small text on navy
- gold-pale `#FFE9B8`: highlight panel
- lavender `#E3E6F5`: quiet panel, hairline borders, secondary button
- grey-page `#EEF1F6`: page background (monthly letter outer wrapper only)
- ink `#1B1F2E`: body text
- muted `#5B6275`: read-time line, photo captions, small notes (monthly letter)
- white `#FFFFFF` and lavender `#E3E6F5` are the only text colors on navy besides the golds
- Font stack: `Inter,Arial,Helvetica,sans-serif`
- Radius: 12px panels, 8px buttons and pills
- No icons, no emoji

Formats:
- Dates: `Sat Nov 21`. Ranges: `Sat Feb 27 to Sun Feb 28`.
- Times: `9:15 am to 12:15 pm`.
- No em dashes anywhere in output or in the app's own copy.
- Sentence case for headings and buttons. No all-caps shouting; emphasis is carried by pills.

Email-safe HTML rules (TroopTrack and mail clients strip a lot):
- Table-based layout with `role="presentation"`, `cellpadding="0" cellspacing="0" border="0"`.
- All styles inline. No `<style>` block, no classes, no ids, no `<script>`, no external CSS.
- Outer table `width="100%"` with `max-width:600px;margin:0 auto`.
- Buttons are a table cell with background color holding a padded `<a>`; minimum 44px tall. The cell also carries `mso-padding-alt` with the same padding, because Outlook for Windows ignores padding on the link (approved 2026-11-21).
- Links: navy, bold, underlined, `target="_blank" rel="noopener noreferrer"` (not on `mailto:`).
- Images: explicit `width`, `height:auto`, `display:block`, `border:0`, and an `alt` attribute. Alt text should describe the image; an image the user leaves without alt text is kept with `alt=""` and the tool warns about it (owner decision, 2026-11-21).
- Alt text follows accessibility best practice (owner, 2026-11-22). When images are blocked it shows as text, so the text around an image meets 4.5:1. The tool warns, without blocking, when alt text is missing, starts with "Image of", "Photo of" or similar, looks like a file name, repeats the caption, or runs over 125 characters, and it reminds the writer to describe what the photo shows and never to name a child.
- Text contrast at least 4.5:1. Only the token pairings above are allowed, which guarantees it.
- No wrapper `<div>` nesting, no `id="isPasted"`, no `data-*` attributes, no editor classes in output.
- Every image carries `max-width:100%;height:auto` so a 552px photo cannot overflow a phone screen.
- Every `href` is absolute and starts with `https://`, `http://` or `mailto:`. A bare `meet.google.com/...` is an error, not a link.
- Monthly letter only: four extras are allowed because the approved template uses them. (1) A hidden preview-text `div` as the first element. (2) Outlook conditional comments (`<!--[if mso]>`) around a fixed-width wrapper table. (3) A VML `v:roundrect` fallback for the full-width button. (4) A fixed font `<style>` block inside an Outlook conditional comment, which makes Outlook use Arial instead of falling back to Times New Roman (approved 2026-11-22). Nothing else from the `<style>` or class family.
- Outlook matters for all output (owner, 2026-11-22): every pattern must hold up in Outlook for Windows as well as in Gmail and Apple Mail. Known Outlook limits (no border-radius, no padding on inline elements, no max-width) are handled with table cells and `mso-` properties where the inline-style rules allow.

Tone (shown as guidance in the UI, not enforced):
- Lead with gratitude and inclusiveness.
- Refer to the meeting place as First Presbyterian Church of Cranford, NJ (11 Springfield Ave), not "Bates Hall".

### 6.1 Canonical components

These patterns were approved on 2026-11-20 and revised on 2026-11-21 for narrow screens. The approved outputs are in the project doc `claude/pack137-weekly-announcements-html.md`; use them as the expected side of the golden fixtures. The renderer must reproduce them byte for byte apart from content.

Revised on 2026-11-22 so every pattern holds up in Outlook for Windows (owner decision; see the Outlook rule in section 6). Every cell that holds text carries the font stack; cells inside nested tables also carry the body color, size and line height; spacing is set with margins on `<p>`, never padding on a `<div>`; colored cells carry `bgcolor` as well as `background-color`.

Card shell (every announcement). Spaces in the label are written as `&nbsp;` so it cannot break.

```html
<table role="presentation" width="100%" align="center" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="max-width:600px;margin:0 auto;border-collapse:separate;background-color:#FFFFFF;border:1px solid #E3E6F5;border-radius:12px;font-family:Inter,Arial,Helvetica,sans-serif;">
  <tr>
    <td bgcolor="#151B4D" style="background-color:#151B4D;border-radius:12px 12px 0 0;padding:14px;font-family:Inter,Arial,Helvetica,sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="#F7A823" style="background-color:#F7A823;color:#151B4D;font-family:Inter,Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;padding:4px 10px;border-radius:8px;">{{label}}</td></tr></table>
      <p style="margin:8px 0 0 0;color:#FFFFFF;font-size:20px;font-weight:700;line-height:1.3;">{{title}}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:14px;font-family:Inter,Arial,Helvetica,sans-serif;color:#1B1F2E;font-size:15px;line-height:1.5;">{{body}}</td>
  </tr>
</table>
```

The card keeps a fluid width up to 600px. A fixed `width="600"` for Outlook waits for a real test send through TroopTrack, because TroopTrack's own wrapper decides the width there.

Primary button (secondary button swaps to `#E3E6F5` in both `bgcolor` and `background-color`, and text `#151B4D`):

```html
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#151B4D" style="background-color:#151B4D;border-radius:8px;mso-padding-alt:13px 22px;">
      <a href="{{url}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 22px;font-family:Inter,Arial,Helvetica,sans-serif;color:#FFFFFF;font-size:16px;font-weight:700;line-height:18px;text-decoration:none;border-radius:8px;">{{text}}</a>
    </td>
  </tr>
</table>
```

Date row. Single column, date stacked above the event, so it holds up at 250px wide. First row has no top border; later rows add `border-top:1px solid #E3E6F5` after the padding, or `#FFFFFF` inside a colored panel. A struck-through date wraps the date text in `<s>`. The two-column date row (96px date cell) is retired and must not be emitted.

```html
<tr>
  <td style="padding:10px 0;font-family:Inter,Arial,Helvetica,sans-serif;color:#1B1F2E;font-size:15px;line-height:1.5;">
    <p style="margin:0 0 2px 0;font-size:13px;font-weight:700;color:#151B4D;">{{date}}</p>
    <div><a href="{{url}}" target="_blank" rel="noopener noreferrer" style="color:#151B4D;font-weight:700;text-decoration:underline;font-size:16px;">{{event}}</a> {{tags}}</div>
    <p style="margin:4px 0 0 0;font-size:14px;color:#1B1F2E;">{{note}}</p>
  </td>
</tr>
```

Link row (Link list layout, Ongoing and References sections): same cell, with the link on the first line and the source or contact note under it as `<p style="margin:2px 0 0 0;font-size:13px;color:#1B1F2E;">`. Any image in a Link list sits above the text at 80px wide, never in a side column.

Tags (small pills after an event name). Spaces in tag text are written as `&nbsp;`. Outlook for Windows drops their padding and corners and shows them as shaded text; that is accepted.

```html
<!-- quiet: Virtual, In person, TBD. Background #E3E6F5 on white, #FFFFFF inside a colored panel -->
<span style="display:inline-block;white-space:nowrap;background-color:#E3E6F5;color:#151B4D;font-size:11px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:8px;">{{tag}}</span>
<!-- strong: Please RSVP, Rescheduled, Highest need -->
<span style="display:inline-block;white-space:nowrap;background-color:#151B4D;color:#F9B93E;font-size:11px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:8px;">{{tag}}</span>
```

Panels: highlight panel is a table cell `<td bgcolor="#FFE9B8" style="background-color:#FFE9B8;border-radius:12px;padding:14px;font-family:Inter,Arial,Helvetica,sans-serif;color:#1B1F2E;font-size:15px;line-height:1.5;">`. Quiet panel is the same with `#E3E6F5` in both places.

Panel name. A highlight panel's name is a one-cell table like the card label, with `bgcolor` and `background-color` `#151B4D` and color `#F9B93E`. A quiet panel's name is `<p style="margin:0;color:#151B4D;font-size:17px;font-weight:700;">`, followed by an optional subtitle `<p style="margin:2px 0 0 0;font-size:13px;color:#1B1F2E;">`.

Section heading inside a card: `<p style="margin:20px 0 4px 0;color:#151B4D;font-size:17px;font-weight:700;">`.

Spacer, before a panel that follows other content:

```html
<div style="height:20px;line-height:20px;font-size:1px;mso-line-height-rule:exactly;">&nbsp;</div>
```

Help wanted ask title, inside the highlight panel: `<p style="margin:10px 0 6px 0;color:#151B4D;font-size:18px;font-weight:700;line-height:1.3;">`.

Paragraphs are `<p>` with an explicit margin and nothing else, except ink color inside a panel:
- Help wanted intro `margin:0 0 14px 0`; ask paragraphs `margin:0 0 10px 0`, the last `margin:0 0 14px 0`; outro `margin:18px 0 12px 0`.
- Call to action and Message: `margin:0 0 14px 0` between paragraphs, `margin:0 0 16px 0` before a button, `margin:0` for a last paragraph with no button.
- Link list intro `margin:0 0 6px 0`.

Link list image, above the text, in its own cell so the gap holds in Outlook:

```html
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 12px 0;"><img src="{{src}}" width="80" alt="{{alt}}" style="display:block;width:80px;max-width:100%;height:auto;border:0;"></td></tr></table>
```

Link inside a paragraph: `color:#151B4D;font-weight:700;text-decoration:underline;`, with `target="_blank" rel="noopener noreferrer"` except on `mailto:`.

Monthly letter, Outlook rules (2026-11-22): bullet lists indent with a margin on the `ul` (`margin:10px 0 0 22px;padding:0`) and each `li` except the last carries only `margin-bottom`; masthead, sidebar and feedback text use `<p>` margins; the white card table carries `bgcolor`; contributor and Coming up badges are one-cell tables, as in the November issue.

## 7. Feature 1: Announcement Converter

### 7.1 User flow

1. In TroopTrack, open the announcement, press the `<>` code view button, select all, copy.
2. In the tool, paste into the "Paste the old HTML here" box.
3. The tool picks a layout and fills in an editable form. A live preview shows the result.
4. The user fixes anything the tool flagged, edits wording if wanted.
5. Press "Copy new HTML". Go back to TroopTrack code view, replace everything, save.

The screen must carry these five steps as a short numbered guide, with a picture of the `<>` button.

### 7.2 Layouts

Five layouts, all using the card shell. The user can switch layout at any time without losing content.

| Layout | Use | Form fields |
|---|---|---|
| Message | A short note | label, title, paragraphs, optional button |
| Call to action | One ask with one link | label, title, paragraph, button text and link |
| Link list | Several links to read | label, title, intro, optional image, items (link text, link, source note) |
| Date list | Events by date | label, title, sections (name, style: plain, highlight or quiet), rows (date, event, link, tags, note) |
| Help wanted | Volunteer asks | label, title, intro, highlighted ask (title, text, button), secondary button |

### 7.3 Pipeline

`pasted string -> sanitize -> normalize -> extract (content model) -> classify (suggest layout) -> form -> render -> output string`

- **Sanitize.** Parse with `DOMParser` into an inert document. Never insert pasted HTML into the live page. Drop `script`, `style`, `iframe`, `object`, `form`, event-handler attributes and every attribute except `href`, `src`, `alt`, `width`, `height`. Allow only `https:`, `http:` and `mailto:` URLs. Upgrade nothing silently; flag `http:` links.
- **Normalize.** Unwrap nested wrapper `div`s and `span`s. Collapse `&nbsp;` runs and whitespace. Treat `b` as `strong`, `i` as `em`, keep `s` (strikethrough carries meaning). Remove empty nodes.
- **Extract.** Produce a typed content model: blocks of heading, paragraph, list (items with inline runs: text, link, strong, strike), image, rule. Headings are detected from heading tags and from a paragraph that is entirely bold or has no terminal punctuation and precedes a list.
- **Classify.** Suggest a layout: list items that mostly start with a date give Date list; a list of mostly links gives Link list; a single link with a short paragraph gives Call to action; words like "help", "volunteer", "need" with a `mailto:` link give Help wanted; otherwise Message. The suggestion is a default the user can override.
- **Render.** Pure function from content model plus layout to an HTML string, using only the section 6.1 components. Escape all text. Encode `mailto:` subjects properly.

### 7.4 Smart helpers

Each helper fills a form field and marks it "check me" when unsure. None blocks the user.

- **Dates.** Recognize `Dec 6`, `March 6`, `Feb 27-28`, `12/6`. Add the weekday. Year rule: the next occurrence on or after today, within the program year; show the assumed year beside the field so the user can change it. A struck-through date becomes a struck date plus a "Rescheduled" tag and a prompt for the new date.
- **Tags.** Trailing words `Virtual`, `In person`, `(In Person)`, `(Virtual)`, `TBD` become quiet tags. `RSVP`, `Please RSVP!` become a strong tag.
- **Shouting.** All-caps runs and repeated `!!` are converted to sentence case and offered as a note line under the row. Colored text (red, green) loses its color.
- **People.** Text after ` - ` at the end of a link row becomes "Contact: name".
- **Title cleanup.** Strip a trailing ` | Site Name` from link text.
- **Small fixes offered, not applied.** `&` to "and", "On going" to "Ongoing", doubled spaces. Shown as one-tap suggestions.
- **Warnings.** Link with no destination. Image with no alt text. Link to a TroopTrack `/manage/` page (parents may not be able to open it). A mention of a service such as SignUpGenius with no link.

### 7.5 Output panel

- Live preview at three widths: nested in TroopTrack on a small phone (250px), phone (375px) and desktop (600px), rendered in a sandboxed `iframe` via `srcdoc`.
- "Copy new HTML" button with a visible "Copied" confirmation. Use the async clipboard API with a fallback to a selected read-only textarea.
- A collapsed "Show the code" area for the curious.
- "Start over" clears the form after a confirm step.

## 8. Feature 2: Monthly Letter Editor

### 8.1 User flow

1. Open "Monthly letter". The set template loads, either blank or as a copy of the last saved issue.
2. Fill in each section's fields. Reorder or switch optional sections off.
3. Watch the live preview and the read-time counter.
4. Press "Copy letter HTML" and paste into TroopTrack's code view.

### 8.2 Template sections

Source of truth: `pack137-stories-november.html`, the November 2026 issue supplied by the project owner on 2026-11-21. Store it in `/tests/fixtures/monthly/` as the reference issue. The list below was read from that file.

Outer structure: grey-page background table, then a white 600px card with 12px corners (as in the November issue and section 6) and 24px side padding. Sections stack inside the card in this order.

| # | Section | Required | Fields |
|---|---|---|---|
| 1 | Preview text | Yes | none; generated from the summary line (hidden text mail apps show beside the subject) |
| 2 | Masthead | Yes | month and year. Fixed: round logo, "CRANFORD CUB SCOUTS", "Pack 137 Stories". Background navy-masthead, 12px corners. |
| 3 | Summary line | Yes | one sentence written by the user; the tool appends the read time. Muted, 14px. |
| 4 | Intro | Yes | greeting line (default "Hi Pack 137 families,"), one paragraph |
| 5 | Feature story | Yes | story title, then one or more story blocks (see below) |
| 6 | Closing and high fives | Optional | lavender panel: paragraphs, thank-you list (bold names), closing line, signer name and role |
| 7 | Photo and story ask | Optional | one italic sentence and a link (default: the photo form from settings) |
| 8 | Around the pack | Optional | intro line, items (bold lead, text, optional link) |
| 9 | Coming up | Yes | gold-pale panel: "COMING UP" badge, intro line, dated items (date, time, text, link text, link), "How to help" line, full-width button (text, link) |
| 10 | On the horizon | Optional | dated items without links, plus a "year at a glance" link from settings |
| 11 | Feedback | Yes | grey-page panel: question, "Reply with feedback" mailto link (prefilled subject and body), small note. No poll. |
| 12 | Sign-off | Yes | one bold line (default "Ernest, for the Pack 137 committee"; editable) |
| 13 | Footer | Yes | navy panel with standing links and contact email, all from settings |

Story blocks (section 5). The user adds, removes and reorders these. Each block is one of:
- **Contributor**: badge with name and optional role ("JUSTIN DALY · PROGRAM DIRECTOR"), paragraphs, optional bullet list with bold leads.
- **Photo**: image URL, alt text, italic caption in muted.
- **Stat band**: navy panel with two stats, each a large gold number and a lavender line of text.
- **Sidebar box**: gold-pale panel with title, optional source line, body text, optional photo and caption (the November issue uses it for a recipe).

Rules:
- Read time is total words divided by 230, rounded up, minimum one minute, phrased "About an 8 minute read." It is appended to the summary line and the preview text on every issue.
- Section headings "Closing and high fives", "Around the pack", "Coming up" and "On the horizon" are fixed text. The feature story title is free text.
- Dates in sections 9 and 10 use the date helper and the "Sun Dec 6, 8:00 pm" format.
- Photos: the tool takes an image URL, not an upload, because TroopTrack hosts the image. Workflow shown on screen: upload the photo in TroopTrack, copy its address, paste it here. Alt text is required and must not name a child.
- TroopTrack file attachments (the PDF link under the November issue) are added in TroopTrack after pasting. The tool does not manage them.
- No calendar-subscribe link in the template.

Defects in the November file that the renderer must not reproduce (use them as regression tests):
- The card table carries `width: 44%` and `margin-right: calc(29%)`, added by the TroopTrack editor. It must be `width:100%;max-width:600px` and centered.
- One link has `href="meet.google.com/vgn-rwmf-fmz"` with no `https://`.
- All seven photos lack alt text and have fixed pixel widths with no `max-width`.
- Leftover `class` attributes, one `id="isPasted"`, and a broken Outlook `<noscript>` block at the top.
- Badges use 4px corners where the standard is 8px. The tool emits 8px.

Round trip: the Monthly Letter Editor is a fill-in editor, not a converter. It does not need to import an old issue's HTML. Last month's content comes back through the draft file (8.3).

### 8.3 Drafts

- Autosave the working draft to local storage on the device, wrapped in try/catch. Show "Saved on this device" so nobody assumes it syncs.
- "Download draft" and "Open draft" buttons write and read a small `.json` file. This is how a draft moves between people or devices, and how last month's issue becomes this month's starting point.
- Draft files carry a schema version. Opening an older version migrates it.

## 9. Settings

One settings screen, also stored on the device and included in draft files:
- Logo image URL
- Standing links (URLs and their labels)
- Pack email addresses
- Photo form link and "year at a glance" link
- Program year start month (for the date helper)

Ship with Pack 137 defaults in a single `pack.config.ts` file so a future maintainer changes one file. Defaults, taken from the November 2026 issue:

| Setting | Default |
|---|---|
| Logo | `https://styles.trooptrack.com/photos/23117/3312024a98ad8130285e/medium/pack137_logo_800.jpg` |
| Pack 137 info sheet | `https://docs.google.com/document/d/1-t58ZlGo9PzBDtMEPrjpGDSRFtORMt44XOcnwANFIiw/preview?usp=sharing` |
| Pack website | `https://www.cubpack137.com/` |
| TroopTrack | `https://pack137.trooptrack.com/` |
| Facebook | `https://www.facebook.com/share/g/NXZXCue4PAeuLVCU/` |
| Contact email | `cranfordpack137@gmail.com` |
| Volunteer email | `cranfordpack137+volunteer@gmail.com` |
| Feedback email | `cranfordpack137+newsletter@gmail.com` |
| Photo form | `https://forms.gle/PvVux1W4764mSD6T7` |
| Year at a glance | `https://drive.google.com/file/d/1XXB-F04hhsTvwPULWlwCmHsARWtldEnU/view?usp=drive_link` |

## 10. Agents and models

Fable is the orchestrator and writes the hardest code. Sub-agents are defined as Markdown files with YAML frontmatter in `.claude/agents/`, each with `name`, `description`, `tools` and `model`. Sub-agents cannot start other sub-agents, so all delegation comes from the orchestrator. Verify the frontmatter fields against the current Claude Code docs when creating the files.

| Agent | Model | Tools | Owns |
|---|---|---|---|
| orchestrator (main session) | fable | all | Plan, phase gates, architecture decisions, integration, final review of every merge. Writes the extract and classify stages and the date helper itself, since those carry the most judgment. |
| `parser-engineer` | fable | Read, Edit, Write, Bash, Grep, Glob | Sanitize and normalize stages, content model types, smart helpers in 7.4. |
| `renderer-engineer` | sonnet | Read, Edit, Write, Bash, Grep, Glob | Section 6.1 components as pure render functions for both features. |
| `ui-builder` | sonnet | Read, Edit, Write, Bash, Grep, Glob | Screens, forms, preview panes, copy button, drafts, settings. |
| `test-engineer` | sonnet | Read, Edit, Write, Bash, Grep, Glob | Golden fixtures, unit tests, Playwright flows, the output linter (section 11.3). |
| `packaging-engineer` | sonnet | Read, Edit, Write, Bash, Grep, Glob | Tauri wrappers, CI release workflow, install notes per platform. |
| `email-qa` | opus | Read, Bash, Grep, Glob (read-only) | Independent review of rendered output against section 6. Has not seen the code being written. Reports findings; fixes nothing. |
| `security-reviewer` | opus | Read, Grep, Glob (read-only) | Review of the sanitize stage and preview sandbox before each release. |
| `docs-writer` | haiku | Read, Edit, Write | One-page user guide, maintainer README, changelog. |

Working rules for the orchestrator:
- Give each sub-agent a self-contained brief: the files it owns, the section numbers of this spec that apply, the acceptance tests it must pass, and what it must not touch.
- Run independent work in parallel (renderer and UI shell, for example). Never have two agents edit the same file at once.
- A reviewer agent never reviews its own work. `email-qa` and `security-reviewer` stay read-only.
- Do not accept a sub-agent's "done" without running the tests yourself.
- Use the cheaper model where the table says so. Escalate a task to Fable only when a sub-agent fails the same acceptance test twice.

## 11. Software development practices

### 11.1 Repository layout

```
/src
  /core        sanitize, normalize, extract, classify, helpers, render  (no DOM globals beyond DOMParser, no UI imports)
  /templates   announcement layouts, monthly letter sections
  /ui          screens and components
  /config      pack.config.ts, tokens.ts
/tests
  /fixtures    input.html + expected.html pairs
  /unit
  /e2e
/src-tauri     wrapper project (added in Phase 6)
/docs          user guide, maintainer guide, this spec
/.claude/agents
CLAUDE.md
```

`/src/core` and `/src/templates` must run in Node under test with no browser. All design tokens live in `tokens.ts`; a hex value anywhere else fails lint.

### 11.2 Workflow

- Build one phase at a time and stop for review after each (section 12).
- Trunk-based: short branches, small pull requests, one concern each. Conventional commit messages.
- Test first for the core: write the fixture and the failing test, then the code.
- TypeScript strict mode. ESLint and Prettier. No `any` in `/src/core`.
- Every pull request passes lint, typecheck, unit tests and web build in CI before merge.
- Semantic versioning. Keep `CHANGELOG.md`. Tag releases; tags trigger the four-artifact build.
- Record each architecture decision as a short note in `/docs/decisions/` (date, choice, reason).
- No secrets in the repo. Signing keys, if any, live only in CI secrets.
- `CLAUDE.md` at the repo root points to this spec and repeats the non-negotiables: tokens only, inline styles only, no em dashes, no runtime network calls.

### 11.3 Testing

- **Golden fixtures.** Each fixture is a real pasted input and the approved output. Start with the four announcements restyled on 2026-11-20 (Scouting for Food links, Year-in-Review photo upload, Help wanted, Pack calendar) plus the Webelos den events. The orchestrator must collect the original input and approved output for each from the project owner before Phase 1. Because approved outputs included human copy edits, each fixture also stores the form edits applied, so the test is: input, plus recorded edits, renders to expected output exactly.
- **Monthly reference issue.** A draft file that reproduces the November 2026 issue must render to HTML whose text content, links and section order match the supplied file, with the defects listed in 8.2 corrected.
- **Unit tests.** Date parsing and weekday inference with a fixed clock, including year rollover from December to January. Tag detection. Wrapper stripping at 1, 15 and 50 levels of nesting. URL allow-list.
- **Output linter.** A test helper run on every rendered string that fails if it finds: a `<style>`, `<script>`, `class=`, `id=` or `data-` attribute; a color outside the token list; an em dash; an image without alt or without `max-width:100%`; a link without an absolute `href`; a percentage width other than 100% on a layout table; a `calc(` anywhere; a button under 44px; nesting of more than one wrapper `div`.
- **Hostile input.** Pasted `<script>`, `onerror=`, `javascript:` URLs, malformed tags and a 1 MB paste must produce safe output and no errors.
- **End to end.** Playwright: paste, edit a field, copy, and assert clipboard content, in both features.
- **Visual.** Screenshot the preview at 250px, 375px and 600px for each fixture and compare.
- **Manual email check before each release.** Paste one announcement and one letter into TroopTrack, send to a test address, and view in Gmail web, Gmail on iPhone, Gmail on Android, Apple Mail and Outlook. Known and accepted: Gmail dark mode shifts the colors; older Outlook shows square corners.

### 11.4 Accessibility and usability of the tool itself

- Every field has a visible label. Full keyboard operation. Visible focus.
- Plain words on screen: "Paste the old HTML here", "Copy new HTML". Never show the word "sanitize".
- Touch targets at least 44px. Layout works at 360px wide for the Android build.
- The app uses the same Pack 137 News tokens for its own look.

### 11.5 Security and privacy

- Pasted HTML is untrusted. It is parsed inert and only the content model reaches the page.
- Preview `iframe` uses `sandbox` with no script permission.
- Strict Content Security Policy on the web build and in the wrappers. No remote code, no remote fonts.
- No network requests at runtime. The preview does not load remote images (owner decision, 2026-11-21); it shows a placeholder of the same size. No analytics. Nothing leaves the device.
- Tauri: enable only the capabilities used (clipboard, file dialog for drafts). Nothing else.

### 11.6 Definition of done (every phase)

- Acceptance tests for the phase pass in CI.
- Output linter passes on all fixtures.
- `email-qa` has reviewed and its findings are fixed or logged as accepted.
- Docs updated. Changelog entry written.
- Project owner has seen a demo and signed off.

## 12. Build phases

0. **Foundation.** Repo, tooling, CI, tokens file, `CLAUDE.md`, agent files, empty app shell that builds. Framework decision recorded.
1. **Core pipeline.** Sanitize, normalize, extract, content model. Fixtures collected. No UI.
2. **Renderer.** Section 6.1 components and the five announcement layouts. Golden tests green.
3. **Converter UI.** Paste box, layout suggestion, form, helpers and warnings, preview, copy. First usable web build. Stop here for hands-on testing with real announcements.
4. **Monthly Letter Editor.** Build the section 8.2 sections and story blocks, read time, preview, copy. Reference issue test green.
5. **Drafts and settings.** Autosave, download and open draft, settings screen, defaults.
6. **Web release.** Hardening, security review, manual email check, deploy to the hosted site. Tag 1.0.0.
7. **Desktop wrappers.** Tauri spike, then Windows `.exe` and macOS `.dmg` from CI.
8. **Android wrapper.** `.apk` from CI, tested on a real phone. Narrow-screen pass on the Converter, including paste and copy with the Android clipboard.
9. **Handover.** One-page user guide with screenshots, maintainer guide, release checklist.

Phases 7 and 8 start only after phase 6 is accepted.

## 13. Open questions for the project owner

Resolved 2026-11-21: pills and badges use 8px corners everywhere, panels and the monthly card 12px; installers are unsigned; the `.apk` is geared to the weekly Converter; the monthly template is the November 2026 "Pack 137 Stories" issue; settings defaults are in section 9.

Still open:
- Web deployment. Deferred by the owner. Until decided, the web build is delivered as a zip of static files and previewed locally.
- How do volunteers get the installers: a download page on the pack site, or a shared drive folder?
- Which Android versions and screen sizes matter? ASSUMPTION: Android 10 and later, phones first.
- Narrow screens (resolved 2026-11-21). A test send of the weekly email in the Gmail app on a folding phone's outer screen showed that TroopTrack nests each announcement inside its own padded card, leaving about 250px for content. Approved fix, now in section 6.1: stacked date rows, Link list image above the text, `white-space:nowrap` on pills, 14px padding. Preview and screenshot tests must include 250px alongside 375px and 600px.
- Is "Pack 137 News" still the name for the weekly announcements, with "Pack 137 Stories" for the monthly?
- Who else, besides the project owner, will use and maintain this in the next two years?
- Should the Converter keep a history of past conversions on the device? ASSUMPTION: no, to keep it simple.

## 14. Instructions for Claude Code

- Read this whole file before writing code. Ask about any OPEN item that blocks the phase you are on.
- Build one phase at a time and stop for review after each.
- The orchestrator runs on Fable and delegates per section 10. Create the agent files in Phase 0.
- Do not add features outside sections 7 to 9 without asking.
- The renderer must emit only the section 6.1 patterns. A new visual pattern needs the owner's approval and a new entry in section 6.1 first.
- No em dashes in any user-facing copy, output HTML or documentation.
- No runtime AI calls, no network calls, no tracking.
- Never commit signing keys or certificates.
