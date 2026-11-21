/**
 * Randomized (property-based) tests for the whole pipeline. Each seed makes a TroopTrack-style
 * paste (tests/fuzz/generate.ts) and checks the properties below. Everything is deterministic: a
 * failure names its seed and prints the paste so it can be replayed. See tests/fuzz/README.md.
 *
 *   FUZZ_RUNS=5000 npm test -- fuzz     a longer run (seeds 1 to 5000)
 *   FUZZ_SEED=1234 npm test -- fuzz     replay one seed
 *
 * Properties: a never throws, b safe lint-clean output, c no words lost on fill, d no words lost
 * on switchLayout, e check-me and suggestion paths resolve and suggestions are safe, f warnings
 * agree with the renderer, g weekdays are right, h time budget, i history behaves like a model.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { formatDate, isValidDate, type CalendarDate } from '../../src/core/dates';
import {
  applySuggestion,
  fillForm,
  switchLayout,
  type FillOptions,
  type FillResult,
} from '../../src/core/fill';
import type { AnnouncementForm, DateField } from '../../src/core/forms';
import { formWarnings, rowIsShown } from '../../src/core/form-warnings';
import { hasPath, getAt } from '../../src/core/helpers/paths';
import { lintOutput } from '../../src/core/lint-output';
import type { Block, Layout, ListBlock } from '../../src/core/model';
import { parse, type ParseResult } from '../../src/core/pipeline';
import { renderAnnouncement } from '../../src/core/render';
import { createHistory } from '../../src/ui/history';
import { describeCase, generateClock, generatePaste, mulberry32 } from '../fuzz/generate';
import { budget } from './budget';

const LAYOUTS: Layout[] = ['message', 'call-to-action', 'link-list', 'date-list', 'help-wanted'];
const EM_DASH = String.fromCharCode(0x2014);

const RUNS = Number(process.env.FUZZ_RUNS ?? 300);
const ONE_SEED = process.env.FUZZ_SEED === undefined ? undefined : Number(process.env.FUZZ_SEED);
const SEEDS: number[] =
  ONE_SEED !== undefined && Number.isFinite(ONE_SEED)
    ? [ONE_SEED]
    : Array.from({ length: Number.isFinite(RUNS) && RUNS > 0 ? RUNS : 300 }, (_, i) => i + 1);

/* ---------- collecting failures ---------- */

interface Failure {
  seed: number;
  detail: string;
}
const failures = new Map<string, Failure[]>();
const timings: number[] = [];
const MAX_REPORTED = 3;

function fail(property: string, seed: number, detail: string): void {
  const list = failures.get(property) ?? [];
  list.push({ seed, detail });
  failures.set(property, list);
}

/** Text for a failed property: the first few cases in full (seed and paste), the rest as seeds. */
function report(property: string): string {
  const all = failures.get(property) ?? [];
  if (all.length === 0) return '';
  // One entry per seed, so the count is of cases and not of messages.
  const list = all.filter((f, i) => all.findIndex((g) => g.seed === f.seed) === i);
  const shown = list
    .slice(0, MAX_REPORTED)
    .map(
      (f) =>
        `${all
          .filter((g) => g.seed === f.seed)
          .slice(0, 4)
          .map((g) => g.detail)
          .join('\n')}\n${describeCase(f.seed)}`,
    )
    .join('\n\n');
  const rest = list.slice(MAX_REPORTED).map((f) => f.seed);
  return (
    `${list.length} of ${SEEDS.length} seeds failed ${property}.\n\n${shown}` +
    (rest.length > 0 ? `\n\nOther failing seeds: ${rest.slice(0, 200).join(', ')}` : '')
  );
}

function expectNone(property: string): void {
  expect(report(property), `property ${property}`).toBe('');
}

/* ---------- helpers ---------- */

/** Words are runs of letters and digits, lower-case. "6th" counts as "6". Emoji and punctuation drop out. */
function words(text: string): string[] {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).map((w) => w.replace(/^(\d+)(?:st|nd|rd|th)$/, '$1'));
}

