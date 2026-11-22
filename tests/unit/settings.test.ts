/**
 * Settings validation (build spec 9; ADR 0004, Settings). Settings are untrusted once they can be
 * edited or opened from a draft file: every value is checked, and a bad one becomes its default
 * with one plain message.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  validateSettings,
  type PackSettings,
  type SettingsResult,
} from '../../src/core/settings';

const EM_DASH = String.fromCharCode(0x2014);

/** The defaults with some values replaced, as loose data the way a file would hold it. */
function withValues(values: Record<string, unknown>): Record<string, unknown> {
  return { ...defaultSettings(), ...values };
}

function paths(result: SettingsResult): string[] {
  return result.problems.map((p) => p.path.join('.'));
}

function expectPlain(result: SettingsResult): void {
  for (const problem of result.problems) {
    expect(problem.message).not.toBe('');
    expect(problem.message).not.toContain(EM_DASH);
    expect(problem.message.length).toBeLessThan(200);
  }
}

describe('validateSettings: valid input', () => {
  it('passes the defaults with no problems', () => {
    const result = validateSettings(defaultSettings());
    expect(result.problems).toEqual([]);
    expect(result.settings).toEqual(defaultSettings());
  });

  it('builds a fresh object every time', () => {
    const given = defaultSettings();
    const result = validateSettings(given);
    expect(result.settings).not.toBe(given);
    expect(result.settings.email).not.toBe(given.email);
    expect(result.settings.standingLinks).not.toBe(given.standingLinks);
    expect(result.settings.standingLinks[0]).not.toBe(given.standingLinks[0]);
  });

  it('keeps valid custom values', () => {
    const custom: PackSettings = {
      logoUrl: 'https://example.org/logo.png',
      standingLinks: [
        { label: 'Calendar', url: 'http://example.org/calendar' },
        { label: 'Store', url: 'https://example.org/store?item=1&size=2' },
      ],
      email: {
        contact: 'pack@example.org',
        volunteer: 'pack+helpers@example.org',
        feedback: 'news.letter_1@mail.example.org',
      },
      photoFormUrl: 'https://example.org/photos',
      yearAtAGlanceUrl: 'http://example.org/year',
      programYearStartMonth: 1,
    };
    const result = validateSettings(custom);
    expect(result.problems).toEqual([]);
    expect(result.settings).toEqual(custom);
  });

  it('trims spaces around addresses and labels without complaint', () => {
    const result = validateSettings(
      withValues({
        logoUrl: '  https://example.org/logo.png ',
        email: { contact: ' pack@example.org ', volunteer: 'v@example.org', feedback: 'f@x.org' },
        standingLinks: [{ label: '  Calendar ', url: ' https://example.org/c ' }],
      }),
    );
    expect(result.problems).toEqual([]);
    expect(result.settings.logoUrl).toBe('https://example.org/logo.png');
    expect(result.settings.email.contact).toBe('pack@example.org');
    expect(result.settings.standingLinks).toEqual([
      { label: 'Calendar', url: 'https://example.org/c' },
    ]);
  });

  it('gives the same answer when its own output is checked again', () => {
    const once = validateSettings(withValues({ logoUrl: ' https://example.org/a b.png ' }));
    const twice = validateSettings(once.settings);
    expect(twice.problems).toEqual([]);
    expect(twice.settings).toEqual(once.settings);
  });
});

describe('validateSettings: not an object', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'settings'],
    ['a number', 7],
    ['an array', [1, 2, 3]],
    ['a boolean', true],
  ])('returns the defaults with one problem for %s', (_name, raw) => {
    const result = validateSettings(raw);
    expect(result.settings).toEqual(defaultSettings());
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.path).toEqual([]);
    expectPlain(result);
  });

  it('reports every missing value of an empty object', () => {
    const result = validateSettings({});
    expect(result.settings).toEqual(defaultSettings());
    expect(paths(result).sort()).toEqual(
      [
        'email',
        'logoUrl',
        'photoFormUrl',
        'programYearStartMonth',
        'standingLinks',
        'yearAtAGlanceUrl',
      ].sort(),
    );
    expectPlain(result);
  });
});

