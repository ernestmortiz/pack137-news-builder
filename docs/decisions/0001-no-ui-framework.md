# 0001: No UI framework to start

Date: 2026-11-21

Choice: plain TypeScript and DOM APIs, built with Vite. No Preact, Svelte or React.

Reason: the app is two screens of forms and a preview. Fewer dependencies means less to maintain for the next volunteer and a smaller surface for the installable wrappers.

Revisit: at the start of Phase 3. If the Date list form (sections, rows, tags) becomes hard to manage by hand, adopt one small framework and record it here.