type RunLike = { kind: string; text?: string; href?: string };

/**
 * The text of one line, runs joined with nothing between them, as a browser shows them: in
 * `<u>Food</u><s>Popcorn</s>` the words touch ("FoodPopcorn"). A link's trailing " | Site Name"
 * is left out because title cleanup removes it on purpose (spec 7.4) and raises a check-me.
 */
function runStrings(runs: RunLike[], stripSite: boolean): string[] {
  return [
    runs
      .map((r) => {
        if (r.kind !== 'text') return ' ';
        const text = r.text ?? '';
        return r.href === undefined || !stripSite ? text : text.replace(/\s\|[^|]*$/, ' ');
      })
      .join(''),
  ];
}
function listText(list: ListBlock, strip: boolean): string[] {
  return list.items.flatMap((item) => [
    ...runStrings(item.runs, strip),
    ...item.children.flatMap((c) => listText(c, strip)),
  ]);
}
/** The visible text of a parsed model: headings, paragraphs and list items. Image alt is not shown. */
function modelText(blocks: Block[], strip: boolean): string[] {
  return blocks.flatMap((b) => {
    if (b.type === 'heading' || b.type === 'paragraph') return runStrings(b.runs, strip);
    if (b.type === 'list') return listText(b, strip);
    return [];
  });
}

/**
 * Keys whose strings are not visible text: links, layout names and style names. `alt` is here too:
 * only Link list has a picture field, so a switch to another layout drops the picture and its
 * alt text by design (spec 7.2), and the fill reports the picture it cannot show.
 */
const NOT_TEXT = new Set([
  'url',
  'href',
  'src',
  'alt',
  'layout',
  'style',
  'strength',
  'kind',
  'marks',
]);

function strings(value: unknown, perRun: boolean, key = '', out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (!NOT_TEXT.has(key)) out.push(value);
  } else if (Array.isArray(value)) {
    // A line of rich text counts joined, as the model's line does. With `perRun` it also counts
    // run by run, because a fill may put the runs in different fields.
    if (value.length > 0 && value.every((v) => v?.kind === 'text' || v?.kind === 'break')) {
      out.push(...runStrings(value as RunLike[], false));
      if (!perRun) return out;
    }
    for (const v of value) strings(v, perRun, key, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) strings(v, perRun, k, out);
  }
  return out;
}

function dateFields(form: AnnouncementForm): DateField[] {
  if (form.layout !== 'date-list') return [];
  return form.sections.flatMap((s) => s.rows.flatMap((r) => (r.date ? [r.date] : [])));
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Zeller's congruence, written out so the check does not share code with the date helper. */
function zellerWeekday(d: CalendarDate): number {
  let { year, month } = d;
  if (month < 3) {
    month += 12;
    year -= 1;
  }
  const k = year % 100;
  const j = Math.floor(year / 100);
  const h =
    (d.day +
      Math.floor((13 * (month + 1)) / 5) +
      k +
      Math.floor(k / 4) +
      Math.floor(j / 4) +
      5 * j) %
    7;
  return (h + 6) % 7; // 0 = Sunday
}
function independentFormat(d: CalendarDate): string {
  const short = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][zellerWeekday(d)];
  const mon =
    (MONTH_NAMES[d.month - 1] ?? '').slice(0, 1).toUpperCase() +
    (MONTH_NAMES[d.month - 1] ?? '').slice(1, 3);
  return `${short} ${mon} ${d.day}`;
}

/**
 * Words a date field may stand for. The fill reads "December 6th, 2026 to Jan 2" into numbers and
 * the renderer prints "Sun Dec 6 to Sat Jan 2", so month names, weekday names, ordinals, the
 * year and the range word are not in any text field. `broad` also allows every spelling the
 * parser reads (full names, "sept", "tues", 2-digit years, "through", "thru"). With `broad` false
 * only the words the output shows are allowed, which is what another layout keeps.
 */