describe('validateSettings: emails', () => {
  const bad: [string, unknown][] = [
    ['hidden bcc', 'pack@x.org?bcc=evil@x.org'],
    ['hidden subject', 'pack@x.org?subject=hi'],
    ['mailto prefix', 'mailto:pack@x.org'],
    ['mailto prefix in capitals', 'MAILTO:pack@x.org'],
    ['two addresses with a comma', 'pack@x.org,evil@x.org'],
    ['two addresses with a semicolon', 'pack@x.org;evil@x.org'],
    ['ampersand', 'pack@x.org&bcc=evil@x.org'],
    ['angle brackets', 'Pack <pack@x.org>'],
    ['closing angle bracket', 'pack@x.org>'],
    ['double quote', '"pack"@x.org'],
    ['single quote', "pa'ck@x.org"],
    ['space inside', 'pa ck@x.org'],
    ['tab inside', 'pa\tck@x.org'],
    ['line break inside', 'pack@x.org\nbcc:evil@x.org'],
    ['null character', 'pack\u0000@x.org'],
    ['no at sign', 'pack.x.org'],
    ['two at signs', 'pack@evil@x.org'],
    ['nothing before the at sign', '@x.org'],
    ['nothing after the at sign', 'pack@'],
    ['percent escape for a question mark', 'pack@x.org%3Fbcc=evil'],
    ['empty', ''],
    ['only spaces', '   '],
    ['too long', `${'a'.repeat(250)}@x.org`],
    ['a number', 42],
    ['null', null],
    ['an object', { address: 'pack@x.org' }],
    ['an array', ['pack@x.org']],
  ];

  it.each(bad)('refuses %s', (_name, value) => {
    for (const key of ['contact', 'volunteer', 'feedback'] as const) {
      const email = { ...defaultSettings().email, [key]: value };
      const result = validateSettings(withValues({ email }));
      expect(result.settings.email[key]).toBe(defaultSettings().email[key]);
      expect(result.problems.map((p) => p.path)).toEqual([['email', key]]);
      expectPlain(result);
    }
  });

  it('accepts an address of exactly 254 characters', () => {
    const address = `${'a'.repeat(254 - '@x.org'.length)}@x.org`;
    expect(address).toHaveLength(254);
    const email = { ...defaultSettings().email, contact: address };
    const result = validateSettings(withValues({ email }));
    expect(result.problems).toEqual([]);
    expect(result.settings.email.contact).toBe(address);
  });

  it('uses the default emails when the email group is not an object', () => {
    const result = validateSettings(withValues({ email: 'pack@x.org' }));
    expect(result.settings.email).toEqual(defaultSettings().email);
    expect(paths(result)).toEqual(['email']);
  });

  it('reports each missing email of an empty group', () => {
    const result = validateSettings(withValues({ email: {} }));
    expect(result.settings.email).toEqual(defaultSettings().email);
    expect(paths(result)).toEqual(['email.contact', 'email.volunteer', 'email.feedback']);
  });
});

