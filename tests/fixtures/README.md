# Golden fixtures

Each fixture is a real pasted input and the approved output. The test is: the input, plus the recorded form edits, renders to the expected output exactly (build spec, section 11.3).

## Weekly announcements

Files live in `tests/fixtures/weekly/`. Each announcement has three files with the same prefix, where `N` is the announcement number and `name` is a short label:

- `N-name.input.html`: the HTML copied from the TroopTrack code view, exactly as pasted. Do not edit it, tidy it or re-indent it. If the original had odd spacing, broken tags or stray styles, they stay. The hostile and messy parts are the point.
- `N-name.edits.json`: the hand edits that turn what the tool fills in into the approved form. Format:

  ```json
  {
    "layout": "date-list",
    "today": "2026-11-21",
    "edits": [{ "path": ["sections", 0, "name"], "value": "Take action now", "why": "tool gap: ..." }]
  }
  ```

  `layout` is the layout the tool suggests. `today` is the fixed clock for the fill. Each edit sets the value at `path` in the form, with `setAt` semantics (`src/core/helpers/paths.ts`), in order. A path may point at a whole section, row, list or field, but prefer one field per edit, so the count shows how far the tool is from the approved output. The `why` starts with `human copy edit:` (a wording or design choice by the owner, with the SOURCES.md item) or `tool gap:` (something the tool should have got). `tests/unit/fill-golden.test.ts` applies the edits to `fillForm(parse(input), layout, ...)`, expects exactly `N-name.form.json`, and renders it against `.expected.html`. It also holds a count of edits per fixture that may only go down.
- `N-name.expected.html`: the approved output as sent. These are already present.

Current announcements:

1. `1-pack-calendar`
2. `2-help-needed`
3. `3-year-in-review-photos`
4. `4-in-the-news`
5. `5-webelos-dens-10-11`


## Monthly letter

Files live in `tests/fixtures/monthly/`:

- `2026-11.original.html`: the November 2026 issue as originally pasted.
- `2026-11.corrected.html`: the same issue with the defects listed in spec section 8.2 corrected.

## Rules for every fixture

- Plain words in any notes. No em dashes anywhere, in fixtures or notes, because the output linter rejects them.
- Never add private data such as real email addresses for individual families or tokens. Use the pack addresses already in the files.
- Do not reformat a fixture with a tool. Prettier ignores them on purpose, so keep it that way.
