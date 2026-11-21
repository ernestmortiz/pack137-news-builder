# 0002: Program year starts in September (assumption)

Date: 2026-11-21

Choice: `programYearStartMonth` defaults to 9 in `src/config/pack.config.ts`.

Reason: the date helper needs a program year to decide which year a bare date such as "Jan 9" belongs to. September is a guess that has not been confirmed with the project owner. It is editable in settings.
