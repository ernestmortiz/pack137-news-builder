# Golden fixtures

Each fixture is a real pasted input and the approved output. The test is: the input, plus the recorded form edits, renders to the expected output exactly (build spec, section 11.3).

## Weekly announcements

Files live in `tests/fixtures/weekly/`. Each announcement has three files with the same prefix, where `N` is the announcement number and `name` is a short label:

- `N-name.input.html`: the HTML copied from the TroopTrack code view, exactly as pasted. Do not edit it, tidy it or re-indent it. If the original had odd spacing, broken tags or stray styles, they stay. The hostile and messy parts are the point.
- `N-name.edits.json`: the form edits that were applied by hand to reach the approved wording, such as the chosen layout, retyped titles, corrected dates and copy changes. The exact format is pending. It will be fixed in Phase 3, when the form exists and the edits have something to be recorded against. Until then this file is not required and no test reads it.
- `N-name.expected.html`: the approved output as sent. These are already present.

Current announcements:

1. `1-pack-calendar`
2. `2-help-needed`
3. `3-year-in-review-photos`
4. `4-in-the-news`
5. `5-webelos-dens-10-11`

Only the `.expected.html` files exist today. The `.input.html` files must come from the project owner, because only the owner has the original TroopTrack code. Until they arrive, the pipeline tests re-paste each approved output and check that no content is lost.

## Monthly letter

Files live in `tests/fixtures/monthly/`:

- `2026-11.original.html`: the November 2026 issue as originally pasted.
- `2026-11.corrected.html`: the same issue with the defects listed in spec section 8.2 corrected.

## Rules for every fixture

- Plain words in any notes. No em dashes anywhere, in fixtures or notes, because the output linter rejects them.
- Never add private data such as real email addresses for individual families or tokens. Use the pack addresses already in the files.
- Do not reformat a fixture with a tool. Prettier ignores them on purpose, so keep it that way.
