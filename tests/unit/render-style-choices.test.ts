/** Style choices (owner decision 2026-11-22): gold button and yellow box. Defaults unchanged. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { color } from '../../src/config/tokens';
import type {
  AnnouncementForm,
  ButtonField,
  CallToActionForm,
  HelpWantedForm,
  MessageForm,
  RichText,
} from '../../src/core/forms';
import { lintOutput } from '../../src/core/lint-output';
import { renderAnnouncement } from '../../src/core/render';

const t = (text: string): RichText => [{ kind: 'text', text, marks: [] }];
const btn = (c?: 'navy' | 'gold'): ButtonField => ({
  text: 'Go',
  url: 'https://example.org/go',
  ...(c ? { color: c } : {}),
});

function render(form: AnnouncementForm): string {
  const html = renderAnnouncement(form);
  expect(lintOutput(html)).toEqual([]);
  expect(html).not.toContain(String.fromCharCode(0x2014));
  return html;
}

const message = (over: Partial<MessageForm> = {}): MessageForm => ({
  layout: 'message',
  label: 'L',
  title: 'T',
  paragraphs: [t('One')],
  ...over,
});
const cta = (over: Partial<CallToActionForm> = {}): CallToActionForm => ({
  layout: 'call-to-action',
  label: 'L',
  title: 'T',
  paragraph: t('Ask'),
  button: btn(),
  ...over,
});
const help = (main?: 'navy' | 'gold', second?: 'navy' | 'gold'): HelpWantedForm => ({
  layout: 'help-wanted',
  label: 'L',
  title: 'T',
  intro: [],
  ask: { badge: '', title: 'Need', paragraphs: [t('Please')], button: btn(main) },
  outro: [],
  secondary: btn(second),
});

const goldCell = `<td bgcolor="${color.gold}" style="background-color:${color.gold};border-radius:8px;mso-padding-alt:13px 22px;">`;
const navyCell = `<td bgcolor="${color.navy}" style="background-color:${color.navy};border-radius:8px;mso-padding-alt:13px 22px;">`;
const lavCell = `<td bgcolor="${color.lavender}" style="background-color:${color.lavender};border-radius:8px;mso-padding-alt:13px 22px;">`;
const count = (html: string, s: string): number => html.split(s).length - 1;
const panels = (html: string): number => count(html, `bgcolor="${color.goldPale}"`);

/** WCAG contrast ratio of two #RRGGBB colors. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('gold button', () => {
  it('navy text on gold passes AA, white on gold does not', () => {
    expect(contrast(color.navy, color.gold)).toBeGreaterThan(7);
    expect(contrast(color.white, color.gold)).toBeLessThan(3);
  });

  it('Message, Call to action and Help wanted main button turn gold with navy text', () => {
    for (const html of [
      render(message({ button: btn('gold') })),
      render(cta({ button: btn('gold') })),
      render(help('gold')),
    ]) {
      expect(html).toContain(goldCell);
      expect(html).toContain(
        `color:${color.navy};font-size:16px;font-weight:700;line-height:18px;`,
      );
      expect(html).not.toContain(`color:${color.white};font-size:16px`);
    }
  });

  it('gold replaces lavender on the Help wanted secondary button', () => {
    const html = render(help(undefined, 'gold'));
    expect(html).toContain(goldCell);
    expect(html).not.toContain(lavCell);
    expect(html).toContain(navyCell);
  });

  it('missing or navy colour is unchanged', () => {
    const plain = render(message({ button: btn() }));
    expect(render(message({ button: btn('navy') }))).toBe(plain);
    expect(plain).toContain(navyCell);
    expect(plain).not.toContain(goldCell);
    expect(render(help())).toContain(lavCell);
    expect(render(help('navy', 'navy'))).toBe(render(help()));
  });
});

describe('yellow box: Message', () => {
  it('one boxed paragraph gets one panel with margin 0', () => {
    const html = render(message({ paragraphs: [t('Boxed')], boxed: [true] }));
    expect(panels(html)).toBe(1);
    expect(html).toContain('<p style="margin:0;">Boxed</p>');
  });

  it('adjacent boxed paragraphs share one panel and keep 14px between them', () => {
    const html = render(message({ paragraphs: [t('A'), t('B')], boxed: [true, true] }));
    expect(panels(html)).toBe(1);
    expect(html).toContain('<p style="margin:0 0 14px 0;">A</p>');
    expect(html).toContain('<p style="margin:0;">B</p>');
  });

  it('boxed, plain, boxed makes two panels with 14px gaps and a gold button below', () => {
    const html = render(
      message({
        paragraphs: [t('A'), t('B'), t('C')],
        boxed: [true, false, true],
        button: btn('gold'),
      }),
    );
    expect(panels(html)).toBe(2);
    expect(html).toContain('<p style="margin:0 0 14px 0;">B</p>');
    expect(count(html, 'height:14px;line-height:14px;')).toBe(2);
    expect(html.indexOf('>C<')).toBeLessThan(html.indexOf('height:14px', html.indexOf('>C<')));
    expect(html).toContain(goldCell);
  });

  it('a plain paragraph before a box has 14px below it', () => {
    const html = render(message({ paragraphs: [t('A'), t('B')], boxed: [false, true] }));
    expect(html).toContain('<p style="margin:0 0 14px 0;">A</p>');
    expect(count(html, 'height:14px')).toBe(0);
  });

  it('an empty boxed paragraph gives no panel', () => {
    const html = render(message({ paragraphs: [t('A'), t('  ')], boxed: [false, true] }));
    expect(panels(html)).toBe(0);
    expect(html).toContain('<p style="margin:0;">A</p>');
  });

  it('a short boxed array means false and extra entries are ignored', () => {
    const short = render(message({ paragraphs: [t('A'), t('B')], boxed: [true] }));
    expect(panels(short)).toBe(1);
    expect(short).toContain('<p style="margin:0;">B</p>');
    const long = render(message({ paragraphs: [t('A')], boxed: [false, true, true] }));
    expect(panels(long)).toBe(0);
    expect(long).toBe(render(message({ paragraphs: [t('A')] })));
  });

  it('unboxed output is identical to no boxed field', () => {
    const f = message({ paragraphs: [t('A'), t('B')], button: btn() });
    expect(render({ ...f, boxed: [false, false] })).toBe(render(f));
  });
});

describe('yellow box: Call to action', () => {
  it('boxed paragraph has a 14px gap before its button', () => {
    const html = render(cta({ boxed: true, button: btn('gold') }));
    expect(panels(html)).toBe(1);
    const gap = html.indexOf('height:14px;line-height:14px;');
    expect(gap).toBeGreaterThan(html.indexOf('>Ask<'));
    expect(gap).toBeLessThan(html.indexOf(goldCell));
  });

  it('an empty boxed paragraph gives no panel', () => {
    const html = render(cta({ paragraph: t(''), boxed: true }));
    expect(panels(html)).toBe(0);
    expect(html).not.toContain('height:14px');
  });

  it('boxed false is identical to missing', () => {
    expect(render(cta({ boxed: false }))).toBe(render(cta()));
  });
});

describe('goldens unchanged', () => {
  const dir = join(__dirname, '../fixtures/weekly');
  const layoutOnly = (html: string): string => html.replace(/>\s*\n\s*</g, '><').trim();
  it.each([
    '1-pack-calendar',
    '2-help-needed',
    '3-year-in-review-photos',
    '4-in-the-news',
    '5-webelos-dens-10-11',
  ])('%s', (name) => {
    const form = JSON.parse(
      readFileSync(join(dir, `${name}.form.json`), 'utf8'),
    ) as AnnouncementForm;
    const expected = readFileSync(join(dir, `${name}.expected.html`), 'utf8');
    expect(layoutOnly(render(form))).toBe(layoutOnly(expected));
  });
});
