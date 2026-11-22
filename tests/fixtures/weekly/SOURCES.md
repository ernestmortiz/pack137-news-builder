# Where the weekly fixtures came from

The project owner supplied "Pack 137 weekly announcements: before and after" (PDF, prepared Sat Nov 21, 2026) on 2026-11-21.

- `N-name.expected.html` is the approved narrow-screen output, from the project doc `pack137-weekly-announcements-html.md`.
- `N-name.input.html` is the original TroopTrack HTML, extracted from the PDF's "Original HTML" listings.

## How the inputs were extracted

The PDF wraps long lines. Lines were rejoined with a newline, except that a line ending in `-`, or a break inside an `href` or `src` value, was joined with nothing. The same rule rebuilt all five "New HTML" listings in the PDF to match the `.expected.html` files exactly (whitespace aside), which is the check that the rule is right. Leading indentation is lost, which does not change how the HTML parses. Wrapper div counts match the PDF's table: 49, 30, 2, 7 and 15.

The PDF itself notes that four of the five originals (all but the pack calendar) were re-keyed from the pasted HTML: content and attributes as supplied, wrapper divs regenerated to the same depth.

## Hand edits recorded in the PDF

These are recorded in `N-name.edits.json` (Phase 3). Each edit says whether it is a human copy edit or a tool gap.

1. Pack calendar: weekday added to every date, dates stacked above events. Red and green text replaced by a "Please RSVP" pill and a plain note line. "Virtual", "In person" and "TBD" became pills; numbered lists removed. Wording: "On going" to "Ongoing", "Weigh In" to "Weigh-In", "Blue & Gold" to "Blue and Gold".
2. Help needed: highest-need item moved into a highlight panel with its own button. Copy rewritten ("is looking the formation of an 501(c)(3) non-profit"). Email subject "HelpWithNonProfitFormation" became "Help with nonprofit formation". Thank-you sentence added at the top. Still to check: the "pack leadership" link goes to a `/manage/` page.
3. Year in review photos: "to soon" fixed to "too soon". Underlined link replaced by a button. Thank-you sentence added.
4. In the news: logo moved above the text. A short source note under each link. "| Cranford, NJ News" removed from the headline. Thank-you sentence added.
5. Webelos dens: "RESCHEDULED!!" became a pill; the old date stays struck through in a highlight panel. Weekday added to each date; "Virtual" became a pill. Still missing in both versions: the new meeting date and a SignUpGenius link.