function dateWords(fields: DateField[], broad: boolean): string[] {
  const out: string[] = [];
  const one = (d: CalendarDate): void => {
    out.push(...words(formatDate(d)));
    if (!broad) return;
    out.push(String(d.year), String(d.year).slice(2), String(d.month), String(d.day));
    const m = MONTH_NAMES[d.month - 1] ?? '';
    out.push(m, m.slice(0, 3), m.slice(0, 4));
  };
  // A weekday in the paste may be wrong for its date ("Mon 1/16/2027" is a Saturday). The fill
  // replaces it with the right one, so any weekday spelling is allowed once a date is read.
  if (broad && fields.length > 0) {
    for (const w of DAY_NAMES)
      out.push(
        w,
        w.slice(0, 3),
        w.slice(0, 4),
        w.slice(0, 5),
        w.slice(0, 6),
        w.replace(/day$/, ''),
      );
  }
  for (const f of fields) {
    one(f.start);
    if (f.end) {
      one(f.end);
      out.push('to');
      if (broad) out.push('through', 'thru');
    }
  }
  return out;
}

function formWords(form: AnnouncementForm, broad: boolean, perRun: boolean): Set<string> {
  const set = new Set<string>();
  const plain =
    form.layout === 'help-wanted' && form.ask.badge === DEFAULT_BADGE
      ? { ...form, ask: { ...form.ask, badge: '' } }
      : form;
  for (const s of strings(plain, perRun)) for (const w of words(s)) set.add(w);
  for (const w of dateWords(dateFields(form), broad)) set.add(w);
  return set;
}

/**
 * True when `word` is in `have`, or is several words of `have` run together. Runs that touch in
 * the paste ("Derby" then "Cubmobile" in two spans) make one token on one side and two on the
 * other when a fill puts a field break between them. Only words of five letters or more are tried in pieces, so a
 * short word such as "on" must be present on its own.
 */
function present(word: string, have: Set<string>): boolean {
  if (have.has(word)) return true;
  if (word.length < 5 || word.length > 80) return false;
  // A site name that title cleanup kept (`NJ.COM` then `Parent` with no space) fuses with its neighbour.
  for (const token of have) if (token.endsWith(word) || token.startsWith(word)) return true;
  const reach: boolean[] = [true];
  for (let end = 1; end <= word.length; end++) {
    reach[end] = false;
    for (let start = 0; start < end && !reach[end]; start++)
      reach[end] = reach[start] === true && have.has(word.slice(start, end));
  }
  return reach[word.length] === true;
}

function hrefValues(html: string): string[] {
  return [...html.matchAll(/\s(?:href|src)\s*=\s*"([^"]*)"/gi)].map((m) => m[1] ?? '');
}

function mailtoOrWeb(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

const HOSTILE_URLS = [
  'javascript:alert(1)',
  ' JaVaScRiPt:alert(1)',
  'java\tscript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  '//evil.example/x',
  'meet.google.com/abc',
  '"><script>alert(1)</script>',
  'https://example.com/" onmouseover="alert(1)',
  "https://example.com/'><img src=x onerror=alert(1)>",
  'mailto:a@b.c?subject=<script>&body="x"',
  `https://example.com/a b${EM_DASH}c`,
  'HTTPS://EXAMPLE.COM/UP',
];
const HOSTILE_TEXT = `<script>alert(1)</script> <img src=x onerror=alert(1)> &amp; "q" 'q' ${EM_DASH}`;

/**
 * A copy of a form with every link replaced by a hostile one and hostile markup added to every
 * text field. The renderer must escape the text and refuse the links, whatever the parser did.
 */
function hostileForm(value: unknown, rand: () => number, key = ''): unknown {
  if (typeof value === 'string') {
    if (key === 'url' || key === 'href' || key === 'src')
      return HOSTILE_URLS[Math.floor(rand() * HOSTILE_URLS.length)];
    if (NOT_TEXT.has(key) || rand() < 0.5) return value;
    return value + HOSTILE_TEXT;
  }
  if (Array.isArray(value)) return value.map((v) => hostileForm(v, rand, key));
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hostileForm(v, rand, k)]));
  return value;
}

