import { describe, expect, it } from 'vitest';
import { color, fontStack } from '../../src/config/tokens';
import type {
  AnnouncementForm,
  CallToActionForm,
  DateListForm,
  DateRow,
  DateSection,
  HelpWantedForm,
  LinkListForm,
  MessageForm,
  RichText,
} from '../../src/core/forms';
import { lintOutput } from '../../src/core/lint-output';
import type { TextRun } from '../../src/core/model';
import { renderAnnouncement } from '../../src/core/render';
import { tag } from '../../src/templates/components';

// Built from its code point so this file holds no em dash.
const EM = String.fromCharCode(0x2014);

/** Renders and checks the linter in one step, so every string in this file is linted. */
function render(form: AnnouncementForm): string {
  const html = renderAnnouncement(form);
  expect(lintOutput(html)).toEqual([]);
  return html;
}

/** The card title is a <p> too (Outlook fix D1); drop it before counting or checking body paragraphs. */
const withoutTitle = (html: string): string =>
  html.replace(/<p style="margin:8px 0 0 0;color:#FFFFFF;[^>]*>[^<]*<\/p>/, '');

const t = (text: string, extra: Partial<TextRun> = {}): TextRun => ({
  kind: 'text',
  text,
  marks: [],
  ...extra,
});
const rt = (text: string): RichText => [t(text)];

const message = (over: Partial<MessageForm> = {}): MessageForm => ({
  layout: 'message',
  label: 'Label',
  title: 'Title',
  paragraphs: [rt('Hello')],
  ...over,
});
const cta = (over: Partial<CallToActionForm> = {}): CallToActionForm => ({
  layout: 'call-to-action',
  label: 'Label',
  title: 'Title',
  paragraph: rt('Please sign up.'),
  button: { text: 'Sign up', url: 'https://example.org/signup' },
  ...over,
});
const linkList = (over: Partial<LinkListForm> = {}): LinkListForm => ({
  layout: 'link-list',
  label: 'Label',
  title: 'Title',
  intro: rt('Read these.'),
  items: [{ text: 'Story', url: 'https://example.org/story', note: 'Source' }],
  ...over,
});
const row = (over: Partial<DateRow> = {}): DateRow => ({
  date: { start: { year: 2026, month: 12, day: 6 } },
  event: 'Meeting',
  url: 'https://example.org/e',
  tags: [],
  note: [],
  ...over,
});
const section = (over: Partial<DateSection> = {}): DateSection => ({
  name: 'Soon',
  style: 'plain',
  subtitle: '',
  rows: [row()],
  ...over,
});
const dateList = (...sections: DateSection[]): DateListForm => ({
  layout: 'date-list',
  label: 'Label',
  title: 'Title',
  sections,
});
const help = (over: Partial<HelpWantedForm> = {}): HelpWantedForm => ({
  layout: 'help-wanted',
  label: 'Volunteer',
  title: 'Help us',
  intro: rt('Thank you.'),
  ask: {
    badge: 'Highest need',
    title: 'Ask title',
    paragraphs: [rt('First.'), rt('Second.')],
    button: { text: 'I can help', url: 'mailto:a@example.org?subject=Help' },
  },
  outro: rt('Not your area?'),
  secondary: { text: 'See all', url: 'https://example.org/all' },
  ...over,
});

const linkStyle = `color:${color.navy};font-weight:700;text-decoration:underline;`;

describe('escaping', () => {
  it('escapes & < > in text and keeps apostrophes raw', () => {
    const html = render(
      message({
        label: 'A & B <i>',
        title: "What's <b>up</b>",
        paragraphs: [rt("Tom & Jerry's <script>alert(1)</script>")],
      }),
    );
    expect(html).toContain('A&nbsp;&amp;&nbsp;B&nbsp;&lt;i&gt;');
    expect(html).toContain("What's &lt;b&gt;up&lt;/b&gt;");
    expect(html).toContain("Tom &amp; Jerry's &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain('<script');
  });

  it('escapes & " \' < > in href, src and alt', () => {
    const html = render(
      linkList({
        image: { src: 'https://x.org/a.png?a=1&b="2"\'<>', alt: 'A "pic" & <more> it\'s' },
        items: [{ text: 'Go', url: 'https://x.org/?a=1&b="2"\'<>', note: '' }],
      }),
    );
    expect(html).toContain('href="https://x.org/?a=1&amp;b=&quot;2&quot;&#39;&lt;&gt;"');
    expect(html).toContain('src="https://x.org/a.png?a=1&amp;b=&quot;2&quot;&#39;&lt;&gt;"');
    expect(html).toContain('alt="A &quot;pic&quot; &amp; &lt;more&gt; it&#39;s"');
  });

  it('keeps the ADR 0004 href from breaking out of the attribute', () => {
    const html = render(
      message({
        paragraphs: [
          [t('click', { href: 'https://x.org/"><img src=x onerror=alert(1)>' })],
          rt('<script> <!--[if mso]> ]]> -->'),
        ],
      }),
    );
    expect(html).toContain('href="https://x.org/&quot;&gt;&lt;img%20src=x%20onerror=alert(1)&gt;"');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt; &lt;!--[if mso]&gt; ]]&gt; --&gt;');
    expect(html).not.toContain('<!--');
    expect(html).not.toContain('<script');
  });

  it('escapes the date, tags, subtitle, section name and button text', () => {
    const html = render(
      dateList(
        section({
          name: 'A<b>',
          rows: [row({ event: 'E<i>', tags: [{ text: 'T<u>', strength: 'quiet' }] })],
        }),
        section({ name: 'Q<q>', style: 'quiet', subtitle: 'S<s>' }),
      ),
    );
    for (const raw of ['<b>', '<i>', '<u>', '<q>', '<s>']) expect(html).not.toContain(raw);
    for (const esc of ['A&lt;b&gt;', 'E&lt;i&gt;', 'T&lt;u&gt;', 'Q&lt;q&gt;', 'S&lt;s&gt;'])
      expect(html).toContain(esc);
    const btn = render(cta({ button: { text: 'Go <now>', url: 'https://example.org/' } }));
    expect(btn).toContain('Go &lt;now&gt;');
  });
});

