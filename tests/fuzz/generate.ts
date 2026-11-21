/**
 * Random TroopTrack-style announcement pastes for the property tests (tests/unit/fuzz.test.ts and
 * tests/e2e/fuzz.spec.ts). Pure TypeScript: no DOM, no dependencies, same seed gives the same paste.
 *
 * The mix is weighted so most cases look like a real announcement (a heading, a list of dated
 * links, a few paragraphs, wrapped in the editor's nested divs) and some are messy: odd date
 * formats, struck dates, shouting, bad links, tables, and a small share of hostile markup.
 * See tests/fuzz/README.md for how to replay a seed.
 */

/** mulberry32: a tiny seeded generator. Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }
  /** Picks by weight: `[weight, value]` pairs. */
  weighted<T>(items: readonly (readonly [number, T])[]): T {
    const total = items.reduce((sum, [w]) => sum + w, 0);
    let r = this.next() * total;
    for (const [w, v] of items) {
      r -= w;
      if (r < 0) return v;
    }
    return (items[items.length - 1] as readonly [number, T])[1];
  }
}

/* ---------- word banks ---------- */

/** Built from its code point so this file holds no em dash. */
const EM_DASH = String.fromCharCode(0x2014);

const EVENTS = [
  'Pinewood Derby',
  'Pack Meeting',
  'Den Meeting',
  'Webelos Meeting',
  'Scouting for Food',
  'Parent Planning Meeting',
  'Blue and Gold Banquet',
  'Popcorn Pickup',
  'Spring Campout',
  'Pinewood Derby Weigh In',
  'Court of Honor',
  'Lion Den Hike',
  'Arrow of Light Crossover',
  'Cubmobile Workshop',
  'Rank Advancement Night',
  'Fishing Derby',
];
const SENTENCES = [
  'Please bring a flashlight and a water bottle.',
  'We need two more volunteers to help set up the hall',
  'Thank you to everyone who donated this year.',
  'Read all about it',
  'Sign up before the deadline so we can plan food',
  'Our pack meets at First Presbyterian Church of Cranford',
  'Scouts should wear their full Class A uniform.',
  'Parents are welcome to stay and help.',
  'Questions? Reply to this message and we will get back to you.',
  'Dress for the weather, we will be outside',
  'Help wanted for the Pinewood Derby track crew',
  'We would love your help with the food drive',
  'Volunteers needed to run the registration table',
  'All Cubs and their grown-ups are invited',
];
const HEADINGS = [
  'Take Action Now',
  'Coming Soon',
  'Ongoing',
  'On going',
  'References',
  'In the news',
  'Help needed',
  'This week',
  'Upcoming events',
  'Webelos dens',
  'Save the date',
];
const NAMES = ['Ernest', 'Justin Daly', 'Maria', 'Mr. Patel', 'Sam & Jo', 'Zoe'];
const SITES = ['TAPinto', 'NJ.com', 'Cranford Chronicle', 'Scouting America', 'YouTube'];
const NON_LATIN = [
  'Привет, Пак 137',
  '童子軍活動',
  'مرحبا بالجميع',
  'שלום לכולם',
  'café résumé naïve',
  'Ünïcödé',
];
const EMOJI = ['\u{1F389}', '\u{1F332}', '\u{2B50}', '\u{1F3D5}\u{FE0F}', '\u{1F44D}\u{1F3FD}'];
const SHOUTS = [
  'LAST CHANCE FOR DONATIONS TO TOYS FOR TOTS',
  'DO NOT MISS THIS',
  'BRING A CAN OF FOOD',
  'SIGN UP TODAY!!',
  'Big news!!',
];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTHS_SHORT = [
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
];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ---------- the clock for a case ---------- */

export interface CaseClock {
  today: { year: number; month: number; day: number };
  programYearStartMonth: number;
}

/**
 * The fixed clock a case is filled with. Chosen from the seed so the run covers the December to
 * January rollover, leap days and the program year edge, not only today's date.
 */
