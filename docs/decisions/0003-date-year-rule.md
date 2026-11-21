# 0003: How the date helper picks a year

Date: 2026-11-21

Choice: a date written without a year (such as "Jan 9") takes the next occurrence on or after today. The one exception: a date up to 90 days in the past that is still inside the current program year keeps that past date.

Reason: spec section 7.4 says "the next occurrence on or after today, within the program year". Read strictly, that turns "Fri Nov 13" written on Nov 21 into Nov 13 of next year. The approved "In the news" announcement dates an article Fri Nov 13, eight days before it was written, so recent past dates must stay in the past. The 90-day window and the program-year boundary keep that exception small: in late August, "Sep 12" still means the coming September.

The year is always shown beside the field so the user can change it. The window is `PAST_WINDOW_DAYS` in `src/core/dates.ts`.