describe('replacement patterns', () => {
  it("outputs $&, $', $` and $1 literally everywhere user text goes", () => {
    const nasty = "$& $' $` $1 $$";
    // The ampersand is escaped, everything else must come out untouched.
    const shown = "$&amp; $' $` $1 $$";
    // Pills and tags write their spaces as &nbsp;, so the same text also appears in that form.
    const shownNb = shown.replace(/ /g, '&nbsp;');
    const count = (text: string): number =>
      text.split(shown).length - 1 + (text.split(shownNb).length - 1);
    const html = render(
      dateList(
        section({
          name: nasty,
          rows: [
            row({ event: nasty, tags: [{ text: nasty, strength: 'strong' }], note: rt(nasty) }),
          ],
        }),
      ),
    );
    expect(count(html)).toBeGreaterThanOrEqual(4);
    const card = render(message({ label: nasty, title: nasty, paragraphs: [rt(nasty)] }));
    expect(count(card)).toBe(3);
    const link = render(
      linkList({
        intro: rt(nasty),
        items: [{ text: nasty, url: 'https://example.org/$&', note: nasty }],
        image: { src: 'https://example.org/$1.png', alt: nasty },
      }),
    );
    expect(link).toContain('href="https://example.org/$&amp;"');
    expect(link).toContain('src="https://example.org/$1.png"');
    expect(count(link)).toBe(3);
    expect(link).toContain('alt="$&amp; $&#39; $` $1 $$"');
    const helpHtml = render(help({ ask: { ...help().ask, title: nasty, badge: nasty } }));
    expect(count(helpHtml)).toBe(2);
  });
});