export function generateClock(seed: number): CaseClock {
  const r = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const today = r.weighted<{ year: number; month: number; day: number }>([
    [4, { year: 2026, month: 11, day: 21 }],
    [3, { year: 2026, month: 12, day: r.int(15, 31) }],
    [3, { year: 2027, month: 1, day: r.int(1, 12) }],
    [1, { year: 2027, month: 12, day: 31 }],
    [1, { year: 2028, month: 2, day: 29 }],
    [1, { year: 2026, month: 8, day: 31 }],
    [2, { year: r.int(2025, 2030), month: r.int(1, 12), day: r.int(1, 28) }],
  ]);
  return {
    today,
    programYearStartMonth: r.weighted([
      [8, 9],
      [1, 1],
      [1, r.int(1, 12)],
    ]),
  };
}

/* ---------- pieces ---------- */

class Gen {
  /** Share of hostile bits, between 0 and about 0.25, fixed per case. */
  hostile: number;
  messy: number;
  constructor(private r: Rng) {
    this.hostile = r.weighted([
      [6, 0],
      [3, 0.05],
      [1, 0.25],
    ]);
    this.messy = r.weighted([
      [4, 0.1],
      [3, 0.35],
      [1, 0.8],
    ]);
  }

  /** A date as written in a paste, in every format the date helper claims to read. */
  date(): string {
    const r = this.r;
    // A quarter of dates sit around the December to January turn.
    const month = r.chance(0.3) ? r.pick([12, 12, 1, 1, 2, 11]) : r.int(1, 12);
    const day = r.chance(0.04) ? r.pick([29, 30, 31, 0, 32, 99]) : r.int(1, 28);
    const word = r.weighted<'short' | 'long' | 'sept' | 'dotted' | 'num'>([
      [4, 'short'],
      [3, 'long'],
      [1, 'sept'],
      [1, 'dotted'],
      [3, 'num'],
    ]);
    const lead = r.chance(0.2)
      ? `${r.chance(0.5) ? r.pick(DAYS_SHORT) : r.pick(DAYS_LONG)}${r.pick([',', '', '.'])} `
      : '';
    const ord = r.chance(0.1) ? r.pick(['st', 'nd', 'rd', 'th']) : '';
    const year = r.chance(0.2)
      ? `${r.pick([', ', ' '])}${r.pick([2026, 2027, 2028, 2025, 1999])}`
      : '';
    const name = (m: number): string => {
      if (word === 'long') return MONTHS_LONG[m - 1] as string;
      if (word === 'sept' && m === 9) return r.pick(['Sept', 'Sept.', 'September']);
      if (word === 'dotted') return `${MONTHS_SHORT[m - 1]}.`;
      return MONTHS_SHORT[m - 1] as string;
    };
    const sep = r.pick(['-', ' - ', '–', ' to ', ' through ', ' thru ']);
    const range = r.chance(0.2);
    if (word === 'num') {
      const y = r.chance(0.25) ? `/${r.pick(['26', '27', '2026', '2027'])}` : '';
      if (!range) return `${lead}${month}/${day}${y}`;
      return `${lead}${month}/${day}${y}${sep}${r.pick([month, (month % 12) + 1])}/${r.int(1, 28)}`;
    }
    const first = `${lead}${name(month)} ${day}${ord}`;
    if (!range) return `${first}${year}`;
    const second = r.chance(0.5)
      ? `${name((month % 12) + 1)} ${r.int(1, 28)}`
      : `${r.int(Math.min(day + 1, 28), 28)}`;
    return `${first}${sep}${second}${year}`;
  }

  tag(): string {
    return this.r.pick([
      'Virtual',
      'In person',
      'In Person',
      '(In Person)',
      '(Virtual)',
      'TBD',
      'RSVP',
      'Please RSVP!',
      'Please RSVP',
    ]);
  }