describe('validateSettings: addresses of pages and the logo', () => {
  const badUrls: [string, unknown][] = [
    ['javascript', 'javascript:alert(1)'],
    ['javascript with a web look', 'javascript://example.org/%0aalert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['file', 'file:///etc/passwd'],
    ['mailto', 'mailto:pack@x.org'],
    ['no scheme', 'example.org/page'],
    ['scheme relative', '//example.org/page'],
    ['scheme only', 'https://'],
    ['empty', ''],
    ['a number', 12],
    ['null', null],
    ['an object', { href: 'https://example.org/' }],
    ['too long', `https://example.org/${'a'.repeat(3000)}`],
  ];

  it.each(badUrls)('refuses %s for every address setting', (_name, value) => {
    for (const key of ['logoUrl', 'photoFormUrl', 'yearAtAGlanceUrl'] as const) {
      const result = validateSettings(withValues({ [key]: value }));
      expect(result.settings[key]).toBe(defaultSettings()[key]);
      expect(paths(result)).toEqual([key]);
      expectPlain(result);
    }
  });

  it('wants https for the logo but takes http for the links', () => {
    const result = validateSettings(
      withValues({
        logoUrl: 'http://example.org/logo.png',
        photoFormUrl: 'http://example.org/photos',
        yearAtAGlanceUrl: 'HTTP://example.org/year',
      }),
    );
    expect(paths(result)).toEqual(['logoUrl']);
    expect(result.settings.logoUrl).toBe(defaultSettings().logoUrl);
    expect(result.settings.photoFormUrl).toBe('http://example.org/photos');
    expect(result.settings.yearAtAGlanceUrl).toBe('HTTP://example.org/year');
  });

  it('keeps an address that only needs escaping later, as the renderer does', () => {
    const odd = 'https://x.org/"><img src=x onerror=alert(1)>';
    const result = validateSettings(withValues({ photoFormUrl: odd }));
    expect(result.problems).toEqual([]);
    expect(result.settings.photoFormUrl).toBe(odd);
  });
});

describe('validateSettings: standing links', () => {
  it('drops bad links, keeps the good ones in order and reports each bad one', () => {
    const result = validateSettings(
      withValues({
        standingLinks: [
          { label: 'One', url: 'https://example.org/1' },
          { label: 'Bad address', url: 'javascript:alert(1)' },
          { label: '', url: 'https://example.org/3' },
          { label: 'Four', url: 'https://example.org/4' },
          'https://example.org/5',
          { label: 'x'.repeat(61), url: 'https://example.org/6' },
          { label: 7, url: 'https://example.org/7' },
          { label: 'Mail', url: 'mailto:pack@x.org' },
          null,
          { label: 'Ten', url: 'data:text/html,hi' },
        ],
      }),
    );
    expect(result.settings.standingLinks).toEqual([
      { label: 'One', url: 'https://example.org/1' },
      { label: 'Four', url: 'https://example.org/4' },
    ]);
    expect(result.problems.map((p) => p.path)).toEqual([
      ['standingLinks', 1, 'url'],
      ['standingLinks', 2, 'label'],
      ['standingLinks', 4],
      ['standingLinks', 5, 'label'],
      ['standingLinks', 6, 'label'],
      ['standingLinks', 7, 'url'],
      ['standingLinks', 8],
      ['standingLinks', 9, 'url'],
    ]);
    expectPlain(result);
  });

  it('accepts a label of exactly 60 characters and exactly 12 links', () => {
    const links = Array.from({ length: 12 }, (_, i) => ({
      label: i === 0 ? 'x'.repeat(60) : `Link ${i}`,
      url: `https://example.org/${i}`,
    }));
    const result = validateSettings(withValues({ standingLinks: links }));
    expect(result.problems).toEqual([]);
    expect(result.settings.standingLinks).toEqual(links);
  });

  it('keeps only the first 12 of 1000 links, with a short list of problems', () => {
    const links = Array.from({ length: 1000 }, (_, i) => ({
      label: `Link ${i}`,
      url: i % 2 === 0 ? `https://example.org/${i}` : 'javascript:alert(1)',
    }));
    const result = validateSettings(withValues({ standingLinks: links }));
    expect(result.settings.standingLinks).toHaveLength(6);
    expect(result.settings.standingLinks[0]).toEqual({
      label: 'Link 0',
      url: 'https://example.org/0',
    });
    expect(result.problems.length).toBeLessThanOrEqual(13);
    expect(paths(result)).toContain('standingLinks');
    expectPlain(result);
  });

  it.each([
    ['an empty list', []],
    ['a list with no usable link', [{ label: 'Bad', url: 'javascript:alert(1)' }]],
    ['not a list', { 0: { label: 'One', url: 'https://example.org/1' }, length: 1 }],
    ['a string', 'https://example.org/'],
  ])('falls back to the default links for %s', (_name, value) => {
    const result = validateSettings(withValues({ standingLinks: value }));
    expect(result.settings.standingLinks).toEqual(defaultSettings().standingLinks);
    expect(paths(result)).toContain('standingLinks');
    expectPlain(result);
  });

  it('keeps no extra fields of a link', () => {
    const result = validateSettings(
      withValues({
        standingLinks: [{ label: 'One', url: 'https://example.org/1', onclick: 'alert(1)' }],
      }),
    );
    expect(Object.keys(result.settings.standingLinks[0] ?? {}).sort()).toEqual(['label', 'url']);
  });
});

describe('validateSettings: program year start month', () => {
  it.each([1, 6, 12])('accepts %s', (month) => {
    const result = validateSettings(withValues({ programYearStartMonth: month }));
    expect(result.problems).toEqual([]);
    expect(result.settings.programYearStartMonth).toBe(month);
  });

  it.each([
    0,
    13,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '9',
    null,
    [9],
    { month: 9 },
    true,
  ])('refuses %s', (month) => {
    const result = validateSettings(withValues({ programYearStartMonth: month }));
    expect(result.settings.programYearStartMonth).toBe(defaultSettings().programYearStartMonth);
    expect(paths(result)).toEqual(['programYearStartMonth']);
    expectPlain(result);
  });
});

describe('validateSettings: hostile input', () => {
  it('ignores prototype keys and leaves Object.prototype alone', () => {
    const raw: unknown = JSON.parse(`{
      "__proto__": { "polluted": "yes", "logoUrl": "https://evil.example/logo.png" },
      "constructor": { "prototype": { "polluted": "yes" } },
      "prototype": { "polluted": "yes" },
      "email": {
        "__proto__": { "contact": "evil@evil.example", "polluted": "yes" },
        "constructor": { "prototype": { "polluted": "yes" } }
      },
      "standingLinks": [
        { "__proto__": { "label": "Evil", "url": "https://evil.example/" } },
        { "label": "Good", "url": "https://example.org/", "__proto__": { "polluted": "yes" } }
      ]
    }`);
    const result = validateSettings(raw);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(result.settings.logoUrl).toBe(defaultSettings().logoUrl);
    expect(result.settings.email).toEqual(defaultSettings().email);
    expect(result.settings.standingLinks).toEqual([{ label: 'Good', url: 'https://example.org/' }]);
    expect(Object.getPrototypeOf(result.settings)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.settings.email)).toBe(Object.prototype);
    expect(Object.keys(result.settings).sort()).toEqual(Object.keys(defaultSettings()).sort());
    expect(Object.keys(result.settings.email).sort()).toEqual(['contact', 'feedback', 'volunteer']);
  });

  it('does not read values through the prototype chain', () => {
    const proto = { logoUrl: 'https://evil.example/logo.png', programYearStartMonth: 3 };
    const raw: unknown = Object.create(proto);
    const result = validateSettings(raw);
    expect(result.settings).toEqual(defaultSettings());
  });

  it('keeps no extra fields', () => {
    const result = validateSettings(
      withValues({
        extra: 'x',
        script: '<script>alert(1)</script>',
        email: { ...defaultSettings().email, cc: 'evil@x.org' },
      }),
    );
    expect(result.problems).toEqual([]);
    expect(result.settings).toEqual(defaultSettings());
  });

  it('survives numbers where strings belong, and the reverse', () => {
    const result = validateSettings({
      logoUrl: 1,
      standingLinks: 2,
      email: { contact: 3, volunteer: 4, feedback: 5 },
      photoFormUrl: 6,
      yearAtAGlanceUrl: 7,
      programYearStartMonth: 'September',
    });
    expect(result.settings).toEqual(defaultSettings());
    expect(result.problems).toHaveLength(8);
    expectPlain(result);
  });

  it('never throws, even when reading a value throws', () => {
    const trap: unknown = new Proxy(
      {},
      {
        get: () => {
          throw new Error('trap');
        },
        getOwnPropertyDescriptor: () => {
          throw new Error('trap');
        },
        has: () => {
          throw new Error('trap');
        },
      },
    );
    const weird: unknown[] = [
      trap,
      Symbol('s'),
      () => 1,
      10n,
      new Date(0),
      new Map([['logoUrl', 'https://example.org/']]),
      { email: trap },
      { standingLinks: [trap] },
    ];
    for (const raw of weird) {
      const result = validateSettings(raw);
      expect(result.settings).toEqual(defaultSettings());
      expect(result.problems.length).toBeGreaterThan(0);
      expectPlain(result);
    }
  });

  it('handles a very long value quickly and does not keep it', () => {
    const big = 'a'.repeat(1_000_000);
    const result = validateSettings({
      logoUrl: `https://example.org/${big}`,
      standingLinks: [{ label: big, url: `https://example.org/${big}` }],
      email: { contact: `${big}@x.org`, volunteer: `pack@${big}.org`, feedback: big },
      photoFormUrl: `https://${big}`,
      yearAtAGlanceUrl: big,
      programYearStartMonth: 9,
    });
    expect(result.settings).toEqual(defaultSettings());
    expect(JSON.stringify(result).length).toBeLessThan(10_000);
  });
});
