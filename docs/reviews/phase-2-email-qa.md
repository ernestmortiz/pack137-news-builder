# Phase 2 email QA findings

Date: 2026-11-21. Reviewer: email-qa (read-only, did not read the renderer source).

Scope: the five weekly fixtures rendered from their form files, plus two Message samples, checked at 250px, 375px and 600px in Chromium with remote requests blocked. Real mail clients were not checked; that is the manual send in spec 11.3.

Result: no blockers. All five fixtures match the approved outputs under the ADR 0005 rule. Every text color pairing is 8:1 or better. Nothing overflows at 250px. Every button is 44px tall.

| #   | Finding                                                                                                                                                                   | Severity             | Status                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| 1   | Outlook for Windows ignores padding on the button link, so buttons may shrink to about 20px tall. Fix needs a 6.1 change: padding on the cell as well, or a VML fallback. | Should fix           | Owner decision                                          |
| 2   | Patterns in the approved outputs but not written in spec 6.1: 20px spacer, Help wanted ask title, strong pill as a panel name, paragraph margins, 80px Link list image.   | Should fix (docs)    | Owner decision: add to 6.1                              |
| 3   | Fixture 2 links to a TroopTrack `/manage/` page that parents may not open.                                                                                                | Should fix (content) | Owner to confirm. Phase 3 adds the warning.             |
| 4   | A label longer than about 24 characters overflows the card at 250px, because pills do not wrap.                                                                           | Note                 | Phase 3: length warning on the label field              |
| 5   | Outlook for Windows drops max-width, pill padding and rounding, and some div padding.                                                                                     | Note                 | Accepted as known degradation; check in the manual send |
| 6   | Apple Mail and iOS may turn dates into system-colored links. Cannot be suppressed without a style block.                                                                  | Note                 | Accepted; check in the manual send                      |
| 7   | Gmail clips emails over about 102KB. One announcement is about 11KB.                                                                                                      | Note                 | Watch the total in the manual send                      |
| 8   | Lavender borders and the lavender secondary button edge are faint on white (1.24:1). Text is fine.                                                                        | Note                 | Accepted (approved pattern)                             |
| 9   | Fixture 5: rescheduled row has no new date, and SignUpGenius is mentioned with no link.                                                                                   | Note                 | Owner to confirm. Phase 3 adds the warning.             |
| 10  | Fixture 5: no spacer between the unnamed highlight panel and the plain section.                                                                                           | Note                 | Accepted (matches approved output)                      |
| 11  | Tone: fixture 3 title is title case; fixtures 1 and 5 do not lead with gratitude.                                                                                         | Note                 | Guidance only, not enforced                             |
| 12  | Message layout spacing matches Call to action.                                                                                                                            | Note                 | Owner to confirm (ADR 0005)                             |
| 13  | Link list image has no height attribute. The spec allows this.                                                                                                            | Note                 | Accepted                                                |
