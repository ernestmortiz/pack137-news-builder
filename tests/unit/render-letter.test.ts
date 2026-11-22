import { describe, expect, it } from 'vitest';
import { packConfig } from '../../src/config/pack.config';
import { emptyLetter, letterWords, readTimeText, type LetterForm } from '../../src/core/letter';
import { lintOutput } from '../../src/core/lint-output';
import { renderLetter } from '../../src/core/render-letter';

const t = (text: string, extra: { marks?: ('strong' | 'em')[]; href?: string } = {}) => ({
  kind: 'text' as const,
  text,
  marks: extra.marks ?? [],
  ...(extra.href === undefined ? {} : { href: extra.href }),
});

const EM = String.fromCharCode(0x2014);

function base(): LetterForm {
  const l = emptyLetter({ year: 2026, month: 11 });
  l.summary = 'Fall camping and a big month.';
  l.intro = [t('Thank you for a full November.')];
  l.story.title = 'Fall camping at Watchung';
  l.closing.enabled = false;
  l.photoAsk.enabled = false;
  l.around.enabled = false;
  l.horizon.enabled = false;
  return l;
}

function full(): LetterForm {
  const l = base();
  l.story.blocks = [
    {
      kind: 'contributor',
      name: 'Justin Daly',
      role: 'Program Director',
      parts: [
        { kind: 'paragraph', text: [t('First paragraph.')] },
        { kind: 'list', items: [{ lead: 'Camp Crafts', text: [t('Kristin Moreno')] }] },
      ],
    },
    {
      kind: 'photo',
      photo: {
        src: 'https://x.org/a.jpg',
        alt: 'Campfire',
        width: 400,
        caption: 'Around the fire.',
      },
    },
    {
      kind: 'stats',
      stats: [
        { value: '73', text: 'campers' },
        { value: '6', text: 'patrols' },
      ],
    },
    {
      kind: 'sidebar',
      title: 'Make it at home',
      source: 'Adapted from koa.com',
      body: [[t('Ingredients:', { marks: ['strong'] }), t(' flour.')], [t('Mix it.')]],
      photo: { src: 'https://x.org/b.jpg', alt: 'Bannock', caption: 'Fresh bannock.' },
    },
  ];
  l.closing = {
    enabled: true,
    paragraphs: [[t('Thank you all.')]],
    thanks: [[t('Thank you to '), t('Justin Daly', { marks: ['strong'] }), t('.')]],
    closingLine: 'See you at the next adventure.',
    signer: 'James Mortimer',
    signerRole: 'Committee Chair',
  };
  l.photoAsk = {
    enabled: true,
    text: 'Send photos.',
    linkText: 'Send them here',
    url: 'https://forms.gle/x',
  };
  l.around = {
    enabled: true,
    intro: 'Moments from the month.',
    items: [
      {
        lead: 'Food drive',
        text: [t('Bags collected.')],
        link: { text: 'Read the story', url: 'https://tapinto.net/s' },
      },
    ],
  };
  l.comingUp = {
    intro: 'Here is what you need first.',
    items: [
      {
        date: { year: 2026, month: 12, day: 6 },
        time: { hour: 20, minute: 0 },
        text: [t('Parent planning meeting.')],
        link: { text: 'Meeting link', url: 'https://pack137.trooptrack.com/e/1' },
      },
    ],
    howToHelp: [t('Join the committee.')],
    button: { text: 'I can help', url: 'mailto:a@b.org?subject=I%20can%20help' },
  };
  l.horizon = {
    enabled: true,
    items: [{ date: { year: 2027, month: 1, day: 9 }, text: 'Pinewood Derby workshop' }],
    yearLinkText: 'Open the year at a glance',
  };
  return l;
}

const lint = (html: string) => lintOutput(html, { monthly: true });