  url(): string {
    const r = this.r;
    const good = [
      () => `https://pack137.trooptrack.com/plan/events/${r.int(1000000, 1999999)}`,
      () => `https://www.cubpack137.com/${r.pick(['news', 'events', 'a b'])}`,
      () => `http://example.org/page?x=${r.int(1, 99)}&y=2`,
      () =>
        `mailto:cranfordpack137+volunteer@gmail.com?subject=${r.pick(['Help%20needed', 'Can I help?', 'Hi & hello'])}&body=${r.pick(['I can help', 'Name: %0D%0APhone:', 'a b c'])}`,
      () => 'mailto:someone@example.com',
      () => 'https://docs.google.com/forms/d/e/1FAIpQLS/viewform?usp=sf_link',
    ];
    const bad = [
      () => 'meet.google.com/vgn-rwmf-fmz',
      () => 'https://pack137.trooptrack.com/manage/events/' + r.int(1, 99),
      () => 'javascript:alert(1)',
      () => ' JaVaScRiPt:alert(document.cookie)',
      () => 'data:text/html,<script>alert(1)</script>',
      () => '/plan/events/12',
      () => '#',
      () => '',
      () => 'ftp://example.com/x',
      () => 'https://',
      () => 'vbscript:msgbox(1)',
    ];
    return r.chance(this.messy * 0.5) ? r.pick(bad)() : r.pick(good)();
  }

  link(text: string): string {
    const r = this.r;
    const href = this.url();
    const attrs = r.chance(0.7) ? ' target="_blank" rel="noopener noreferrer"' : '';
    if (r.chance(0.05)) return `<a${attrs}>${text}</a>`;
    const q = r.pick(['"', '"', '"', "'"]);
    return `<a href=${q}${href.replace(/&(?!amp;)/g, '&amp;').replace(/"/g, '&quot;')}${q}${attrs}>${text}</a>`;
  }

  /** A short run of plain text with the oddities a real paste carries. */
  text(): string {
    const r = this.r;
    let s = r.chance(0.5) ? r.pick(EVENTS) : r.pick(SENTENCES);
    if (r.chance(this.messy * 0.5))
      s = s.replace(/ /, r.pick(['  ', '&nbsp;', ' &nbsp; ', '&nbsp;&nbsp;']));
    if (r.chance(this.messy * 0.3)) s = s.toUpperCase();
    if (r.chance(this.messy * 0.3)) s += r.pick(['!!', '!!!', ' !!']);
    if (r.chance(this.messy * 0.3)) s = s.replace(/ and /, r.pick([' & ', ' &amp; ']));
    if (r.chance(this.messy * 0.15)) s = r.pick(SHOUTS);
    if (r.chance(this.messy * 0.1)) s += ` ${r.pick(EMOJI)}`;
    if (r.chance(this.messy * 0.1)) s += ` ${r.pick(NON_LATIN)}`;
    if (r.chance(this.messy * 0.08)) s = 'On going';
    if (r.chance(0.04)) s += ' SignUpGenius';
    if (r.chance(0.03)) s += ' 1,000,000 a,b,c,d 1 2 3 4';
    return s.replace(/&(?!(?:amp|nbsp);)/g, '&amp;').replace(/<(?!\/?\w)/g, '&lt;');
  }

  /** Inline content: text, links, bold, tags, contacts, titles, br. */
  inline(): string {
    const r = this.r;
    const parts: string[] = [];
    const count = r.int(1, 4);
    for (let i = 0; i < count; i++) {
      parts.push(
        r.weighted<() => string>([
          [5, () => this.text()],
          [3, () => this.link(this.linkText())],
          [2, () => `<strong>${this.text()}</strong>`],
          [1, () => `<b>${this.text()}</b>`],
          [1, () => `<em>${this.text()}</em>`],
          [1, () => `<i>${this.text()}</i>`],
          [1, () => `<u>${this.text()}</u>`],
          [2, () => this.tag()],
          [1, () => `<span style="color: rgb(226, 80, 65);">${this.text()}</span>`],
          [1, () => `<span style="color: rgb(65, 168, 95);">${this.text()}</span>`],
          [1, () => `<br>`],
          [1, () => `<br><br><br>`],
          [1, () => `<br/>${this.text()}`],
          [1, () => this.struck(this.text())],
        ])(),
      );
    }
    return parts.join(r.pick([' ', ' ', '', '\n', '  ']));
  }