function errorText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e);
}

/** Runs a stage; a throw is recorded under property a and the stage returns undefined. */
function attempt<T>(seed: number, what: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    fail('a', seed, `${what} threw: ${errorText(e)}`);
    return undefined;
  }
}

/* ---------- one seed ---------- */

function checkSafe(seed: number, what: string, html: string): void {
  const problems = lintOutput(html);
  if (problems.length > 0) fail('b', seed, `${what}: lintOutput reports ${problems.join('; ')}`);
  if (/<script/i.test(html)) fail('b', seed, `${what}: contains <script`);
  if (/<(iframe|object|embed|form|style|base|meta|link)\b/i.test(html))
    fail('b', seed, `${what}: contains a forbidden element`);
  if (/<[^>]*\son[a-z]+\s*=/i.test(html)) fail('b', seed, `${what}: contains an event handler`);
  if (html.includes(EM_DASH)) fail('b', seed, `${what}: contains an em dash`);
  for (const url of hrefValues(html)) {
    if (/^\s*(javascript|data|vbscript):/i.test(url)) fail('b', seed, `${what}: unsafe url ${url}`);
    if (/^\s*[a-z][a-z0-9+.-]*:/i.test(url) && !mailtoOrWeb(url))
      fail('b', seed, `${what}: url with a scheme that is not https, http or mailto: ${url}`);
  }
}

function buttonSlots(form: AnnouncementForm): { optional: boolean; text: string; url: string }[] {
  switch (form.layout) {
    case 'message':
      return form.button ? [{ optional: true, ...form.button }] : [];
    case 'call-to-action':
      return [{ optional: false, ...form.button }];
    case 'help-wanted':
      return [
        { optional: false, ...form.ask.button },
        ...(form.secondary ? [{ optional: true, ...form.secondary }] : []),
      ];
    default:
      return [];
  }
}

/** Help wanted's pill text. It is the tool's own default, not pasted copy, so another layout need not keep it. */
const DEFAULT_BADGE = 'Highest need';
const BUTTON_MARK = 'mso-padding-alt';
const ROW_MARK = '<td style="padding:10px 0;';
const count = (html: string, needle: string): number => html.split(needle).length - 1;