describe('mailto encoding', () => {
  const buttonHref = (url: string): string => {
    const html = render(cta({ button: { text: 'Mail', url } }));
    const match = /<a href="([^"]*)"/.exec(html);
    return match?.[1] ?? '';
  };

  it('encodes spaces in a subject as %20', () => {
    expect(buttonHref('mailto:a@example.org?subject=Help with the pack')).toBe(
      'mailto:a@example.org?subject=Help%20with%20the%20pack',
    );
  });

  it('keeps existing %XX escapes and does not double encode', () => {
    expect(buttonHref('mailto:a@example.org?subject=Help%20now&body=50%25 off')).toBe(
      'mailto:a@example.org?subject=Help%20now&amp;body=50%25%20off',
    );
  });

  it('encodes a stray percent sign, punctuation and non-ASCII in values', () => {
    expect(buttonHref('mailto:a@example.org?subject=100% a/b?c=d')).toBe(
      'mailto:a@example.org?subject=100%25%20a%2Fb%3Fc%3Dd',
    );
    expect(buttonHref('mailto:a@example.org?body=café')).toBe(
      'mailto:a@example.org?body=caf%C3%A9',
    );
  });

  it('leaves a plain address and a plus address alone', () => {
    expect(buttonHref('mailto:pack+news@example.org')).toBe('mailto:pack+news@example.org');
  });

  it('encodes the raw-space subject in fixture 2 style forms', () => {
    const html = render(help());
    expect(html).toContain('href="mailto:a@example.org?subject=Help"');
    const raw = render(
      help({
        ask: {
          ...help().ask,
          button: { text: 'Go', url: 'mailto:a@example.org?subject=Help with nonprofit formation' },
        },
      }),
    );
    expect(raw).toContain('subject=Help%20with%20nonprofit%20formation');
  });

  it('has no target or rel on mailto links but has both on web links', () => {
    const html = render(
      message({
        paragraphs: [
          [
            t('mail', { href: 'mailto:a@example.org' }),
            t(' web', { href: 'https://example.org/' }),
          ],
        ],
      }),
    );
    expect(html).toMatch(/<a href="mailto:a@example\.org" style=/);
    expect(html).toMatch(
      /<a href="https:\/\/example\.org\/" target="_blank" rel="noopener noreferrer" style=/,
    );
  });
});

describe('URL rule', () => {
  const bad = [
    '',
    '   ',
    'meet.google.com/x',
    'javascript:alert(1)',
    '/relative/path',
    '//x.org/a',
    'ftp://x.org',
    'https://',
    'mailto:',
  ];

  it.each(bad)('rejects %j: event becomes a plain span, link run plain text', (url) => {
    const html = render(
      dateList(
        section({ rows: [row({ event: 'Event', url })] }),
        section({ name: 'Links', rows: [row({ date: undefined, event: 'Plain row', url })] }),
      ),
    );
    expect(html).toContain('<span style="font-size:16px;">Event</span>');
    expect(html).toContain('<span style="font-size:16px;">Plain row</span>');
    expect(html).not.toContain('<a ');

    const run = render(message({ paragraphs: [[t('words', { href: url })]] }));
    expect(run).toContain('<p style="margin:0;">words</p>');
    expect(run).not.toContain('<a ');
  });

  it.each(bad)('rejects %j: link list text is plain, button and image are left out', (url) => {
    const list = render(
      linkList({ items: [{ text: 'Item', url, note: '' }], image: { src: url, alt: 'Alt' } }),
    );
    expect(list).toContain('<span style="font-size:16px;">Item</span>');
    expect(list).not.toContain('<a ');
    expect(list).not.toContain('<img');

    expect(render(cta({ button: { text: 'Go', url } }))).not.toContain('<a ');
    expect(render(message({ button: { text: 'Go', url } }))).not.toContain('<a ');
    const helpHtml = render(
      help({
        ask: { ...help().ask, button: { text: 'Go', url } },
        secondary: { text: 'More', url },
      }),
    );
    expect(helpHtml).not.toContain('<a ');
  });

  it('accepts https, http and mailto in any letter case', () => {
    const html = render(
      message({
        paragraphs: [
          [
            t('a', { href: 'HTTPS://x.org/' }),
            t('b', { href: 'http://x.org/' }),
            t('c', { href: 'MAILTO:a@x.org' }),
          ],
        ],
      }),
    );
    expect(html.match(/<a /g)).toHaveLength(3);
  });

  it('percent-encodes spaces in web URLs', () => {
    const html = render(message({ paragraphs: [[t('a', { href: 'https://x.org/a b' })]] }));
    expect(html).toContain('href="https://x.org/a%20b"');
  });

  it('keeps an image with empty or blank alt text as alt=""', () => {
    for (const alt of ['', '  ']) {
      const html = render(linkList({ image: { src: 'https://x.org/a.png', alt } }));
      expect(html).toContain('<img src="https://x.org/a.png" width="80" alt="" style=');
    }
  });

  it('still leaves out an image with an invalid URL, whatever its alt', () => {
    for (const alt of ['', 'Alt']) {
      const html = render(linkList({ image: { src: 'not a url', alt } }));
      expect(html).not.toContain('<img');
    }
  });

  it('gives the button cell an Outlook padding fallback', () => {
    for (const html of [render(cta()), render(help())]) {
      expect(html).toContain('border-radius:8px;mso-padding-alt:13px 22px;">');
    }
  });

  it('writes an image with the required attributes', () => {
    const html = render(linkList({ image: { src: 'https://x.org/a.png', alt: 'Scouts' } }));
    expect(html).toContain(
      '<img src="https://x.org/a.png" width="80" alt="Scouts" style="display:block;width:80px;max-width:100%;height:auto;border:0;">',
    );
    expect(html).toContain('<td style="padding:0 0 12px 0;">');
    const img = html.indexOf('<img');
    expect(img).toBeGreaterThan(-1);
    expect(img).toBeLessThan(html.indexOf('Read these.'));
  });

  it('does not use a mailto URL as an image source', () => {
    const html = render(linkList({ image: { src: 'mailto:a@x.org', alt: 'Alt' } }));
    expect(html).not.toContain('<img');
  });
});

