# Plan: edit text like a text editor

Status: done, released in 1.2.0 (owner request and decisions, 2026-11-23). Steps 1 to 4 merged in PRs #14 to #17.

The owner asked to edit any line of text the way a text editor works, instead of typing codes such as `**bold**` and `[link text](https://...)`. Two ways were offered and the owner chose both:

1. **Formatting in the text boxes.** Every rich text box shows bold, italic, struck text and links as they will look, with a small toolbar.
2. **Edit on the card.** Click a line on a picture of the email card and type there.

Both use one editing part, so option 2 builds on option 1.

## What stays the same

- The form data (`RichText`: runs of text with marks and an optional link) does not change. Drafts, undo, suggestions, warnings and the renderer keep working, and old drafts open unchanged.
- The email HTML does not change. The previews stay as they are: sandboxed frames that show exactly what will be sent.
- No new network use, no runtime AI, nothing in one build only. The same code runs on the web, Windows and Android.

## Part A: the editing part (option 1)

A small rich text box, `src/ui/rich-box.ts`, replaces each rich textarea.

- **What it can hold:** plain text, bold, italic, struck and links, the same marks the form has now. Nothing else. Line breaks where the field allows them.
- **Toolbar:** B, I, S and Link buttons, plus a "Remove link" button. The keys are Ctrl+B, Ctrl+I and Ctrl+K (Command on a Mac). The Link button asks for the address in a small box beside the text and checks it with the same `safeUrl` rule the email uses.
- **Pasting into the box:**
  - The browser's paste is stopped. The pasted text goes through the existing sanitize step, and only the allowed marks are kept.
  - Pasting a whole announcement still belongs in the big paste box at the top.
- **From screen to form:**
  - The box is read with a strict walk of its own elements into `RichText`; nothing is copied as HTML.
  - The form is written into the box with DOM calls, never `innerHTML`.
- **Undo and redo:** each typing burst and each toolbar press is one step, recorded with the existing history (`history.ts`), as the text boxes do now.
- **Keyboard and screen readers:**
  - The box is a labelled `role="textbox"` with `aria-multiline` where the field allows it.
  - The toolbar is a `role="toolbar"` reached with Tab and moved through with the arrow keys.
  - The buttons say whether they are on (`aria-pressed`).
- **Spelling:** the browser's spell check stays on, as now.
- **Fallback:** a "Show codes" switch shows the current textarea for anyone who prefers it. This also keeps today's behaviour one click away while the new box beds in.

## Part B: edit on the card (option 2)

A third view, "Edit on the card", sits beside the form. It draws the announcement as a card with the same colors and spacing as the email, built from the form in the page itself rather than in a preview frame.

- **What you can edit there:** each piece of text (label, title, paragraphs, Date list events, notes, button text) is a Part A box in place on the card. Clicking a line puts the cursor there. The toolbar floats above the line being edited.
- **What you can't:** structural changes (add a row, move a section, pick a layout, set a date) stay in the form. On the card they show as small buttons that jump to the right place in the form.
- **Why not type into the preview itself:** the previews run with every permission off (no scripts, no shared origin), so nothing pasted can ever run. Editing inside them would mean loosening that. The card view gives the same feel without touching the previews.
- **Sizes:** the card view can switch between 250, 375 and 600 pixels like the previews. The previews stay the final check of what is sent.

## Order of work

See "Owner decisions" at the end: Part A first, then the card view, weekly then monthly.

Each step gets its own pull request and the usual owner review.

## Tests

- Unit: the box-to-form reading and form-to-box writing round-trip every mark, link and line break. Hostile pastes and hostile link addresses (`javascript:`, data URLs, huge input) stay inert. Old drafts open unchanged.
- Browser:
  - typing, the toolbar, the keys, undo and redo, and pasting from Word and Google Docs into the box;
  - the card view at 250px;
  - on Android in the emulator test.
- The existing golden fixtures must not change: the email output is the same.

## Also in this release

- **Repeated button words after switching to Date list** (found in 1.1.1, owner chose to hold the fix until this work, 2026-11-23; done in step 3):
  - **Steps:** paste "1. Den Meeting - Dec 16th 6:15pm - Fun On The Run", with the link on the last words. Leave it on Call to action, then switch to Date list.
  - **Result:** the row reads "Den Meeting - 6:15pm - Fun On The Run" with a second "Fun On The Run" link under it.
  - **Cause:** since 1.1.1 the Call to action paragraph no longer carries the button's link, so the switch adds the button as a note.
  - **Fix:** when the button's words already end the event line, take them off the event, giving "Den Meeting - 6:15pm" with the link under it. Add a test for this paste.

## Owner decisions (2026-11-23)

1. **The card view comes first.** After pasting (and when opening a monthly letter), the card view is what you see. A clearly labelled switch at the top, "Edit on the card / Edit in the form", moves between the card and the form. It remembers your choice on this device, and both views edit the same announcement, so switching loses nothing.
2. **The "Show codes" switch stays.** Each rich text box can show the typed codes (`**bold**`, `[link text](https://...)`) for anyone who prefers them.
3. **The weekly announcement and the monthly letter are both in scope** for the first release of this work.

So the order of work becomes:

1. Part A, the editing part, built and tested on its own. Then used for the Message and Call to action paragraphs in the form. Owner review.
2. Part A for every other rich field, weekly and monthly, with the "Show codes" switch. Owner review.
3. Part B, the card view, for the weekly announcement, with the view switch. The card view becomes the first view. Owner review.
4. Part B for the monthly letter. Owner review, then release.