function checkWarnings(seed: number, layout: Layout, form: AnnouncementForm, html: string): void {
  const warnings = formWarnings(form);
  const w = (code: string): number => warnings.filter((x) => x.code === code).length;
  const tag = `${layout}`;

  // Buttons: one is drawn for each slot that has text and a link starting https://, http:// or mailto:.
  const slots = buttonSlots(form);
  const drawn = count(html, BUTTON_MARK);
  const usable = slots.filter((s) => s.text.trim() !== '' && mailtoOrWeb(s.url)).length;
  if (drawn !== usable)
    fail(
      'f',
      seed,
      `${tag}: ${drawn} buttons drawn but ${usable} slots have text and a valid link`,
    );
  // A missing button is warned about unless it is optional and empty. A drawn one is never warned about.
  const missing = slots.filter(
    (s) =>
      !(s.text.trim() !== '' && mailtoOrWeb(s.url)) &&
      !(s.optional && s.text.trim() === '' && s.url.trim() === ''),
  ).length;
  if (w('button-no-link') !== missing)
    fail(
      'f',
      seed,
      `${tag}: ${w('button-no-link')} button warnings but ${missing} buttons are missing from the output`,
    );

  // Sections: each Date list section on its own. A warning if and only if it draws no rows.
  if (form.layout === 'date-list') {
    let rowsDrawn = 0;
    form.sections.forEach((section, i) => {
      const alone: AnnouncementForm = { ...form, sections: [section] };
      const aloneHtml = renderAnnouncement(alone);
      const rows = count(aloneHtml, ROW_MARK);
      rowsDrawn += rows;
      const warned = formWarnings(alone).some((x) => x.code === 'empty-section');
      const shown = section.rows.filter(rowIsShown).length;
      if (rows !== shown)
        fail('f', seed, `section ${i}: ${rows} rows drawn but ${shown} are shown by rowIsShown`);
      if (warned !== (rows === 0))
        fail(
          'f',
          seed,
          `section ${i}: empty-section warning is ${warned} but ${rows} rows are drawn`,
        );
    });
    if (count(html, ROW_MARK) !== rowsDrawn)
      fail(
        'f',
        seed,
        `whole form draws ${count(html, ROW_MARK)} rows, sections alone draw ${rowsDrawn}`,
      );
    const emptyWarn = w('empty-section');
    const emptyNow = form.sections.filter(
      (s) => count(renderAnnouncement({ ...form, sections: [s] }), ROW_MARK) === 0,
    ).length;
    if (emptyWarn !== emptyNow)
      fail('f', seed, `${emptyWarn} empty-section warnings, ${emptyNow} empty sections`);
  }

  // Images: alt="" is drawn only for a Link list image with a web URL, and it is warned about.
  if (form.layout === 'link-list') {
    const emptyAlt = html.includes('alt=""');
    if (emptyAlt !== w('image-no-alt') > 0)
      fail(
        'f',
        seed,
        `link-list: alt="" drawn is ${emptyAlt} but image-no-alt warnings are ${w('image-no-alt')}`,
      );
  } else if (html.includes('<img')) {
    fail('f', seed, `${tag}: draws an image, only Link list should`);
  }

  // Bad links: a url that does not start https://, http:// or mailto: is never an href, and a shown
  // bad link in a link row, a button or a rich text run is warned about.
  const urls = new Set(hrefValues(html));
  collectUrls(form).forEach((u) => {
    if (u.trim() !== '' && !mailtoOrWeb(u) && [...urls].some((h) => h === u))
      fail('f', seed, `${tag}: bad url ${u} became an href`);
  });
}

function collectUrls(value: unknown, key = '', out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (key === 'url' || key === 'href' || key === 'src') out.push(value);
  } else if (Array.isArray(value)) value.forEach((v) => collectUrls(v, key, out));
  else if (typeof value === 'object' && value !== null)
    for (const [k, v] of Object.entries(value)) collectUrls(v, k, out);
  return out;
}

/**
 * The year rule written out again (ADR 0003): the next date on or after today, except that a date
 * up to 90 days back that is inside the current program year stays in the past. Feb 29 waits for a leap year.
 */
function expectedYear(month: number, day: number, clock: FillOptions): number {
  const { today, programYearStartMonth } = clock;
  const at = (year: number) => {
    const t = new Date(Date.UTC(year, month - 1, day));
    return t.getUTCMonth() === month - 1 && t.getUTCDate() === day ? t.getTime() : undefined;
  };
  const now = Date.UTC(today.year, today.month - 1, today.day);
  const startYear = today.month >= programYearStartMonth ? today.year : today.year - 1;
  const yearStart = Date.UTC(startYear, programYearStartMonth - 1, 1);
  for (const year of [today.year - 1, today.year]) {
    const t = at(year);
    if (t !== undefined && t < now && t >= yearStart && now - t <= 90 * 86_400_000) return year;
  }
  for (let year = today.year; year <= today.year + 8; year++) {
    const t = at(year);
    if (t !== undefined && t >= now) return year;
  }
  return today.year;
}

