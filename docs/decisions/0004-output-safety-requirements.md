# 0004: What the renderer and the UI must do with the content model

Date: 2026-11-21

Choice: the parse pipeline (Phase 1) keeps pasted text and URLs as the user wrote them and only removes what can run or load code. Everything below is the job of the renderer (Phase 2) and the UI (Phase 3), and each item needs a test there.

Reason: the Phase 1 security review found no way for a paste to run script or reach the live page, and no gap in the URL allow-list. It did find strings that are safe as data but dangerous if a later stage forgets to escape them.

## Renderer (Phase 2)

1. Escape `&`, `"`, `'`, `<` and `>` in every attribute value: href, src, alt, and the VML `v:roundrect` href in the monthly letter. A kept link such as `https://x.org/"><img src=x onerror=alert(1)>` is a valid model href.
2. Escape all text. Model text can hold literal markup such as `<script>`, `<!--[if mso]>`, `]]>` or `-->`.
3. Fill templates by concatenation or with a function as the `replace` argument, never a replacement string, so `$&` and `` $` `` in user text are not expanded.
4. `lintOutput` reads `id=`, `calc(`, a hex color or an em dash anywhere, including in escaped user text. Decide how user text that trips it is handled before Phase 2 is signed off.
5. Encode `mailto:` subjects and bodies properly (spec 7.3).

## UI (Phase 3)

1. Import only `parse()` from `src/core`. `sanitize()` and `normalize()` return elements of the inert document; appending one to the page would load its images.
2. Set form values with `.value` or `textContent`, never `innerHTML`.
3. Show `Issue.detail` as text, never as a link. Shorten long details (an `insecure-url` detail can be 1 MB) and cap how many issues are listed.
4. Show the full `mailto:` value, parameters included, so a hidden `cc` or `bcc` is visible.
5. Wrap `parse()` in try/catch and cap the paste size. A Web Worker is not an option: `DOMParser` does not exist in workers.
6. Previews do not load remote images. Decided by the owner on 2026-11-21. The preview shows a placeholder the size of each image, and the preview frame's Content Security Policy blocks remote image requests as a second guard.

7. When `lintOutput` reports a problem with the new HTML, "Copy new HTML" stays available. The problem is shown clearly above the copy button in plain words; copying is never blocked. Decided by the owner on 2026-11-21.

## Settings (Phase 5)

From the Phase 4 security review. Today pack.config.ts values are trusted constants. Once settings are editable and travel in draft files (spec 8.3 and 9), every setting is untrusted input:

1. Email settings (contact, volunteer, feedback) accept only a bare address. A value such as `pack@example.org?bcc=someone@example.org` is refused, since it would put a hidden copy into the feedback, footer and button links.
2. Every URL setting (logo, standing links, photo form, year at a glance) goes through the same allow-list as pasted and typed links, and the settings screen shows the full value of every email link with its decoded parts (UI item 4).
3. Draft files are parsed as data, validated against the schema version, and never trusted for paths or keys.

## To verify in a real browser before release (Phase 6)

With the network panel open, paste `<img src="https://example.org/a.png"><link rel=stylesheet href="https://example.org/x.css"><iframe src="https://example.org/"></iframe>` and confirm the parse makes no requests. The review reasoned this from the HTML spec; it has not been observed on a device.
