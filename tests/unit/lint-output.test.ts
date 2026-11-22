import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EM_DASH, lintOutput } from '../../src/core/lint-output';

const weeklyDir = join(__dirname, '../fixtures/weekly');
const monthlyDir = join(__dirname, '../fixtures/monthly');

describe('output linter', () => {
  const weekly = readdirSync(weeklyDir).filter((f) => f.endsWith('.expected.html'));

  it('finds the five approved weekly announcements', () => {
    expect(weekly).toHaveLength(5);
  });

  it.each(weekly)('approved announcement %s meets the output contract', (file) => {
    expect(lintOutput(readFileSync(join(weeklyDir, file), 'utf8'))).toEqual([]);
  });

  it('flags the known defects in the original November letter', () => {
    const problems = lintOutput(readFileSync(join(monthlyDir, '2026-11.original.html'), 'utf8'), {
      monthly: true,
    });
    expect(problems).toContain('contains calc()');
    expect(problems).toContain('link is not absolute: meet.google.com/vgn-rwmf-fmz');
    expect(problems).toContain('image without alt text');
    expect(problems).toContain('layout table with a percentage width other than 100%');
    expect(problems).toContain('contains a class attribute');
    expect(problems).toContain('contains an id attribute');
  });

  it('rejects hostile markup', () => {
    const problems = lintOutput(
      '<a href="javascript:alert(1)" onclick="x()">hi</a><script>1</script>',
    );
    expect(problems).toContain('contains <script>');
    expect(problems).toContain('contains an event handler attribute');
    expect(problems).toContain('link is not absolute: javascript:alert(1)');
  });

  // Fixed in Phase 4: rgb() colors became token hex, the TroopTrack attachment line (with its
  // class) was removed because attachments are added in TroopTrack after pasting (spec 8.2), the
  // logo gained a max-width, and the photo wrappers moved from #8A90A6 to muted so alt text shown
  // in place of a blocked image meets 4.5:1.
  it('passes the corrected monthly letter with the monthly option', () => {
    const corrected = readFileSync(join(monthlyDir, '2026-11.corrected.html'), 'utf8');
    expect(lintOutput(corrected, { monthly: true })).toEqual([]);
  });

  it('rejects colors that are not tokens and em dashes', () => {
    expect(lintOutput(`<p style="color:#FF0000">a ${EM_DASH} b</p>`)).toEqual([
      'contains an em dash',
      'color #FF0000 is not a token',
    ]);
  });

  describe('escaped user text is not a defect', () => {
    it.each([
      'user id=5',
      'see #ABCDEF',
      'calc(2+2)',
      'class=4b',
      'data-x=1',
      'onload=',
      'rgb(1,2,3)',
      'style=color:#123456',
    ])('accepts %s in a paragraph', (text) => {
      expect(lintOutput(`<p style="color:#1B1F2E;">${text}</p>`)).toEqual([]);
    });

    it('accepts a link whose URL has a hash that looks like a color', () => {
      const html = '<a href="https://x.org/page#abcdef?a=1&amp;b=2">x</a>';
      expect(lintOutput(html)).toEqual([]);
    });

    it('accepts such text in an attribute value', () => {
      expect(
        lintOutput('<a href="https://x.org/" title="id=5 calc( #ABCDEF onload=">x</a>'),
      ).toEqual([]);
    });

    it('does not treat a ">" inside a quoted attribute as the end of the tag', () => {
      expect(lintOutput('<p title="a>b" class="x">t</p>')).toEqual(['contains a class attribute']);
    });
  });

  describe('true positives', () => {
    it.each([
      ['<p class="a">x</p>', 'contains a class attribute'],
      ["<p class='a'>x</p>", 'contains a class attribute'],
      ['<p class=a>x</p>', 'contains a class attribute'],
      ['<p ID="a">x</p>', 'contains an id attribute'],
      ['<p data-x="1">x</p>', 'contains a data- attribute'],
      [
        '<img src="https://x.org/a.png" alt="a" style="max-width:100%" onerror="x()">',
        'contains an event handler attribute',
      ],
      [
        '<img src="https://x.org/a.png" alt="a" style="max-width:100%" onerror=x()>',
        'contains an event handler attribute',
      ],
      ['<p style="color:#FF0000">x</p>', 'color #FF0000 is not a token'],
      ['<p style="color:#f00">x</p>', 'color #f00 is not a token'],
      ['<p style="width:calc(1px + 2px)">x</p>', 'contains calc()'],
      ['<p style="color:rgb(1,2,3)">x</p>', 'contains an rgb() color; use token hex values'],
      [`<p>a${EM_DASH}b</p>`, 'contains an em dash'],
      ['<a href="/relative">x</a>', 'link is not absolute: /relative'],
      ['<a href="javascript:alert(1)">x</a>', 'link is not absolute: javascript:alert(1)'],
      [
        '<a href="&#106;avascript:alert(1)">x</a>',
        'link is not absolute: &#106;avascript:alert(1)',
      ],
      ['<a>x</a>', 'link without href'],
      ['<img src="https://x.org/a.png" style="max-width:100%">', 'image without alt text'],
      ['<img src="https://x.org/a.png" alt="a">', 'image without max-width'],
      ['<script>1</script>', 'contains <script>'],
      ['<style>p{}</style>', 'contains <style>'],
      [
        '<table style="width:50%"><tr><td>x</td></tr></table>',
        'layout table with a percentage width other than 100%',
      ],
      [
        '<table width="50%"><tr><td>x</td></tr></table>',
        'layout table with a percentage width other than 100%',
      ],
      ['<table><tr><td width="96">x</td></tr></table>', 'retired two-column date row'],
    ])('catches %s', (html, expected) => {
      expect(lintOutput(html)).toContain(expected);
    });

    it('accepts a table at 100%', () => {
      expect(
        lintOutput('<table width="100%" style="width:100%"><tr><td>x</td></tr></table>'),
      ).toEqual([]);
    });
  });

  describe('color attributes', () => {
    it('fails a non-token bgcolor', () => {
      expect(lintOutput('<table><tr><td bgcolor="#123456">x</td></tr></table>')).toContain(
        'color #123456 is not a token',
      );
    });

    it('fails a non-token color attribute', () => {
      expect(lintOutput('<p color="#123456">x</p>')).toContain('color #123456 is not a token');
    });

    it('passes a token bgcolor', () => {
      expect(lintOutput('<table><tr><td bgcolor="#151B4D">x</td></tr></table>')).toEqual([]);
    });

    it('passes bgcolor written as escaped text', () => {
      expect(lintOutput('<p>bgcolor=&quot;#123456&quot;</p>')).toEqual([]);
    });
  });

  describe('buttons', () => {
    const button = (style: string) => `<a href="https://x.org/" style="${style}">Go</a>`;

    it('fails a short button with padding 4px and line-height 18px', () => {
      expect(lintOutput(button('display:inline-block;padding:4px;line-height:18px;'))).toEqual([
        'button shorter than 44px',
      ]);
    });

    it('fails when line-height is missing', () => {
      expect(lintOutput(button('display:inline-block;padding:13px 22px;'))).toContain(
        'button shorter than 44px',
      );
    });

    it('fails when longhand padding is short', () => {
      expect(
        lintOutput(
          button('display:inline-block;padding-top:5px;padding-bottom:5px;line-height:18px'),
        ),
      ).toContain('button shorter than 44px');
    });

    it('passes the canonical 13px padding, 18px line-height button (44px exactly)', () => {
      expect(
        lintOutput(button('display:inline-block;padding:13px 22px;line-height:18px;')),
      ).toEqual([]);
    });

    it('does not apply to links that are not inline-block buttons', () => {
      expect(lintOutput(button('color:#151B4D;text-decoration:underline;'))).toEqual([]);
    });
  });

  describe('div nesting', () => {
    it('allows sibling divs', () => {
      expect(lintOutput('<div>a</div><div>b</div>')).toEqual([]);
    });

    it('fails a div directly inside a div', () => {
      expect(lintOutput('<div><div>a</div></div>')).toContain('div nested inside another div');
    });

    it('fails a div indirectly inside a div', () => {
      expect(lintOutput('<div><table><tr><td><div>a</div></td></tr></table></div>')).toContain(
        'div nested inside another div',
      );
    });
  });

  describe('monthly option', () => {
    const mso =
      '<!--[if mso]><v:roundrect class="x" id="y" style="color:#123456"></v:roundrect><![endif]-->';

    it('strips Outlook conditional comments only when monthly is true', () => {
      expect(lintOutput(mso, { monthly: true })).toEqual([]);
      expect(lintOutput(mso)).toEqual([]);
      expect(lintOutput(`${mso}<p class="a">x</p>`, { monthly: true })).toEqual([
        'contains a class attribute',
      ]);
    });
  });
});

describe('lintOutput: owner decisions of 2026-11-21', () => {
  it('accepts an image with an empty alt attribute, kept on purpose', () => {
    expect(lintOutput('<img src="https://x.org/a.png" alt="" style="max-width:100%">')).toEqual([]);
  });

  it('accepts the Outlook padding on a button cell', () => {
    expect(
      lintOutput(
        '<table role="presentation"><tr><td style="background-color:#151B4D;border-radius:8px;mso-padding-alt:13px 22px;"><a href="https://x.org" style="display:inline-block;padding:13px 22px;line-height:18px;">Go</a></td></tr></table>',
      ),
    ).toEqual([]);
  });

  it('rejects #8A90A6, retired 2026-11-22 because it fails 4.5:1 for alt text', () => {
    expect(lintOutput('<p style="color:#8A90A6;">x</p>')).toEqual(['color #8A90A6 is not a token']);
  });
});
