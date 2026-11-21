# 0005: Announcement forms, golden form files and the golden comparison rule

Date: 2026-11-21

## Choice

1. The renderer reads a form, not the content model. `src/core/forms.ts` defines one form type per layout (spec 7.2). Rich text in a form reuses the content model's inline runs. Phase 3 fills a form from the parsed paste; Phase 2 only renders it.
2. Each weekly fixture has `N-name.form.json`: the final form state that renders to the approved output. Phase 3 adds `N-name.edits.json` (spec 11.3), and its test checks that parse plus edits gives this form.
3. Golden comparison is byte for byte, except that a whitespace run holding a line break between two tags is dropped. A space on one line, such as the one between an event link and its tag, still counts.

## Reason

- The form is what the user edits and what layout switching must preserve, so it is the natural input to a pure render function. The content model alone cannot carry hand edits such as a retyped title or an added tag.
- The approved outputs were indented by hand and the indentation is not consistent (a panel's inner table at 6 spaces, a note line at 10 inside a 12-space cell, a button at 18). Reproducing it would mean coding typing slips into the renderer. Email clients ignore whitespace between tags, so the rule loses nothing a reader can see.

## Layout rules read from the approved outputs

These are not written in spec 6.1 but the approved outputs depend on them. The renderer follows them.

- Date list, plain section with a name: a 17px section heading, and every row has a lavender top border, the first included.
- Date list, plain section with no name: no heading, and the first row has no top border.
- Highlight panel: the name, if any, is a strong pill (with the badge's letter spacing and 4px 10px padding). A panel with no name and one row shows the row straight in the panel cell; otherwise rows sit in an inner table. Rows after the first have a white top border.
- Quiet panel: the name is a 17px heading with no padding, then the subtitle (13px). A 20px spacer div comes before a quiet panel that follows other content.
- Tags inside a colored panel use white, not lavender, for quiet tags.
- A row with no date is a link row: the event link first, a 13px note under it.
- An event with no valid link is a 16px span, not a link.
- Paragraph margins: Help wanted intro 14px below; Call to action paragraph 16px below; Link list intro 6px below; Help wanted ask paragraphs 10px below, the last 14px; Help wanted outro 18px above and 12px below.
- Link list image: 80px wide, above the text.

Message has no approved output. It follows Call to action: each paragraph 14px below, the last 16px below when a button follows, and no margin when it does not. The owner should confirm this in the Phase 2 review.