function checkDates(
  seed: number,
  form: AnnouncementForm,
  html: string,
  fill: FillResult,
  clock: FillOptions,
): void {
  if (form.layout !== 'date-list') return;
  form.sections.forEach((section, si) =>
    section.rows.forEach((row, ri) => {
      const d = row.date;
      if (d === undefined) return;
      if (!isValidDate(d.start) || (d.end !== undefined && !isValidDate(d.end)))
        fail('g', seed, `row ${si}.${ri}: date is not a real calendar date ${JSON.stringify(d)}`);
      if (d.end !== undefined) {
        const s = Date.UTC(d.start.year, d.start.month - 1, d.start.day);
        const e = Date.UTC(d.end.year, d.end.month - 1, d.end.day);
        if (e < s)
          fail('g', seed, `row ${si}.${ri}: range ends before it starts ${JSON.stringify(d)}`);
      }
      if (!rowIsShown(row)) return;
      const shown =
        d.end && isValidDate(d.end) && independentFormat(d.end) !== independentFormat(d.start)
          ? `${independentFormat(d.start)} to ${independentFormat(d.end)}`
          : independentFormat(d.start);
      const sameDay =
        d.end !== undefined &&
        d.end.year === d.start.year &&
        d.end.month === d.start.month &&
        d.end.day === d.start.day;
      const expected = sameDay ? independentFormat(d.start) : shown;
      if (isValidDate(d.start) && !html.includes(expected))
        fail(
          'g',
          seed,
          `row ${si}.${ri}: output should show "${expected}" for ${JSON.stringify(d)}`,
        );
    }),
  );
  // Years the fill assumed: the next occurrence on or after today, or up to 90 days back.
  for (const c of fill.checks) {
    if (c.kind !== 'year-assumed') continue;
    const row = getAt(form, c.path.slice(0, -1)) as { date?: DateField } | undefined;
    const d = row?.date;
    if (d === undefined) {
      fail('g', seed, `year-assumed check at ${c.path.join('.')} has no date`);
      continue;
    }
    const want = expectedYear(d.start.month, d.start.day, clock);
    if (d.start.year !== want)
      fail(
        'g',
        seed,
        `assumed year ${d.start.year} for ${formatDate(d.start)}, the rule gives ${want}`,
      );
  }
}