describe('em dashes', () => {
  it('turns an em dash with spaces into a comma and a space', () => {
    const html = render(
      message({
        label: `A ${EM} B`,
        title: `Title ${EM} more`,
        paragraphs: [rt(`One ${EM} two${EM}three`)],
      }),
    );
    expect(html).not.toContain(EM);
    expect(html).toContain('A,&nbsp;B');
    expect(html).toContain('Title, more');
    expect(html).toContain('One, two, three');
  });

  it('removes em dashes from every other field and from URLs', () => {
    const html = render(
      dateList(
        section({
          name: `N ${EM} M`,
          rows: [
            row({
              event: `E ${EM} F`,
              url: `https://x.org/a${EM}b`,
              tags: [{ text: `T ${EM} U`, strength: 'quiet' }],
              note: rt(`n ${EM} m`),
            }),
          ],
        }),
        section({ name: 'Q', style: 'quiet', subtitle: `S ${EM} V` }),
      ),
    );
    expect(html).not.toContain(EM);
    expect(html).toContain('href="https://x.org/a%E2%80%94b"');
    expect(html).toContain('N, M');
    const other = render(
      linkList({
        intro: rt(`i ${EM} j`),
        items: [{ text: `x ${EM} y`, url: 'https://x.org/', note: `p ${EM} q` }],
        image: { src: 'https://x.org/i.png', alt: `al ${EM} t` },
      }),
    );
    expect(other).not.toContain(EM);
    expect(other).toContain('alt="al, t"');
    const mail = render(
      cta({ button: { text: `B ${EM} C`, url: `mailto:a@x.org?subject=a ${EM} b` } }),
    );
    expect(mail).not.toContain(EM);
    expect(mail).toContain('subject=a%20%E2%80%94%20b');
  });
});

describe('rich text', () => {
  it('renders strong, em and strike marks', () => {
    const html = render(
      message({
        paragraphs: [
          [
            t('b', { marks: ['strong'] }),
            t('i', { marks: ['em'] }),
            t('s', { marks: ['strike'] }),
            t('all', { marks: ['em', 'strike', 'strong'] }),
          ],
        ],
      }),
    );
    expect(html).toContain('<strong>b</strong><em>i</em><s>s</s>');
    expect(html).toContain('<strong><em><s>all</s></em></strong>');
  });

  it('renders a break as <br>', () => {
    const html = render(message({ paragraphs: [[t('one'), { kind: 'break' }, t('two')]] }));
    expect(html).toContain('one<br>two');
  });

  it('renders link runs with the token link style', () => {
    const html = render(message({ paragraphs: [[t('here', { href: 'https://x.org/' })]] }));
    expect(html).toContain(`style="${linkStyle}">here</a>`);
    expect(linkStyle).toBe('color:#151B4D;font-weight:700;text-decoration:underline;');
  });

  it('turns newlines inside text into spaces so indentation stays out of copy', () => {
    const html = render(message({ paragraphs: [rt('one\ntwo\r\nthree')] }));
    expect(html).toContain('one two three');
  });
});