describe('renderLetter: structure', () => {
  it('starts with the hidden preview text div holding the summary and the read time', () => {
    const l = full();
    const html = renderLetter(l);
    expect(html.startsWith('<div style="display:none;')).toBe(true);
    const preview = /^<div[^>]*>([^<]*)<\/div>/.exec(html)?.[1] ?? '';
    expect(preview.startsWith(`${l.summary} ${readTimeText(letterWords(l))} `)).toBe(true);
    expect(preview).toContain('&zwnj;');
  });

  it('appends the read time to the summary line', () => {
    const l = base();
    const html = renderLetter(l);
    expect(html).toMatch(new RegExp(`>\\s*${l.summary} ${readTimeText(letterWords(l))}\\s*</td>`));
  });

  it('uses a fixed 600 wrapper inside Outlook comments and a fluid centered card', () => {
    const html = renderLetter(base());
    expect(html).toContain('<!--[if mso]><table role="presentation" width="600"');
    expect(html).toContain('<!--[if mso]></td></tr></table><![endif]-->');
    expect(html).toMatch(/width="100%"[^>]*style="width:100%;max-width:600px;[^"]*margin:0 auto;/);
    expect(html).not.toContain('calc(');
    expect(html).not.toContain('44%');
  });

  it('shows the masthead from the issue month and the config', () => {
    const html = renderLetter(base());
    expect(html).toContain('November 2026');
    expect(html).toContain(packConfig.eyebrow);
    expect(html).toContain(`>${packConfig.monthlyTitle}</h1>`);
    expect(html).toContain(`src="${packConfig.logoUrl}"`);
    expect(html).toContain(`background-color:#0D1431`);
  });

  it('keeps the section order of spec 8.2', () => {
    const html = renderLetter(full());
    const marks = [
      'Pack 137 Stories',
      'Fall camping at Watchung',
      'Closing and high fives',
      'Send photos.',
      'Around the pack',
      'COMING UP',
      'On the horizon',
      'Quick question:',
      'Ernest, for the Pack 137 committee',
      'More from the pack:',
    ];
    const at = marks.map((m) => html.indexOf(m));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('has no class, id, data attribute, script or style block outside conditional comments', () => {
    const html = renderLetter(full());
    const outside = html.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, '');
    expect(outside).not.toMatch(/\sclass=|\sid=|\sdata-|<script|<style/);
    expect(outside).not.toMatch(/rgb\(/);
  });

  it('is lint clean for a full letter, a minimal letter and a blank one', () => {
    expect(lint(renderLetter(full()))).toEqual([]);
    expect(lint(renderLetter(base()))).toEqual([]);
    expect(lint(renderLetter(emptyLetter({ year: 2026, month: 12 })))).toEqual([]);
  });
});

describe('renderLetter: story blocks', () => {
  it('renders a contributor badge with 8px corners, capitals and a middle dot', () => {
    const html = renderLetter(full());
    expect(html).toContain('JUSTIN DALY &middot; PROGRAM DIRECTOR');
    expect(html).toContain('border-radius:8px;');
    expect(html).not.toContain('border-radius:4px');
    expect(html).toContain('<strong>Camp Crafts:</strong> Kristin Moreno');
  });

  it('leaves out the role and its dot when there is none', () => {
    const l = full();
    if (l.story.blocks[0]?.kind === 'contributor') l.story.blocks[0].role = '';
    const html = renderLetter(l);
    expect(html).toContain('>JUSTIN DALY</span>');
    expect(html).not.toContain('JUSTIN DALY &middot;');
  });

  it('does not double a colon already on a bold lead', () => {
    const l = full();
    if (l.story.blocks[0]?.kind === 'contributor')
      l.story.blocks[0].parts = [{ kind: 'list', items: [{ lead: 'Crafts:', text: [t('x')] }] }];
    expect(renderLetter(l)).toContain('<strong>Crafts:</strong> x');
  });

  it('renders a photo with width, max-width, alt and a muted caption', () => {
    const html = renderLetter(full());
    expect(html).toContain(
      '<img src="https://x.org/a.jpg" width="400" alt="Campfire" style="display:block;width:100%;max-width:400px;height:auto;border:0;">',
    );
    expect(html).toContain('font-style:italic;line-height:1.5;">Around the fire.</p>');
  });

  it('uses 552 for a photo without a width, and caps wider ones', () => {
    const l = base();
    l.story.blocks = [
      { kind: 'photo', photo: { src: 'https://x.org/a.jpg', alt: 'A', caption: '' } },
      { kind: 'photo', photo: { src: 'https://x.org/b.jpg', alt: 'B', width: 900, caption: '' } },
    ];
    const html = renderLetter(l);
    expect(html.match(/max-width:552px/g)?.length).toBe(2);
  });

  it('keeps an empty alt as alt="" and leaves out an empty caption', () => {
    const l = base();
    l.story.blocks = [
      { kind: 'photo', photo: { src: 'https://x.org/a.jpg', alt: '  ', caption: '' } },
    ];
    const html = renderLetter(l);
    expect(html).toContain('alt=""');
    expect(html).not.toContain('font-style:italic;line-height:1.5');
    expect(lint(html)).toEqual([]);
  });

  it('leaves out a photo without a usable address', () => {
    const l = base();
    l.story.blocks = [
      { kind: 'photo', photo: { src: 'javascript:alert(1)', alt: 'A', caption: 'cap' } },
    ];
    const html = renderLetter(l);
    expect(html).not.toContain('<img src="javascript');
    expect(html).not.toContain('>cap<');
  });

  it('renders the stat band with gold numbers and lavender text', () => {
    const html = renderLetter(full());
    expect(html).toContain(
      'color:#F7A823;font-size:26px;font-weight:700;line-height:1.2;">73</div>',
    );
    expect(html).toContain('color:#E3E6F5;font-size:13px;line-height:1.4;">patrols</div>');
  });

  it('renders the sidebar with title, source, body, photo and caption, and leaves out empty parts', () => {
    const html = renderLetter(full());
    expect(html).toContain('>Make it at home</div>');
    expect(html).toContain('>Adapted from koa.com</div>');
    expect(html).toContain('<strong>Ingredients:</strong> flour.');
    expect(html).toContain('max-width:512px');
    expect(html).toContain('>Fresh bannock.</div>');
    const l = full();
    const sidebar = l.story.blocks[3];
    if (sidebar?.kind === 'sidebar') {
      sidebar.source = '';
      delete sidebar.photo;
    }
    const plain = renderLetter(l);
    expect(plain).not.toContain('Adapted from');
    expect(plain).not.toContain('Fresh bannock');
    expect(lint(plain)).toEqual([]);
  });

  it('renders no story markup for a blank title and no blocks', () => {
    const l = base();
    l.story.title = '';
    expect(renderLetter(l)).not.toContain('<h2');
  });
});

describe('renderLetter: optional sections', () => {
  it('leaves out each optional section when switched off', () => {
    const html = renderLetter(base());
    for (const gone of [
      'Closing and high fives',
      'Send them to us here',
      'Around the pack',
      'On the horizon',
    ])
      expect(html).not.toContain(gone);
    expect(html).toContain('COMING UP');
    expect(html).toContain('Quick question:');
  });

  it('shows each optional section when switched on', () => {
    const html = renderLetter(full());
    expect(html).toContain('Closing and high fives');
    expect(html).toContain('<strong>Justin Daly</strong>');
    expect(html).toContain('James Mortimer, Committee Chair');
    expect(html).toContain('Send photos. <a href="https://forms.gle/x"');
    expect(html).toContain(
      '<strong>Food drive:</strong> Bags collected. <a href="https://tapinto.net/s"',
    );
    expect(html).toContain('Around the pack');
  });

  it('leaves no empty markup for empty optional parts', () => {
    const l = full();
    l.closing = { ...l.closing, thanks: [], paragraphs: [], closingLine: '', signerRole: '' };
    l.around.intro = '';
    l.around.items = [];
    l.horizon.items = [];
    const html = renderLetter(l);
    expect(html).not.toContain('<ul style="margin:0;padding-left:22px;"></ul>');
    expect(html).not.toMatch(/<p style="[^"]*"><\/p>/);
    expect(html).not.toMatch(/<li[^>]*><\/li>/);
    expect(html).toContain('>James Mortimer</p>');
    expect(lint(html)).toEqual([]);
  });

  it('leaves out the photo ask link when its address is unusable, keeping the sentence', () => {
    const l = full();
    l.photoAsk.url = 'forms.gle/x';
    const html = renderLetter(l);
    expect(html).toContain('>Send photos.</p>');
    expect(html).not.toContain('href="forms.gle');
  });
});

describe('renderLetter: coming up and on the horizon', () => {
  it('shows dates as "Sun Dec 6, 8:00 pm:" in bold, then the text and the link', () => {
    const html = renderLetter(full());
    expect(html).toContain(
      '<strong>Sun Dec 6, 8:00 pm:</strong> Parent planning meeting. <a href="https://pack137.trooptrack.com/e/1"',
    );
    expect(html).toContain('<strong>How to help:</strong> Join the committee.');
    expect(html).toContain('>COMING UP</span>');
    expect(html).toContain('background-color:#FFE9B8');
  });

  it('shows a date with no time, and no date label for an invalid date', () => {
    const l = full();
    const item = l.comingUp.items[0];
    if (item) {
      delete item.time;
      item.date = { year: 2026, month: 2, day: 31 };
    }
    expect(renderLetter(l)).not.toContain('Feb');
    if (item) item.date = { year: 2026, month: 12, day: 6 };
    expect(renderLetter(l)).toContain('<strong>Sun Dec 6:</strong>');
  });

  it('renders the button with VML and a table fallback, both with the same address', () => {
    const html = renderLetter(full());
    expect(html).toContain('<!--[if mso]>\n');
    expect(html).toContain('<v:roundrect');
    expect(html).toContain('href="mailto:a@b.org?subject=I%20can%20help"');
    expect(html.match(/mailto:a@b\.org\?subject=I%20can%20help/g)?.length).toBe(2);
    expect(html).toContain('<!--[if !mso]><!-->');
    expect(html).toContain('<!--<![endif]-->');
    expect(html).toContain('arcsize="17%"');
    expect(html).toContain('display:block;padding:14px 20px;');
  });

  it('leaves out the whole button, VML included, when its link is unusable', () => {
    const l = full();
    l.comingUp.button.url = 'cranfordpack137@gmail.com';
    const html = renderLetter(l);
    expect(html).not.toContain('v:roundrect');
    expect(html).not.toContain('<!--[if !mso]>');
    expect(lint(html)).toEqual([]);
  });

  it('shows On the horizon with "Sat Jan 9:" bold and the year at a glance link', () => {
    const html = renderLetter(full());
    expect(html).toContain('<strong>Sat Jan 9:</strong> Pinewood Derby workshop');
    expect(html).toContain(`<a href="${packConfig.yearAtAGlanceUrl}"`);
    expect(html).toContain('>Open the year at a glance</a>');
  });
});

describe('renderLetter: feedback, sign-off and footer', () => {
  it('builds the feedback mailto with an encoded subject and body', () => {
    const html = renderLetter(full());
    expect(html).toContain(
      `href="mailto:${packConfig.email.feedback}?subject=Feedback%20on%20Pack%20137%20Stories&amp;body=Keep%3A%20%0AMore%20of%3A%20%0A"`,
    );
    expect(html).toContain('<strong>Quick question:</strong> what should we keep');
    expect(html).toContain('>Reply with feedback</a>');
    expect(html).toContain('One line is plenty.');
  });

  it('encodes ampersands, quotes, accents and em dashes in the subject and body', () => {
    const l = full();
    l.feedback.subject = `Tom & "Jerry" ${EM} café`;
    l.feedback.body = 'a=b&c\r\nd';
    const html = renderLetter(l);
    expect(html).toContain('subject=Tom%20%26%20%22Jerry%22%2C%20caf%C3%A9&amp;body=a%3Db%26c%0Ad');
    expect(lint(html)).toEqual([]);
  });

  it('leaves out empty subject and body parameters', () => {
    const l = full();
    l.feedback.subject = '';
    l.feedback.body = '';
    expect(renderLetter(l)).toContain(`href="mailto:${packConfig.email.feedback}"`);
  });

  it('renders the sign-off line in bold', () => {
    expect(renderLetter(full())).toContain(
      'font-weight:700;">Ernest, for the Pack 137 committee</p>',
    );
  });

  it('builds the footer from the config: standing links joined by a middle dot, and the contact email', () => {
    const html = renderLetter(full());
    const links = packConfig.standingLinks.map((l) => `>${l.label}</a>`);
    for (const link of links) expect(html).toContain(link);
    expect(html).toContain('</a> &middot; <a href="https://www.cubpack137.com/"');
    expect(html).toContain(`Questions or feedback: <a href="mailto:${packConfig.email.contact}"`);
    expect(html).toContain('color:#F9B93E;font-weight:700;');
    expect(html).toContain('background-color:#151B4D');
  });

  it('gives every link an absolute address, and target and rel on all but mailto', () => {
    const html = renderLetter(full());
    for (const m of html.matchAll(/<a href="([^"]*)"([^>]*)>/g)) {
      expect(m[1]).toMatch(/^(https?:\/\/|mailto:)/);
      if (m[1]?.startsWith('mailto:')) expect(m[2]).not.toContain('target');
      else expect(m[2]).toContain('target="_blank" rel="noopener noreferrer"');
    }
  });
});