function checkSeed(seed: number): void {
  const paste = generatePaste(seed);
  const clock: FillOptions = generateClock(seed);

  const t0 = performance.now();
  const parsed: ParseResult | undefined = attempt(seed, 'parse', () => parse(paste));
  if (parsed === undefined) return;

  const forms = new Map<Layout, FillResult>();
  for (const layout of LAYOUTS) {
    const result = attempt(seed, `fillForm(${layout})`, () => fillForm(parsed, layout, clock));
    if (result !== undefined) forms.set(layout, result);
  }
  const suggested = forms.get(parsed.suggestion.layout) ?? forms.get('message');
  if (suggested !== undefined)
    attempt(seed, 'render suggested', () => renderAnnouncement(suggested.form));
  timings.push(performance.now() - t0);

  const modelWords = new Set(modelText(parsed.model.blocks, true).flatMap(words));
  // The same lines with the site names kept. Where a kept site name touches the next word
  // ("TAPinto" then "All" in two spans) the fill keeps them as one token, "tapintoall".
  const keptTokens = new Set(modelText(parsed.model.blocks, false).flatMap(words));

  for (const [layout, fill] of forms) {
    const form = fill.form;
    const html = attempt(seed, `renderAnnouncement(${layout})`, () => renderAnnouncement(form));
    if (html === undefined) continue;
    checkSafe(seed, layout, html);

    // b again, on a form with hostile links and text injected into every field.
    const rough = hostileForm(form, mulberry32(seed ^ 0xbad)) as AnnouncementForm;
    const roughHtml = attempt(seed, `renderAnnouncement(hostile ${layout})`, () =>
      renderAnnouncement(rough),
    );
    if (roughHtml !== undefined) {
      checkSafe(seed, `hostile ${layout}`, roughHtml);
      attempt(seed, `warnings(hostile ${layout})`, () =>
        checkWarnings(seed, layout, rough, roughHtml),
      );
      attempt(seed, `formWarnings(hostile ${layout})`, () => formWarnings(rough));
    }

    // c: every word in the parsed model is somewhere in the form.
    const have = formWords(form, true, true);
    const lost = [...modelWords].filter(
      (w) =>
        !present(w, have) && ![...keptTokens].some((t) => t !== w && t.includes(w) && have.has(t)),
    );
    if (lost.length > 0)
      fail('c', seed, `${layout}: words lost on fill: ${lost.slice(0, 20).join(' ')}`);

    // e: check-me and suggestion paths resolve; suggestions apply safely.
    for (const c of fill.checks)
      if (!hasPath(form, c.path))
        fail(
          'e',
          seed,
          `${layout}: check-me path ${JSON.stringify(c.path)} (${c.kind}) does not resolve`,
        );
    let all = form;
    for (const s of fill.suggestions) {
      if (!hasPath(form, s.path)) {
        fail('e', seed, `${layout}: suggestion path ${JSON.stringify(s.path)} does not resolve`);
        continue;
      }
      const next = attempt(seed, `applySuggestion(${layout}, ${s.message})`, () =>
        applySuggestion(all, s),
      );
      if (next === undefined) continue;
      all = next;
      const one = attempt(seed, 'applySuggestion single', () => applySuggestion(form, s));
      const out = one && attempt(seed, 'render after suggestion', () => renderAnnouncement(one));
      if (out) checkSafe(seed, `${layout} after suggestion "${s.message}"`, out);
    }
    const afterAll = attempt(seed, 'render after all suggestions', () => renderAnnouncement(all));
    if (afterAll !== undefined) checkSafe(seed, `${layout} after all suggestions`, afterAll);

    // f, g
    attempt(seed, `warnings(${layout})`, () => checkWarnings(seed, layout, form, html));
    attempt(seed, `dates(${layout})`, () => checkDates(seed, form, html, fill, clock));

    // d: switching to every other layout keeps every word of the form.
    const shownWords = formWords(form, false, false);
    for (const other of LAYOUTS) {
      if (other === layout) continue;
      const switched = attempt(seed, `switchLayout(${layout} to ${other})`, () =>
        switchLayout(form, other),
      );
      if (switched === undefined) continue;
      const target = formWords(switched, false, true);
      const gone = [...shownWords].filter((w) => !present(w, target));
      if (gone.length > 0)
        fail(
          'd',
          seed,
          `${layout} to ${other}: words lost on switch: ${gone.slice(0, 20).join(' ')}`,
        );
      const out = attempt(seed, `render after switch ${layout} to ${other}`, () =>
        renderAnnouncement(switched),
      );
      if (out !== undefined) checkSafe(seed, `${layout} switched to ${other}`, out);
    }
  }
}

describe('fuzz: pipeline properties', () => {
  beforeAll(() => {
    for (const seed of SEEDS) {
      try {
        checkSeed(seed);
      } catch (e) {
        fail('a', seed, `the test itself threw: ${errorText(e)}`);
      }
    }
  }, 600_000);

  it('a. parse, fillForm (five layouts), switchLayout, suggestions and render never throw', () => {
    expectNone('a');
  });
  it('b. every output passes lintOutput and holds no script, javascript:, data: or em dash', () => {
    expectNone('b');
  });
  it('c. fillForm keeps every pasted word, in every layout', () => {
    expectNone('c');
  });
  it('d. switchLayout keeps every word, between every pair of layouts', () => {
    expectNone('d');
  });
  it('e. check-me and suggestion paths resolve; suggestions apply and stay lint-clean', () => {
    expectNone('e');
  });
  it('f. formWarnings agrees with what the renderer leaves out', () => {
    expectNone('f');
  });
  it('g. dates are real, years are sensible and weekdays are right', () => {
    expectNone('g');
  });
  it('h. parse, fill and render of one case stays under budget(500) ms', () => {
    // The median says the typical case is fast; the slowest says no case freezes the tab.
    // A slow case is measured again once, so a busy machine does not fail the run.
    const sorted = [...timings].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    expect(median).toBeLessThan(budget(500));
    const slow: number[] = [];
    for (const seed of SEEDS) {
      if (slow.length >= MAX_REPORTED) break;
      const idx = SEEDS.indexOf(seed);
      if ((timings[idx] ?? 0) <= budget(500)) continue;
      const paste = generatePaste(seed);
      const clock = generateClock(seed);
      const t = performance.now();
      const p = parse(paste);
      const f = fillForm(p, p.suggestion.layout, clock);
      renderAnnouncement(f.form);
      const again = performance.now() - t;
      if (again > budget(500)) {
        slow.push(seed);
        fail(
          'h',
          seed,
          `took ${Math.round(again)} ms (first run ${Math.round(timings[idx] ?? 0)} ms), limit ${budget(500)} ms`,
        );
      }
    }
    expectNone('h');
  });
});