  linkText(): string {
    const r = this.r;
    let s = r.pick(EVENTS);
    if (r.chance(0.2)) s += ` | ${r.pick(SITES)}`;
    if (r.chance(0.15)) s += ` ${this.tag()}`;
    if (r.chance(0.1)) s = s.toUpperCase();
    return s;
  }

  struck(inner: string): string {
    const r = this.r;
    switch (r.int(0, 3)) {
      case 0:
        return `<s>${inner}</s>`;
      case 1:
        return `<strike>${inner}</strike>`;
      case 2:
        return `<del>${inner}</del>`;
      default:
        return `<span style="text-decoration: line-through;">${inner}</span>`;
    }
  }

  /** A list item that usually starts with a date. */
  dateItem(): string {
    const r = this.r;
    let date = this.date();
    if (r.chance(0.12)) date = this.struck(date);
    const event = this.link(this.linkText());
    const plain = r.chance(0.2) ? r.pick(EVENTS) : event;
    let tail = '';
    if (r.chance(0.35)) tail += ` ${this.tag()}`;
    if (r.chance(0.12)) tail += ` - ${r.pick(NAMES)}`;
    if (r.chance(0.1)) tail += `<br>${this.text()}`;
    if (r.chance(0.08)) tail += ` ${r.pick(SHOUTS)}`;
    const sep = r.pick([' ', ' - ', ': ', '&nbsp;', '  ', '\n']);
    const strong = r.chance(0.1);
    const head = strong ? `<strong>${date}</strong>` : date;
    return `${head}${sep}${plain}${tail}`;
  }

  linkItem(): string {
    const r = this.r;
    let s = this.link(this.linkText());
    if (r.chance(0.3)) s += ` - ${r.pick(NAMES)}`;
    if (r.chance(0.2)) s += `<br>${this.text()}`;
    if (r.chance(0.1)) s += ` (${r.pick(SITES)})`;
    return s;
  }

  list(depth: number, kind: 'date' | 'link' | 'text'): string {
    const r = this.r;
    const tag = r.chance(0.6) ? 'ol' : 'ul';
    const n = r.int(1, 8);
    const items: string[] = [];
    for (let i = 0; i < n; i++) {
      const style = r.chance(0.7)
        ? ` style="text-align: left; font-size: 18px;"${r.chance(0.5) ? ' id="isPasted"' : ''}`
        : '';
      let body =
        kind === 'date' ? this.dateItem() : kind === 'link' ? this.linkItem() : this.inline();
      if (depth < 2 && r.chance(0.12))
        body += `\n${this.list(depth + 1, r.pick(['date', 'link', 'text'] as const))}`;
      items.push(`<li${style}>${body}</li>`);
    }
    if (r.chance(0.04)) items.splice(r.int(0, items.length), 0, `<p>stray</p>`);
    return `<${tag}>\n${items.join('\n')}\n</${tag}>`;
  }

  heading(): string {
    const r = this.r;
    const text = r.pick(HEADINGS);
    const level = r.int(1, 4);
    return r.weighted<string>([
      [3, `<h${level}>${text}</h${level}>`],
      [
        4,
        `<p style="text-align: left;"><span style="font-size: 18px;"><strong>${text}</strong></span></p>`,
      ],
      [2, `<p><b>${text}</b></p>`],
      [1, `<div><strong>${text}</strong></div>`],
      [1, `<p><strong>${text}:</strong></p>`],
      [1, `<h${level}>${this.text()}</h${level}>`],
    ]);
  }