describe('renderLetter: unusable URLs', () => {
  it('turns links without https, http or mailto into plain text', () => {
    const l = full();
    const [coming] = l.comingUp.items;
    const [around] = l.around.items;
    if (coming) coming.link = { text: 'Meeting link', url: 'meet.google.com/vgn-rwmf-fmz' };
    if (around) around.link = { text: 'Read the story', url: 'javascript:alert(1)' };
    const html = renderLetter(l);
    expect(html).not.toContain('meet.google.com');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<strong>Food drive:</strong> Bags collected.</li>');
    expect(lint(html)).toEqual([]);
  });

  it('keeps inline links in rich text only when usable', () => {
    const l = full();
    l.intro = [t('Click', { href: 'ftp://x.org' }), t(' here', { href: 'https://x.org/a' })];
    const html = renderLetter(l);
    expect(html).not.toContain('ftp://');
    expect(html).toContain('<a href="https://x.org/a"');
  });
});

describe('renderLetter: escaping (ADR 0004)', () => {
  const nasty = `<script>alert(1)</script> --> <![endif]--> ]]> <!--[if mso]> "q" 'a' & $& ${EM} end`;

  function hostile(): LetterForm {
    const l = full();
    l.summary = nasty;
    l.greeting = nasty;
    l.intro = [t(nasty)];
    l.story.title = nasty;
    l.story.blocks = [
      {
        kind: 'contributor',
        name: nasty,
        role: nasty,
        parts: [
          { kind: 'paragraph', text: [t(nasty)] },
          { kind: 'list', items: [{ lead: nasty, text: [t(nasty)] }] },
        ],
      },
      { kind: 'photo', photo: { src: 'https://x.org/a.jpg', alt: nasty, caption: nasty } },
      {
        kind: 'stats',
        stats: [
          { value: nasty, text: nasty },
          { value: nasty, text: nasty },
        ],
      },
      { kind: 'sidebar', title: nasty, source: nasty, body: [[t(nasty)]], photo: undefined },
    ];
    l.closing = {
      ...l.closing,
      paragraphs: [[t(nasty)]],
      thanks: [[t(nasty)]],
      closingLine: nasty,
      signer: nasty,
      signerRole: nasty,
    };
    l.photoAsk = { enabled: true, text: nasty, linkText: nasty, url: 'https://x.org/' };
    l.around = {
      enabled: true,
      intro: nasty,
      items: [{ lead: nasty, text: [t(nasty)], link: { text: nasty, url: 'https://x.org/' } }],
    };
    l.comingUp = {
      intro: nasty,
      items: [
        {
          date: { year: 2026, month: 12, day: 6 },
          text: [t(nasty)],
          link: { text: nasty, url: 'https://x.org/' },
        },
      ],
      howToHelp: [t(nasty)],
      button: { text: nasty, url: 'https://x.org/' },
    };
    l.horizon = {
      enabled: true,
      items: [{ date: { year: 2026, month: 12, day: 6 }, text: nasty }],
      yearLinkText: nasty,
    };
    l.feedback = { question: nasty, linkText: nasty, subject: nasty, body: nasty, note: nasty };
    l.signOff = nasty;
    return l;
  }

  it('escapes markup, comment endings and CDATA endings in every text field', () => {
    const html = renderLetter(hostile());
    expect(html).not.toContain('<script');
    expect(html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt; --&gt; &lt;![endif]--&gt; ]]&gt; &lt;!--[if mso]&gt;',
    );
    expect(html).toContain('$&amp;');
    expect(html).not.toContain(EM);
    expect(lint(html)).toEqual([]);
  });

  it('cannot break out of the conditional comments', () => {
    const html = renderLetter(hostile());
    // Remove our own comments; no comment start or end may be left over.
    const rest = html
      .replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, '')
      .replace('<!--[if !mso]><!-->', '')
      .replace('<!--<![endif]-->', '');
    expect(rest).not.toContain('<!--');
    expect(rest).not.toContain('-->');
    const vml = /<!--\[if mso\]>\s*<v:roundrect[\s\S]*?<!\[endif\]-->/.exec(html)?.[0] ?? '';
    expect(vml).not.toBe('');
    // Inside the VML comment, the label is escaped and holds no raw terminator.
    const inner = vml.slice('<!--[if mso]>'.length, vml.length - '<![endif]-->'.length);
    expect(inner).not.toContain('-->');
    expect(inner).not.toContain('<!--');
    expect(inner).not.toContain('<![');
    expect(inner).toContain('--&gt;');
    expect(inner).toContain('&lt;![endif]--&gt;');
  });

  it('escapes a VML href with quotes and markup', () => {
    const l = full();
    l.comingUp.button.url = 'https://x.org/"><img src=x onerror=alert(1)>?a=1&b=2\'-->';
    const html = renderLetter(l);
    const vml = /<v:roundrect[^>]*>/.exec(html)?.[0] ?? '';
    expect(vml).toContain('href="https://x.org/&quot;&gt;');
    expect(vml).not.toContain('<img');
    expect(vml).not.toMatch(/href="[^"]*"[^>]*onerror/);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/-->[^]*onerror=alert\(1\)>[^]*$/);
    expect(lint(html)).toEqual([]);
    // The ordinary link carries the same escaped value.
    expect(html).toContain('&amp;b=2&#39;--&gt;');
  });

  it('escapes quotes and markup in img alt and src', () => {
    const l = base();
    l.story.blocks = [
      {
        kind: 'photo',
        photo: { src: 'https://x.org/a.jpg?x="onerror="y', alt: '"><b>', caption: '' },
      },
    ];
    const html = renderLetter(l);
    expect(html).toContain('alt="&quot;&gt;&lt;b&gt;"');
    expect(html).not.toContain('onerror="y');
    expect(lint(html)).toEqual([]);
  });

  it('does not expand $ patterns in user text', () => {
    const l = base();
    l.summary = "$& $` $' $1";
    const html = renderLetter(l);
    expect(html).toContain("$&amp; $` $' $1");
  });

  it('replaces em dashes with commas in text and in mailto parameters', () => {
    const l = full();
    l.summary = `One ${EM} two`;
    l.feedback.subject = `A ${EM} B`;
    const html = renderLetter(l);
    expect(html).toContain('One, two');
    expect(html).toContain('subject=A%2C%20B');
    expect(html).not.toContain('%E2%80%94');
  });
});

describe('renderLetter: read time text', () => {
  it('matches readTimeText(letterWords(letter)) in the summary line and the preview', () => {
    const l = full();
    const text = readTimeText(letterWords(l));
    const html = renderLetter(l);
    expect(html.split(text).length - 1).toBe(2);
  });

  it('counts only sections that are on', () => {
    const on = full();
    const off = full();
    off.closing.enabled = false;
    const short = readTimeText(letterWords(off));
    expect(typeof short).toBe('string');
    expect(letterWords(on)).toBeGreaterThan(letterWords(off));
  });

  it('is deterministic', () => {
    expect(renderLetter(full())).toBe(renderLetter(full()));
  });
});