/* ---------- i: history against a model ---------- */

interface Patch {
  delta: number;
}

describe('fuzz: history behaves like an array and an index', () => {
  const RUNS_I = Math.max(50, Math.min(SEEDS.length, 2000));
  it('i. random record, undo and redo match a reference model', () => {
    for (let n = 0; n < RUNS_I; n++) {
      const seed = ONE_SEED ?? n + 1;
      const rand = mulberry32(seed ^ 0x51ed);
      const int = (max: number): number => Math.floor(rand() * max);
      const limit = rand() < 0.5 ? 3 + int(10) : 2000;
      const history = createHistory<{ n: number }, Patch>(limit);
      // Reference: every state ever reached in order, and where we are in them.
      let states: number[] = [0];
      let at = 0;
      let live = 0;
      const log: string[] = [];
      const ctx = () => `history seed ${seed}, limit ${limit}, steps: ${log.join(' ')}`;

      for (let step = 0; step < 60; step++) {
        const op = int(10);
        if (op < 3) {
          const next = int(1000);
          log.push(`snap(${live}>${next})`);
          history.recordSnapshot({ n: live }, { n: next }, `s${step}`);
          states = [...states.slice(0, at + 1), next];
          at = states.length - 1;
          live = next;
        } else if (op < 5) {
          const delta = 1 + int(9);
          log.push(`patch(+${delta})`);
          history.recordPatch({ delta }, `p${step}`);
          live += delta;
          states = [...states.slice(0, at + 1), live];
          at = states.length - 1;
        } else if (op < 8) {
          log.push('undo');
          const move = history.undo();
          if (at === 0) {
            expect(move, ctx()).toBeUndefined();
          } else {
            expect(move, ctx()).toBeDefined();
            if (move?.kind === 'snapshot') live = move.state.n;
            else if (move) {
              expect(move.direction, ctx()).toBe('undo');
              live -= move.patch.delta;
            }
            at -= 1;
            expect(live, ctx()).toBe(states[at]);
          }
        } else {
          log.push('redo');
          const move = history.redo();
          if (at === states.length - 1) {
            expect(move, ctx()).toBeUndefined();
          } else {
            expect(move, ctx()).toBeDefined();
            if (move?.kind === 'snapshot') live = move.state.n;
            else if (move) {
              expect(move.direction, ctx()).toBe('redo');
              live += move.patch.delta;
            }
            at += 1;
            expect(live, ctx()).toBe(states[at]);
          }
        }
        // The limit drops the oldest steps; the reference drops its oldest states the same way.
        while (states.length - 1 > limit) {
          states.shift();
          at -= 1;
        }
        expect(history.size(), ctx()).toBe(at);
        expect(history.canUndo(), ctx()).toBe(at > 0);
        expect(history.canRedo(), ctx()).toBe(at < states.length - 1);
      }
      // Undoing everything returns the first state the history still holds.
      while (history.canUndo()) {
        const move = history.undo();
        if (move?.kind === 'snapshot') live = move.state.n;
        else if (move) live -= move.patch.delta;
      }
      expect(live, ctx()).toBe(states[0]);
    }
  });
});