  image(): string {
    const r = this.r;
    const src = r.pick([
      'https://styles.trooptrack.com/uploads/1795131915582.png',
      'https://example.com/a.jpg',
      'http://example.com/b.png',
      'data:image/png;base64,iVBORw0KGgo=',
      'javascript:alert(1)',
      '',
    ]);
    const alt = r.chance(0.5)
      ? ` alt="${r.pick(['Scouts at camp', 'Logo', '', 'A "quoted" alt'])}"`.replace(
          /"quoted"/,
          '&quot;quoted&quot;',
        )
      : '';
    const size = r.chance(0.6) ? ` width="${r.int(20, 800)}" height="${r.int(20, 600)}"` : '';
    const style = r.chance(0.5)
      ? ' style="box-sizing: border-box; max-width: 100%; cursor: pointer;" class="fr-fic fr-dib" id="isPasted"'
      : '';
    return `<img src="${src}"${alt}${size}${style}>`;
  }

  table(depth: number): string {
    const r = this.r;
    const rows = r.int(1, 3);
    const cols = r.int(1, 3);
    const out: string[] = ['<table style="width: 100%;">', '<tbody>'];
    for (let i = 0; i < rows; i++) {
      out.push('<tr>');
      for (let j = 0; j < cols; j++) {
        const inner = r.chance(0.3) ? this.image() : this.block(depth + 1);
        out.push(`<td style="width: ${r.int(10, 60)}.0000%;">${inner}</td>`);
      }
      out.push('</tr>');
    }
    out.push('</tbody>', '</table>');
    return out.join('\n');
  }

  paragraph(): string {
    const r = this.r;
    const tag = r.pick(['p', 'p', 'p', 'div']);
    const style = r.chance(0.5) ? ' style="text-align: left;"' : '';
    return `<${tag}${style}>${this.inline()}</${tag}>`;
  }

  hostileBit(): string {
    const r = this.r;
    return r.pick([
      '<script>alert(1)</script>',
      '<script src="https://evil.example/x.js"></script>',
      '<img src="x" onerror="alert(1)">',
      '<img src=x onerror=alert(1)//',
      '<iframe src="https://evil.example"></iframe>',
      '<style>body{background:red}.x{color:#123456}</style>',
      '<!-- a comment -->',
      '<!--[if mso]><table><tr><td><![endif]-->',
      '<!--[if !mso]><!--><p>not mso</p><!--<![endif]-->',
      '<p onclick="steal()">click <b>me',
      '<a href="javascript:alert(1)" onmouseover="x()">hover',
      '<div><span><b><i>unclosed',
      '</div></span></p>',
      '<object data="x.swf"></object><embed src="x">',
      '<form action="https://evil.example"><input name=a></form>',
      '<svg onload=alert(1)><circle/></svg>',
      '<p>1 < 2 && 3 > 2</p>',
      '<<script>alert(1)//<</script>',
      '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
      '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
      '<noscript><p>no script</p></noscript>',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
      '<base href="https://evil.example/">',
      '<p style="background:url(javascript:alert(1))">x</p>',
      '\u0000<p>nul\u0000</p>',
      `<p>${EM_DASH} em dash ${EM_DASH} here</p>`,
      '&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;',
    ]);
  }

  block(depth: number): string {
    const r = this.r;
    return r.weighted<() => string>([
      [10, () => this.paragraph()],
      [6, () => this.heading()],
      [5, () => this.list(0, 'date')],
      [3, () => this.list(0, 'link')],
      [2, () => this.list(0, 'text')],
      [2, () => this.image()],
      [depth < 2 ? 1.5 : 0, () => this.table(depth)],
      [1, () => '<hr>'],
      [1, () => '<br><br><br><br>'],
      [1, () => `<p>${this.text()}</p>`],
      [1, () => `<p>&nbsp;</p>`],
      [this.hostile * 12, () => this.hostileBit()],
    ])();
  }
}

/** Wrapper attributes the TroopTrack editor and copy-paste leave behind. */
function wrapperOpen(r: Rng): { open: string; close: string } {
  const tag = r.weighted([
    [4, 'div'],
    [2, 'span'],
    [1, 'section'],
    [1, 'font'],
    [1, 'center'],
  ]);
  const attrs: string[] = [];
  if (r.chance(0.7))
    attrs.push(`style="font-family: Arial;${r.chance(0.3) ? ' text-align: center;' : ''}"`);
  if (r.chance(0.3)) attrs.push(`class="fr-view c${r.int(1, 99)}"`);
  if (r.chance(0.3)) attrs.push('id="isPasted"');
  if (r.chance(0.2)) attrs.push(`data-id="${r.int(1, 9999)}" data-test='x"y'`);
  if (r.chance(0.05)) attrs.push('onclick="alert(1)"');
  return { open: `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`, close: `</${tag}>` };
}

