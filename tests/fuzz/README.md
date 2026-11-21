# Randomized tests

`tests/unit/fuzz.test.ts` makes random TroopTrack-style pastes with `tests/fuzz/generate.ts` and checks properties of the whole pipeline (parse, fill, switch layout, suggestions, render, warnings) and of `src/ui/history.ts`. Same seed, same paste: nothing is random between runs.

## Run

- `npm test` runs 300 seeds (about 4 seconds) along with every other test.
- `FUZZ_RUNS=5000 npm test -- fuzz` runs seeds 1 to 5000 (about a minute).
- `FUZZ_SEED=1234 npm test -- fuzz` replays one seed.
- The browser check, `tests/e2e/fuzz.spec.ts`, pastes 15 fixed seeds into the running app: `npm run e2e -- fuzz`.

## Reading a failure

Each failure names the property, the seed, the clock the fill used and the whole paste. Run the seed again with `FUZZ_SEED`. To keep a bug, cut the paste down to the smallest one that still fails and add it to a new `tests/unit/fuzz-regressions.test.ts` (none is needed yet: no src bug has been found).

To see a paste without running a test, import `generatePaste(seed)` and `generateClock(seed)` from `tests/fuzz/generate.ts`.

## Properties

|     | Property                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | `parse`, `fillForm` (five layouts), `switchLayout`, `applySuggestion` and `renderAnnouncement` never throw                                                                                              |
| b   | Every output passes `lintOutput`, has no `<script`, event handler, `javascript:` or `data:` link, no em dash. Also checked on a copy of each form with hostile links and text injected into every field |
| c   | Every word of visible text in the parsed model is in the filled form, for every layout                                                                                                                  |
| d   | `switchLayout` from each layout to each other keeps every word                                                                                                                                          |
| e   | Every check-me and suggestion path resolves; applying suggestions never throws and stays lint-clean                                                                                                     |
| f   | `formWarnings` agrees with the renderer: a missing button, an empty section and an empty image alt show up in both                                                                                      |
| g   | Dates are real, ranges run forward, the year follows the rule (ADR 0003) and the weekday matches an independent calculation                                                                             |
| h   | Parse, fill and render of one case stays under `budget(500)` ms                                                                                                                                         |
| i   | `history.ts` behaves like an array and an index under random record, undo and redo                                                                                                                      |

Allowances in c and d (see the comments in the test): dates become numbers, so month and weekday names, years and "to" may change spelling; a link's trailing " | Site Name" is removed on purpose; Help wanted's default "Highest need" pill and image alt text are not pasted words; words that touch across two spans ("Food" then "Popcorn") may be split or joined by a field break.

## Changing the generator

Changing `generate.ts` changes what every seed produces, so seeds named in old reports stop matching. Keep fixed-seed cases (the browser test, regressions) as pasted text, not seeds, when they must last.