describe('card shell', () => {
  it('uses the approved shell and omits an empty label and title', () => {
    const html = render(message());
    expect(html).toContain(
      'align="center" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="max-width:600px;margin:0 auto;border-collapse:separate;background-color:#FFFFFF;border:1px solid #E3E6F5;border-radius:12px;font-family:Inter,Arial,Helvetica,sans-serif;word-break:break-word;"',
    );
    const bare = render(message({ label: ' ', title: '' }));
    expect(bare).not.toContain('letter-spacing');
    expect(bare).not.toContain('font-size:20px');
  });

  it('is deterministic and uses two-space indentation', () => {
    const form = dateList(section(), section({ name: 'Q', style: 'quiet' }));
    expect(renderAnnouncement(form)).toBe(renderAnnouncement(form));
    for (const line of renderAnnouncement(form).split('\n')) expect(line).toMatch(/^( {2})*\S|^$/);
  });
});

describe('Message layout', () => {
  it('puts 14px below each paragraph and 16px below the last when a button follows', () => {
    const html = render(
      message({
        paragraphs: [rt('One'), rt('Two')],
        button: { text: 'Go', url: 'https://x.org/' },
      }),
    );
    expect(html).toContain('<p style="margin:0 0 14px 0;">One</p>');
    expect(html).toContain('<p style="margin:0 0 16px 0;">Two</p>');
    expect(html).toContain(`background-color:${color.navy};border-radius:8px;`);
    expect(html.indexOf('Two')).toBeLessThan(html.indexOf('<table', html.indexOf('Two')));
  });

  it('has no margin on the last paragraph without a button', () => {
    const html = render(message({ paragraphs: [rt('One'), rt('Two')] }));
    expect(html).toContain('<p style="margin:0 0 14px 0;">One</p>');
    expect(html).toContain('<p style="margin:0;">Two</p>');
    expect(html).not.toContain('<a ');
  });

  it('skips empty paragraphs and renders an empty form', () => {
    const html = render(message({ paragraphs: [rt('One'), [], rt('  ')] }));
    expect(withoutTitle(html).match(/<p /g)).toHaveLength(1);
    render(message({ paragraphs: [] }));
  });
});

describe('Call to action layout', () => {
  it('renders the paragraph (16px below) and the primary button', () => {
    const html = render(cta());
    expect(html).toContain('<p style="margin:0 0 16px 0;">Please sign up.</p>');
    expect(html).toContain(
      `<a href="https://example.org/signup" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 22px;font-family:${fontStack};color:${color.white};font-size:16px;font-weight:700;line-height:18px;text-decoration:none;border-radius:8px;">Sign up</a>`,
    );
  });

  it('works with an empty paragraph and with no usable button', () => {
    const html = render(cta({ paragraph: [], button: { text: 'Go', url: '' } }));
    expect(withoutTitle(html)).not.toContain('<p ');
    expect(html).not.toContain('<a ');
    expect(render(cta({ button: { text: '', url: 'https://x.org/' } }))).not.toContain('<a ');
    expect(render(cta({ button: { text: 'Go', url: '' } }))).toContain('<p style="margin:0;">');
  });
});