/**
 * Builds the paste for one seed. The same seed always gives the same string.
 * Sizes stay under about 30 KB so the paste fits comfortably in the app's limits.
 */
export function generatePaste(seed: number): string {
  const r = new Rng(seed >>> 0);
  const g = new Gen(r);

  const shape = r.weighted<'dates' | 'links' | 'help' | 'message' | 'mixed' | 'tiny'>([
    [4, 'dates'],
    [3, 'links'],
    [2, 'help'],
    [3, 'message'],
    [3, 'mixed'],
    [1, 'tiny'],
  ]);
  const body: string[] = [];
  const add = (s: string): number => body.push(s);

  switch (shape) {
    case 'dates':
      add(g.heading());
      add(g.list(0, 'date'));
      if (r.chance(0.7)) {
        add(g.heading());
        add(g.list(0, 'date'));
      }
      if (r.chance(0.5)) add('<hr>');
      if (r.chance(0.5)) add(g.heading() + g.list(0, 'link'));
      break;
    case 'links':
      if (r.chance(0.4)) add(g.image());
      add(g.paragraph());
      add(g.list(0, 'link'));
      break;
    case 'help':
      add(g.paragraph());
      add(
        `<p>We need <strong>volunteers</strong> to help. ${g.link('Email us')} - ${r.pick(NAMES)}</p>`,
      );
      add(g.paragraph());
      if (r.chance(0.5)) add(g.list(0, 'text'));
      break;
    case 'message':
      for (let i = r.int(1, 4); i > 0; i--) add(g.paragraph());
      if (r.chance(0.5)) add(g.link(g.linkText()));
      break;
    case 'mixed':
      for (let i = r.int(3, 10); i > 0; i--) add(g.block(0));
      break;
    case 'tiny':
      add(r.pick(['', ' ', 'plain text only', '<p></p>', g.hostileBit(), g.date(), g.text()]));
      break;
  }
  // Extra random blocks, more for messy cases.
  for (let i = r.int(0, 2); i > 0 && r.chance(0.5 + g.messy / 2); i--) {
    body.splice(r.int(0, body.length), 0, g.block(0));
  }
  if (g.hostile > 0 && r.chance(0.7)) body.splice(r.int(0, body.length), 0, g.hostileBit());

  let html = body.join(r.pick(['\n', '\n', '\n\n', '']));
  // Wrapper nesting: usually shallow, sometimes very deep.
  const depth = r.weighted([
    [5, r.int(0, 3)],
    [3, r.int(3, 10)],
    [1.5, r.int(10, 25)],
    [0.7, r.int(25, 60)],
  ]);
  const open: string[] = [];
  const close: string[] = [];
  for (let i = 0; i < depth; i++) {
    const w = wrapperOpen(r);
    open.push(w.open);
    close.unshift(w.close);
  }
  html = open.join('\n') + '\n' + html + '\n' + (r.chance(0.05) ? '' : close.join('\n'));
  if (r.chance(0.03))
    html = `<!DOCTYPE html><html><head><title>t</title></head><body>${html}</body></html>`;
  // Never exceed the size the tests promise.
  return html.length > 30000 ? html.slice(0, 30000) : html;
}

/** One line for a failure message: the seed, how to replay it and the paste itself. */
export function describeCase(seed: number, paste: string = generatePaste(seed)): string {
  return [
    `fuzz seed ${seed} (replay: FUZZ_SEED=${seed} npm test -- fuzz)`,
    `clock: ${JSON.stringify(generateClock(seed))}`,
    '--- paste ---',
    paste,
    '--- end paste ---',
  ].join('\n');
}
