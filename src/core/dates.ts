/**
 * Date helper (build spec, section 7.4). Reads dates such as `Dec 6`, `March 6`, `Feb 27-28` and
 * `12/6` at the start of a line, works out the year and formats them as `Sat Nov 21`.
 * All arithmetic is in UTC so the result never depends on the device's time zone.
 */

export interface CalendarDate {
  year: number;
  /** 1 to 12 */
  month: number;
  day: number;
}

export interface DateMatch {
  start: CalendarDate;
  end?: CalendarDate;
  /** The exact text that was read, so the caller can strip it from the line. */
  raw: string;
  /** True when the year was not written and was inferred. The UI shows it for checking. */
  yearAssumed: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** How far back a bare date may point before it is read as next year instead. */
export const PAST_WINDOW_DAYS = 90;

const DAY_MS = 86_400_000;

function toUtc(d: CalendarDate): number {
  return Date.UTC(d.year, d.month - 1, d.day);
}

export function isValidDate(d: CalendarDate): boolean {
  if (d.month < 1 || d.month > 12 || d.day < 1) return false;
  const t = new Date(toUtc(d));
  return t.getUTCMonth() === d.month - 1 && t.getUTCDate() === d.day;
}

export function weekday(d: CalendarDate): string {
  return WEEKDAYS[new Date(toUtc(d)).getUTCDay()] ?? '';
}

/** `Sat Nov 21` */
export function formatDate(d: CalendarDate): string {
  return `${weekday(d)} ${MONTHS[d.month - 1] ?? ''} ${d.day}`;
}

/** `Sat Feb 27 to Sun Feb 28` */
export function formatRange(start: CalendarDate, end: CalendarDate): string {
  return `${formatDate(start)} to ${formatDate(end)}`;
}

/** Today's date on this device, read once by the caller and passed in so tests can fix the clock. */
export function todayFrom(now: Date): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** First day of the program year that contains `today`. */
function programYearStart(today: CalendarDate, startMonth: number): CalendarDate {
  const year = today.month >= startMonth ? today.year : today.year - 1;
  return { year, month: startMonth, day: 1 };
}

/**
 * The year for a date written without one (see docs/decisions/0003-date-year-rule.md).
 * Normally the next occurrence on or after today. A date up to 90 days in the past that is still
 * inside the current program year keeps this program year, so "Fri Nov 13" written on Nov 21 stays
 * in the past instead of jumping a year ahead. Feb 29 in a non-leap year moves to the next leap year.
 */
export function inferYear(
  month: number,
  day: number,
  today: CalendarDate,
  programYearStartMonth: number,
): number {
  const todayMs = toUtc(today);
  const pyStartMs = toUtc(programYearStart(today, programYearStartMonth));

  for (const year of [today.year - 1, today.year]) {
    const d = { year, month, day };
    if (!isValidDate(d)) continue;
    const ms = toUtc(d);
    if (ms < todayMs && ms >= pyStartMs && todayMs - ms <= PAST_WINDOW_DAYS * DAY_MS) return year;
  }
  for (let year = today.year; year <= today.year + 8; year++) {
    const d = { year, month, day };
    if (isValidDate(d) && toUtc(d) >= todayMs) return year;
  }
  return today.year;
}

const MONTH_WORD =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const WEEKDAY_WORD =
  '(?:(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?\\.?,?\\s+)?';
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';
const YEAR = '(?:,?\\s+(\\d{4}))?';
const RANGE_SEP = '\\s*(?:-|\\u2013|to|through|thru)\\s*';

/** `Dec 6`, `Dec 6, 2027`, `Feb 27-28`, `Feb 28 to Mar 1`, optionally led by a weekday. */
const WORD_DATE = new RegExp(
  `^${WEEKDAY_WORD}${MONTH_WORD}\\s+${DAY}(?!\\d)` +
    `(?:${RANGE_SEP}(?:${WEEKDAY_WORD}${MONTH_WORD}\\s+)?${DAY}(?![\\d/]))?${YEAR}(?![\\w/])`,
  'i',
);

/** `12/6`, `12/6/27`, `12/6/2027`, `12/31-1/2`. */
const NUMERIC_DATE = new RegExp(
  `^${WEEKDAY_WORD}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?(?:${RANGE_SEP}(\\d{1,2})/(\\d{1,2}))?(?![\\w/])`,
  'i',
);

function monthFromWord(word: string): number {
  const key = word.slice(0, 3).toLowerCase();
  return MONTHS.findIndex((m) => m.toLowerCase() === key) + 1;
}

function build(
  startMonth: number,
  startDay: number,
  endMonth: number | undefined,
  endDay: number | undefined,
  explicitYear: number | undefined,
  today: CalendarDate,
  programYearStartMonth: number,
): Pick<DateMatch, 'start' | 'end' | 'yearAssumed'> | null {
  const year = explicitYear ?? inferYear(startMonth, startDay, today, programYearStartMonth);
  const start = { year, month: startMonth, day: startDay };
  if (!isValidDate(start)) return null;
  if (endDay === undefined) return { start, yearAssumed: explicitYear === undefined };

  const month = endMonth ?? startMonth;
  let end = { year, month, day: endDay };
  if (toUtc(end) < toUtc(start)) end = { ...end, year: year + 1 };
  if (!isValidDate(end) || toUtc(end) === toUtc(start)) return null;
  return { start, end, yearAssumed: explicitYear === undefined };
}

/**
 * Reads a date at the very start of `text`. Returns null when the line does not begin with one.
 * Day-first forms such as `6 Dec` are not recognized.
 */
export function matchLeadingDate(
  text: string,
  today: CalendarDate,
  programYearStartMonth: number,
): DateMatch | null {
  const trimmed = text.trimStart();

  const w = WORD_DATE.exec(trimmed);
  if (w) {
    const [raw, m1 = '', d1 = '', m2, d2, y] = w;
    const built = build(
      monthFromWord(m1),
      Number(d1),
      m2 ? monthFromWord(m2) : undefined,
      d2 ? Number(d2) : undefined,
      y ? Number(y) : undefined,
      today,
      programYearStartMonth,
    );
    return built ? { ...built, raw: raw.trimEnd() } : null;
  }

  const n = NUMERIC_DATE.exec(trimmed);
  if (n) {
    const [raw, m1 = '', d1 = '', y, m2, d2] = n;
    const year = y === undefined ? undefined : y.length === 2 ? 2000 + Number(y) : Number(y);
    const built = build(
      Number(m1),
      Number(d1),
      m2 ? Number(m2) : undefined,
      d2 ? Number(d2) : undefined,
      year,
      today,
      programYearStartMonth,
    );
    return built ? { ...built, raw: raw.trimEnd() } : null;
  }
  return null;
}
