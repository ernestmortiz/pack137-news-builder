# 0001: No UI framework to start

Date: 2026-11-21

Choice: plain TypeScript and DOM APIs, built with Vite. No Preact, Svelte or React.

Reason: the app is two screens of forms and a preview. Fewer dependencies means less to maintain for the next volunteer and a smaller surface for the installable wrappers.

Revisit: at the start of Phase 3. If the Date list form (sections, rows, tags) becomes hard to manage by hand, adopt one small framework and record it here.

## Revisited at the start of Phase 3 (2026-11-21)

Kept: no framework. The Date list form is the hardest screen (sections, rows, tags). It is built with a small render-on-change pattern: typing updates the form state without redrawing, and adding, removing or moving a row, section or tag redraws that part of the form. That is manageable by hand and keeps the installable wrappers small.
