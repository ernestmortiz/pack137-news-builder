# Monthly reference issue: November 2026

- `2026-11.original.html`: the issue as supplied, with the defects listed in spec 8.2.
- `2026-11.corrected.html`: the same issue with those defects corrected. This is the reference.
- `2026-11.draft.json`: a `LetterForm` (version 1) that reproduces the corrected issue. Rendering it
  must match the corrected file (`tests/unit/letter-reference.test.ts`).

## What the form cannot express

These parts of the corrected file have no field in `LetterForm`. The renderer owns them, and the
test either ignores them or folds them away.

- Photo wrapper paragraph. Each photo sits in a `<p>` with `color:#8A90A6; font-size:13px;
  font-weight:700`. That is the approved muted-light token on photo wrappers (spec 6). It is
  renderer markup, not content.
- Full stops after links. The photo ask ends "Send them to us here." and the first Around the pack
  item ends "Read the TAPinto story." The form stores the link as the last element, so the test
  ignores a full stop directly after those two link texts.
- Badge capitals. The reference types badge text in capitals; the draft stores "Justin Daly" and the
  renderer capitalizes it. The test compares text without case.
- Read time. The reference says "About an 8 minute read." The draft counts 2187 words with
  `letterWords`, which gives "About a 10 minute read." The test replaces the reference's phrase with
  the computed one in both the summary line and the preview text.
- Preview filler. The hidden preview text carries zero-width filler characters. The test compares
  only its start (summary and read time).
- Outlook-only markup. The `mso` conditional comments, the VML button and the `<noscript>`-free
  header are comments to a DOM parser and are not compared.
- Table plumbing. `<tbody>`, `border:0 none` row styles, `role="presentation"` and the TroopTrack
  editor's width and margin leftovers differ by design (spec 8.2 defects).

## Choices in the draft

- Lead items keep the colon inside the bold lead ("Camp Crafts:"), as the file has it.
- The "How to help:" label and each Coming up date and time ("Sun Dec 6, 8:00 pm:") are made by the
  renderer, so `howToHelp` holds only the sentence and each item holds only its own text.
- The six station people in Justin Daly's list and the other name blocks keep the file's wording,
  including its Oxford commas.
- "On the horizon" dates are in 2027 (Sat Jan 9, Fri Jan 22, Sat Jan 23, Sat Feb 20), the December
  to January rollover.