describe('Link list layout', () => {
  it('renders image, intro and rows with borders after the first', () => {
    const html = render(
      linkList({
        image: { src: 'https://x.org/i.png', alt: 'Alt' },
        items: [
          { text: 'One', url: 'https://x.org/1', note: 'Note one' },
          { text: 'Two', url: 'https://x.org/2', note: '' },
        ],
      }),
    );
    expect(html).toContain('<p style="margin:0 0 6px 0;">Read these.</p>');
    expect(html).toContain(
      `<p style="margin:2px 0 0 0;font-size:13px;color:${color.ink};">Note one</p>`,
    );
    expect(html.match(/border-top:1px solid #E3E6F5;/g)).toHaveLength(1);
    expect(html.match(/margin:2px 0 0 0;/g)).toHaveLength(1);
  });

  it('works with no image, empty intro, no items and empty notes', () => {
    const html = render(linkList({ intro: [], items: [], image: undefined }));
    expect(html).not.toContain('<img');
    expect(withoutTitle(html)).not.toContain('<p ');
    expect(html).not.toContain('<td style="padding:10px 0;');
    const noNotes = render(
      linkList({ items: [{ text: 'One', url: 'https://x.org/1', note: '' }] }),
    );
    expect(noNotes).not.toContain('margin:2px 0 0 0;');
  });

  it('drops items with empty text', () => {
    const html = render(linkList({ items: [{ text: ' ', url: 'https://x.org/1', note: 'n' }] }));
    expect(html).not.toContain('<td style="padding:10px 0;');
  });
});

describe('Date list layout', () => {
  it('formats a single date, a 2-day range and a struck date', () => {
    const html = render(
      dateList(
        section({
          rows: [
            row({
              date: {
                start: { year: 2027, month: 2, day: 27 },
                end: { year: 2027, month: 2, day: 28 },
              },
            }),
            row({ date: { start: { year: 2026, month: 11, day: 24 }, struck: true } }),
            row({
              date: {
                start: { year: 2026, month: 11, day: 21 },
                end: { year: 2026, month: 11, day: 21 },
              },
            }),
          ],
        }),
      ),
    );
    expect(html).toContain('>Sat Feb 27 to Sun Feb 28</p>');
    expect(html).toContain('><s>Tue Nov 24</s></p>');
    expect(html).toContain('>Sat Nov 21</p>');
    expect(html).not.toContain('Nov 21 to');
  });

  it('plain section with a name: heading and a border on every row', () => {
    const html = render(dateList(section({ rows: [row(), row()] })));
    expect(html).toContain(
      `<p style="margin:20px 0 4px 0;color:${color.navy};font-size:17px;font-weight:700;">Soon</p>`,
    );
    expect(html.match(/padding:10px 0;border-top:1px solid #E3E6F5;/g)).toHaveLength(2);
  });

  it('plain section with an empty name: no heading, first row has no border', () => {
    const html = render(dateList(section({ name: '', rows: [row(), row()] })));
    expect(html).not.toContain('font-size:17px');
    expect(html.match(/padding:10px 0;border-top:1px solid #E3E6F5;/g)).toHaveLength(1);
    expect(html.match(/<td style="padding:10px 0;font-family/g)).toHaveLength(1);
  });

  it('highlight panel with a name uses a strong pill and white row borders', () => {
    const html = render(
      dateList(section({ style: 'highlight', name: 'Now', rows: [row(), row()] })),
    );
    expect(html).toContain(`background-color:${color.goldPale};border-radius:12px;padding:14px;`);
    expect(html).toContain(
      `background-color:${color.navy};color:${color.goldLight};font-family:${fontStack};font-size:11px;font-weight:700;letter-spacing:1px;`,
    );
    expect(html.match(/border-top:1px solid #FFFFFF;/g)).toHaveLength(1);
  });

  it('highlight panel with no name and one row shows the row straight in the panel', () => {
    const html = render(dateList(section({ style: 'highlight', name: '', rows: [row()] })));
    // The card, the label pill and the panel.
    expect(html.match(/<table /g)).toHaveLength(3);
    expect(html).not.toContain(
      'letter-spacing:1px;text-transform:uppercase;padding:4px 10px;border-radius:8px;">Now',
    );
    const noName = render(
      dateList(section({ style: 'highlight', name: '', rows: [row(), row()] })),
    );
    expect(noName.match(/<table /g)).toHaveLength(4);
  });

  it('quiet panel: heading, subtitle, white tags and a spacer after other content', () => {
    const html = render(
      dateList(
        section(),
        section({
          style: 'quiet',
          name: 'Save the date',
          subtitle: 'Details to come.',
          rows: [
            row({
              tags: [
                { text: 'TBD', strength: 'quiet' },
                { text: 'Rescheduled', strength: 'strong' },
              ],
            }),
          ],
        }),
      ),
    );
    expect(html).toContain(
      '<div style="height:20px;line-height:20px;font-size:1px;mso-line-height-rule:exactly;">&nbsp;</div>',
    );
    expect(html).toContain(
      `<p style="margin:0;color:${color.navy};font-size:17px;font-weight:700;">Save the date</p>`,
    );
    expect(html).toContain(
      `<p style="margin:2px 0 0 0;font-size:13px;color:${color.ink};">Details to come.</p>`,
    );
    expect(html).toContain(`background-color:${color.white};color:${color.navy};font-size:11px`);
    expect(html).toContain(
      `background-color:${color.navy};color:${color.goldLight};font-size:11px;font-weight:700;text-transform:uppercase;padding:2px 8px;`,
    );
  });

  it('quiet panel first in the card has no spacer; with no name or subtitle shows neither', () => {
    const html = render(dateList(section({ style: 'quiet', name: '', subtitle: '' })));
    expect(html).not.toContain('height:20px');
    expect(html).not.toContain('font-size:17px');
    expect(html).not.toContain('margin:2px 0 0 0');
  });

  it('tags on a white card use lavender for quiet tags', () => {
    const html = render(
      dateList(section({ rows: [row({ tags: [{ text: 'Virtual', strength: 'quiet' }] })] })),
    );
    expect(html).toContain(`background-color:${color.lavender};color:${color.navy};font-size:11px`);
    expect(html).toContain('</a> <span style=');
  });

  it('a row with no date is a link row; with a note it shows a 13px line', () => {
    const html = render(
      dateList(section({ rows: [row({ date: undefined, note: rt('Contact: Pat') })] })),
    );
    expect(html).toContain(`style="${linkStyle}font-size:16px;">Meeting</a>`);
    expect(html).toContain(
      `<p style="margin:2px 0 0 0;font-size:13px;color:${color.ink};">Contact: Pat</p>`,
    );
    expect(html).not.toContain('margin:0 0 2px 0');
  });

  it('a date row note is a 14px line, and empty notes leave nothing', () => {
    const withNote = render(dateList(section({ rows: [row({ note: rt('Bring a pen') })] })));
    expect(withNote).toContain(
      `<p style="margin:4px 0 0 0;font-size:14px;color:${color.ink};">Bring a pen</p>`,
    );
    const none = render(dateList(section({ rows: [row({ note: [t('  ')] })] })));
    expect(none).not.toContain('font-size:14px');
  });

  it('renders nothing for a section with no rows, and for no sections', () => {
    const html = render(
      dateList(
        section({ name: 'Empty plain', rows: [] }),
        section({ name: 'Empty panel', style: 'highlight', rows: [] }),
        section({ name: 'Empty quiet', style: 'quiet', rows: [] }),
        section({ name: 'Full' }),
      ),
    );
    expect(html).not.toContain('Empty');
    expect(html).not.toContain('height:20px');
    expect(html).toContain('>Full</p>');
    const none = render(dateList());
    expect(none).not.toContain('padding:10px 0');
  });

  it('never emits the retired two-column date row', () => {
    const html = render(dateList(section({ rows: [row(), row()] })));
    expect(html).not.toContain('width="96"');
  });
});

describe('Help wanted layout', () => {
  it('renders every part with the ADR 0005 margins', () => {
    const html = render(help());
    expect(html).toContain('<p style="margin:0 0 14px 0;">Thank you.</p>');
    expect(html).toContain('>Highest&nbsp;need</td>');
    expect(html).toContain(
      `<p style="margin:10px 0 6px 0;color:${color.navy};font-size:18px;font-weight:700;line-height:1.3;">Ask title</p>`,
    );
    expect(html).toContain(`<p style="margin:0 0 10px 0;color:${color.ink};">First.</p>`);
    expect(html).toContain(`<p style="margin:0 0 14px 0;color:${color.ink};">Second.</p>`);
    expect(html).toContain('<p style="margin:18px 0 12px 0;">Not your area?</p>');
    expect(html).toContain(`background-color:${color.lavender};border-radius:8px;`);
    expect(html).toContain(`color:${color.navy};font-size:16px;font-weight:700;line-height:18px;`);
  });

  it('leaves out the secondary button, the outro, the intro and the ask button when absent', () => {
    const html = render(
      help({
        intro: [],
        outro: [],
        secondary: undefined,
        ask: { ...help().ask, button: { text: 'Go', url: '' } },
      }),
    );
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('margin:18px');
    expect(html).toContain(`<p style="margin:0;color:${color.ink};">Second.</p>`);
    expect(html).not.toContain('Thank you.');
  });

  it('puts a gap before the secondary button when there is no outro line', () => {
    const html = render(help({ outro: [] }));
    expect(html).toContain('height:20px');
    const noOutroNoSecondary = render(help({ outro: rt('Tail'), secondary: undefined }));
    expect(noOutroNoSecondary).toContain('<p style="margin:18px 0 0 0;">Tail</p>');
  });

  it('skips an ask that is entirely empty and an empty badge', () => {
    const empty = render(
      help({ ask: { badge: '', title: '', paragraphs: [], button: { text: '', url: '' } } }),
    );
    expect(empty).not.toContain(color.goldPale);
    const noBadge = render(help({ ask: { ...help().ask, badge: '' } }));
    expect(noBadge).not.toContain(
      'letter-spacing:1px;text-transform:uppercase;padding:4px 10px;border-radius:8px;">Highest',
    );
    expect(noBadge).toContain(color.goldPale);
  });
});

describe('quiet tags inside colored panels (owner decision 2026-11-22, option a)', () => {
  it('keep the white fill and add a thin navy outline, at the same size as other tags', () => {
    const quietOnPanel = tag({ text: 'Virtual', strength: 'quiet' }, true);
    expect(quietOnPanel).toContain('background-color:#FFFFFF;');
    expect(quietOnPanel).toContain('border:1px solid #151B4D;');
    expect(quietOnPanel).toContain('padding:1px 7px;');
  });

  it('leave quiet tags on white and strong tags unchanged', () => {
    expect(tag({ text: 'Virtual', strength: 'quiet' }, false)).not.toContain('border:');
    expect(tag({ text: 'Please RSVP', strength: 'strong' }, true)).not.toContain('border:');
    expect(tag({ text: 'Virtual', strength: 'quiet' }, false)).toContain('padding:2px 8px;');
  });
});

describe('bare web address links (spec 6.1, 2026-11-22)', () => {
  const url = 'https://www.signupgenius.com/go/4090F4CAEAE2AA4F58-61725464-stmichael';
  const anchors = (html: string): string[] => html.match(/<a [^>]*>[^<]*<\/a>/g) ?? [];

  it('adds word-break to an address link in an announcement paragraph only', () => {
    const html = render(
      message({
        paragraphs: [
          [
            t('Sign up here: '),
            t(url, { href: url }),
            t(' or '),
            t('Sign up', { href: 'https://example.org/s' }),
          ],
        ],
      }),
    );
    const [address, words] = anchors(html);
    expect(address).toContain(
      `style="color:${color.navy};font-weight:700;text-decoration:underline;word-break:break-all;"`,
    );
    expect(words).not.toContain('word-break');
    expect(words).toContain(
      `style="color:${color.navy};font-weight:700;text-decoration:underline;"`,
    );
  });

  it('applies the rule to www., and to no-space text with a dot and a slash', async () => {
    const { looksLikeWebAddress } = await import('../../src/templates/components');
    for (const s of [
      'www.example.org',
      'HTTP://x.org',
      'example.org/a/b',
      '<strong>https://a.b/c</strong>',
    ])
      expect(looksLikeWebAddress(s)).toBe(true);
    for (const s of ['Sign up', 'Read the guide.', 'and/or', 'example.org', 'a. b/c'])
      expect(looksLikeWebAddress(s)).toBe(false);
  });
});

describe('card table wraps long unbroken text (spec 6.1, 2026-11-22)', () => {
  const forms: [string, AnnouncementForm][] = [
    ['message', message()],
    ['call to action', cta()],
    ['date list', dateList(section({ rows: [row()] }))],
    ['help wanted', help()],
    ['link list', linkList()],
  ];
  for (const [name, form] of forms) {
    it(`${name}: the outer card table ends its style with word-break:break-word;`, () => {
      const html = render(form);
      const first = /^<table [^>]*style="([^"]*)"/.exec(html);
      expect(first?.[1]).toMatch(/;word-break:break-word;$/);
    });
  }
});
