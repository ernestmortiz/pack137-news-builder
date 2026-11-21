import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IssueCode } from '../../src/core/model';
import { sanitize } from '../../src/core/sanitize';

const EM_DASH = String.fromCharCode(0x2014);

function codes(html: string): IssueCode[] {
  return sanitize(html).issues.map((issue) => issue.code);
}

function details(html: string, code: IssueCode): (string | undefined)[] {
  return sanitize(html)
    .issues.filter((issue) => issue.code === code)
    .map((issue) => issue.detail);
}

describe('sanitize: time budget for a very large paste', () => {
  // First in the file on purpose. About two thirds of this time is the DOM parser, and a heap
  // already filled by the other large tests slows it further with work that is not sanitize's.
  // The other test files run at the same moment and compete for the processor, so a slow run
  // is tried again, up to three times. Work that grows with the square of the paste size fails
  // every time.
  it('handles 1 MB of unclosed bold, italic and link tags in under 2 seconds', () => {
    const count = 30000;
    const html = '<b><i><a href="https://x.org">t'.repeat(count);
    expect(html.length).toBeGreaterThan(900 * 1024);
    let result = sanitize('');
    let elapsed = Infinity;
    for (let attempt = 0; attempt < 3 && elapsed >= 2000; attempt += 1) {
      const started = performance.now();
      result = sanitize(html);
      elapsed = performance.now() - started;
    }
    const { root, issues } = result;
    expect(elapsed).toBeLessThan(2000);
    expect(issues).toEqual([]);
    // Counted by hand: a selector query over this many nodes takes longer than the work itself.
    let links = 0;
    let letters = 0;
    const pending: Node[] = [root];
    for (let node = pending.pop(); node; node = pending.pop()) {
      if (node.nodeType === 3) letters += (node.nodeValue ?? '').length;
      else if ((node as Element).tagName === 'A') {
        links += 1;
        expect((node as Element).getAttribute('href')).toBe('https://x.org');
      }
      for (const child of Array.from(node.childNodes)) pending.push(child);
    }
    expect(links).toBe(count);
    expect(letters).toBe(count);
  }, 30000);
});

describe('sanitize: dropped elements', () => {
  it('drops script, style and iframe with their contents and reports each tag once', () => {
    const { root, issues } = sanitize(
      '<p>Hi</p><script>alert(1)</script><style>p{color:red}</style>' +
        '<iframe title="x"></iframe><script>alert(2)</script><p>Bye</p>',
    );
    expect(root.querySelector('script, style, iframe')).toBeNull();
    expect(root.textContent).toBe('HiBye');
    const dropped = issues.filter((issue) => issue.code === 'dropped-element');
    expect(dropped.map((issue) => issue.detail).sort()).toEqual(['iframe', 'script', 'style']);
  });

  it('reports a script that the parser moved into the head', () => {
    expect(details('<script>alert(1)</script><p>Hi</p>', 'dropped-element')).toContain('script');
  });

  it('drops meta, title, link and base without reporting them', () => {
    const { root, issues } = sanitize(
      '<meta charset="utf-8"><title>Clip</title><link rel="stylesheet" href="https://x.org/a.css">' +
        '<base href="https://x.org/"><p>Hi</p>' +
        '<div><meta name="a" content="b"><link rel="x" href="https://x.org/b.css"><title>t</title><base href="https://y.org/">there</div>',
    );
    expect(root.querySelector('meta, title, link, base')).toBeNull();
    expect(root.textContent).toBe('Hithere');
    expect(issues).toEqual([]);
  });

  it('gives no issue for the meta charset that Chrome adds to a clipboard paste', () => {
    expect(codes("<meta charset='utf-8'><p>Pack meeting on Friday</p>")).toEqual([]);
  });

  it('still reports script, style, iframe, object, embed and form beside quiet head tags', () => {
    expect(
      details(
        '<meta charset="utf-8"><title>t</title><style>p{}</style><script>1</script><p>a</p>' +
          '<iframe></iframe><object></object><embed><form><p>x</p></form>',
        'dropped-element',
      ).sort(),
    ).toEqual(['embed', 'form', 'iframe', 'object', 'script', 'style']);
  });

  it('drops forms, media and embedded content', () => {
    const { root } = sanitize(
      '<form action="https://x.org"><input name="a"><button>Go</button><p>inside</p></form>' +
        '<object data="x"></object><embed src="x"><svg><circle r="1"></circle></svg>' +
        '<video src="x"></video><p>kept</p>',
    );
    expect(root.querySelector('form, input, button, object, embed, svg, video')).toBeNull();
    expect(root.textContent).toBe('kept');
  });

  it('removes comments, including Outlook conditional blocks', () => {
    const { root } = sanitize(
      '<!-- note --><p>a<!-- inner --></p><!--[if mso]><table><tr><td>mso</td></tr></table><![endif]-->',
    );
    expect(root.innerHTML).not.toContain('<!--');
    expect(root.textContent).toBe('a');
  });

  it('unwraps elements that are not on the allow list and keeps their text', () => {
    const { root } = sanitize('<section><article><p>One <mark>two</mark></p></article></section>');
    expect(root.innerHTML).toBe('<p>One two</p>');
  });
});

describe('sanitize: attributes', () => {
  it('removes class, id, data, style, target, rel and event handlers', () => {
    const { root } = sanitize(
      '<p class="a" id="isPasted" data-x="1" style="color:red" onclick="x()">' +
        '<a href="https://x.org" target="_blank" rel="noopener" onmouseover="x()" class="b">x</a></p>',
    );
    expect(root.innerHTML).toBe('<p><a href="https://x.org">x</a></p>');
  });

  it('turns a bold style span into strong before the style is removed', () => {
    const { root } = sanitize('<p><span style="font-weight: bold">Big</span> news</p>');
    expect(root.querySelector('strong')?.textContent).toBe('Big');
    expect(root.querySelector('[style]')).toBeNull();
  });

  it('treats numeric weights of 600 and above as bold, and lower ones as plain', () => {
    expect(
      sanitize('<p><span style="font-weight:700">a</span></p>').root.querySelector('strong'),
    ).not.toBeNull();
    expect(
      sanitize('<p><span style="font-weight:600">a</span></p>').root.querySelector('strong'),
    ).not.toBeNull();
    expect(
      sanitize('<p><span style="font-weight:400">a</span></p>').root.querySelector('strong'),
    ).toBeNull();
  });

  it('turns italic and line-through styles into em and s', () => {
    const { root } = sanitize(
      '<p><span style="font-style:italic">a</span>' +
        '<span style="text-decoration: underline line-through">b</span>' +
        '<span style="text-decoration-line:line-through">c</span></p>',
    );
    expect(root.querySelector('em')?.textContent).toBe('a');
    expect(Array.from(root.querySelectorAll('s')).map((el) => el.textContent)).toEqual(['b', 'c']);
  });

  it('does not double wrap an element that is already the matching tag', () => {
    const { root } = sanitize('<p><strong style="font-weight:bold">a</strong></p>');
    expect(root.innerHTML).toBe('<p><strong>a</strong></p>');
  });

  it('carries a bold style on a block down to its text', () => {
    const { root } = sanitize('<div style="font-weight:700">Legal and finance help</div>');
    expect(root.innerHTML).toBe('<div><strong>Legal and finance help</strong></div>');
  });

  it('drops a Google Docs style b wrapper that is styled as normal weight', () => {
    const { root } = sanitize(
      '<b style="font-weight:normal" id="docs-internal-guid-1"><p>a</p></b>',
    );
    expect(root.innerHTML).toBe('<p>a</p>');
  });
});

describe('sanitize: links', () => {
  it('keeps https and mailto links without an issue', () => {
    const { root, issues } = sanitize(
      '<a href="https://x.org/a?b=1#c">x</a><a href="mailto:cranfordpack137@gmail.com">m</a>',
    );
    expect(Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      'https://x.org/a?b=1#c',
      'mailto:cranfordpack137@gmail.com',
    ]);
    expect(issues).toEqual([]);
  });

  it('keeps http links unchanged and flags them', () => {
    const { root, issues } = sanitize('<a href="http://x.org/a">x</a>');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('http://x.org/a');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('insecure-url');
    expect(issues[0]?.detail).toBe('http://x.org/a');
  });

  it.each([
    'javascript:alert(1)',
    ' JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'java&#10;script:alert(1)',
    '&#1;javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://x.org/file',
    'https:alert(1)',
  ])('blocks the link %j and keeps its text', (href) => {
    const { root, issues } = sanitize(`<p><a href="${href}">click</a></p>`);
    expect(root.querySelector('a')).toBeNull();
    expect(root.innerHTML).toBe('<p>click</p>');
    expect(issues.map((issue) => issue.code)).toEqual(['blocked-url']);
  });

  it.each(['meet.google.com/vgn-rwmf-fmz', '/manage/troops', '#top', '', '//x.org/a'])(
    'reports %j as a link with no destination',
    (href) => {
      const { root, issues } = sanitize(`<p><a href="${href}">Join</a></p>`);
      expect(root.innerHTML).toBe('<p>Join</p>');
      expect(issues.map((issue) => issue.code)).toEqual(['link-no-destination']);
      expect(issues[0]?.detail).toBe(href);
    },
  );

  it('trims the href and strips control characters inside it', () => {
    const { root } = sanitize('<a href="  https://x.org/a\n/b\t ">x</a>');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://x.org/a/b');
  });

  it('keeps the words of a mailto subject that was typed with spaces', () => {
    const { root } = sanitize('<a href="mailto:a@b.org?subject=Help with setup">x</a>');
    expect(root.querySelector('a')?.getAttribute('href')).toBe(
      'mailto:a@b.org?subject=Help%20with%20setup',
    );
  });

  it('de-duplicates issues on code and detail', () => {
    const { issues } = sanitize(
      '<a href="http://x.org">a</a><a href="http://x.org">b</a><a href="http://y.org">c</a>',
    );
    expect(issues.map((issue) => issue.detail)).toEqual(['http://x.org', 'http://y.org']);
  });
});

describe('sanitize: images', () => {
  it('removes onerror and removes an image with a relative src', () => {
    const { root, issues } = sanitize('<p>a<img src=x onerror=alert(1)>b</p>');
    expect(root.innerHTML).toBe('<p>ab</p>');
    expect(root.innerHTML).not.toContain('onerror');
    expect(issues.map((issue) => issue.code)).toEqual(['blocked-url']);
  });

  it('removes images with a data, javascript or missing src', () => {
    expect(codes('<img src="data:image/png;base64,AAAA" alt="a">')).toEqual(['blocked-url']);
    expect(codes('<img src="javascript:alert(1)" alt="a">')).toEqual(['blocked-url']);
    expect(codes('<img alt="a">')).toEqual(['blocked-url']);
  });

  it('keeps src, alt, width and height and nothing else', () => {
    const { root, issues } = sanitize(
      '<img src="https://x.org/a.jpg" alt="A den" width="552" height="300px" class="fr-fic" style="width:552px" onload="x()">',
    );
    expect(root.innerHTML).toBe(
      '<img src="https://x.org/a.jpg" alt="A den" width="552" height="300">',
    );
    expect(issues).toEqual([]);
  });

  it('drops widths and heights that are not positive whole numbers', () => {
    const { root } = sanitize(
      '<img src="https://x.org/a.jpg" alt="a" width="100%" height="0"><img src="https://x.org/b.jpg" alt="b" width="auto" height="-4">',
    );
    for (const img of Array.from(root.querySelectorAll('img'))) {
      expect(img.hasAttribute('width')).toBe(false);
      expect(img.hasAttribute('height')).toBe(false);
    }
  });

  it('flags a missing or blank alt and leaves alt empty', () => {
    const { root, issues } = sanitize(
      '<img src="https://x.org/a.jpg"><img src="https://x.org/b.jpg" alt="  ">',
    );
    expect(Array.from(root.querySelectorAll('img')).map((img) => img.getAttribute('alt'))).toEqual([
      '',
      '',
    ]);
    expect(issues.map((issue) => [issue.code, issue.detail])).toEqual([
      ['image-no-alt', 'https://x.org/a.jpg'],
      ['image-no-alt', 'https://x.org/b.jpg'],
    ]);
  });

  it('flags an http image and keeps it', () => {
    const { root, issues } = sanitize('<img src="http://x.org/a.jpg" alt="a">');
    expect(root.querySelector('img')?.getAttribute('src')).toBe('http://x.org/a.jpg');
    expect(issues.map((issue) => issue.code)).toEqual(['insecure-url']);
  });
});

describe('sanitize: image size from inline style', () => {
  it('takes width and height from a px style when the attributes are missing', () => {
    const { root } = sanitize(
      '<img src="https://x.org/a.jpg" alt="a" style="border:0; WIDTH: 552px; height:300PX !important;">',
    );
    expect(root.innerHTML).toBe('<img src="https://x.org/a.jpg" alt="a" width="552" height="300">');
  });

  it('uses the style when the attribute is present but not a valid size', () => {
    const { root } = sanitize(
      '<img src="https://x.org/a.jpg" alt="a" width="100%" height="auto" style="width:480px;height:320px">',
    );
    expect(root.innerHTML).toBe('<img src="https://x.org/a.jpg" alt="a" width="480" height="320">');
  });

  it('prefers a valid attribute over the style', () => {
    const { root } = sanitize(
      '<img src="https://x.org/a.jpg" alt="a" width="90" style="width:552px;height:40px">',
    );
    expect(root.innerHTML).toBe('<img src="https://x.org/a.jpg" alt="a" width="90" height="40">');
  });

  it.each([
    'width:100%;height:auto',
    'width:auto;height:50%',
    'width:12.5px;height:3em',
    'width:0px;height:-4px',
    'max-width:552px;min-height:300px;line-height:20px',
    'width:calc(100% - 4px);height:px',
  ])('ignores the style %j', (style) => {
    const { root } = sanitize(`<img src="https://x.org/a.jpg" alt="a" style="${style}">`);
    expect(root.innerHTML).toBe('<img src="https://x.org/a.jpg" alt="a">');
  });
});

describe('sanitize: hidden content', () => {
  it.each([
    'display:none',
    'display: none',
    'DISPLAY : NONE ;',
    'color:red;display:none !important',
    'mso-hide:all',
    'Mso-Hide: All',
    'visibility:hidden',
    'visibility: HIDDEN;',
    'max-height:0;overflow:hidden',
    'overflow: hidden; font-size:1px; max-height: 0px',
    'max-height:0.0em !important;overflow:hidden',
  ])('removes an element styled %j together with its contents', (style) => {
    const { root, issues } = sanitize(
      `<p>before</p><div style="${style}">secret <a href="x.org">link</a><img src="x"><p>deep</p></div><p>after</p>`,
    );
    expect(root.innerHTML).toBe('<p>before</p><p>after</p>');
    expect(issues).toEqual([]);
  });

  it('removes hidden inline elements and hidden table cells', () => {
    const { root } = sanitize(
      '<p>a<span style="display:none">b</span>c</p>' +
        '<table><tr><td>d</td><td style="visibility:hidden">e</td></tr></table>',
    );
    expect(root.textContent).toBe('acd');
  });

  it('removes a hidden element that is not on the allow list', () => {
    const { root } = sanitize('<section style="display:none">a</section><p>b</p>');
    expect(root.innerHTML).toBe('<p>b</p>');
  });

  it.each([
    'max-height:0',
    'overflow:hidden',
    'max-height:10px;overflow:hidden',
    'display:block',
    'visibility:visible',
    'display:none;display:block',
    'mso-hide:none',
    'background:url(display:none.png)',
  ])('keeps an element styled %j', (style) => {
    const { root } = sanitize(`<div style="${style}">shown</div>`);
    expect(root.textContent).toBe('shown');
  });
});

describe('sanitize: hostile and malformed input', () => {
  it('does not throw on malformed markup', () => {
    for (const html of [
      '<p><b>unclosed <a href="https://x.org">x',
      '</div></p><<<>>><p',
      '<a href="https://x.org',
      '<table><td>stray<tr></table></span>',
      '',
      'plain text only',
      '<img src=',
    ]) {
      expect(() => sanitize(html)).not.toThrow();
    }
    const { root } = sanitize('<p><b>unclosed <a href="https://x.org">x');
    expect(root.textContent).toBe('unclosed x');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://x.org');
  });

  it('copes with thousands of nested wrappers without overflowing the stack', () => {
    const depth = 3000;
    const html = '<div style="font-weight:bold">'.repeat(depth) + 'deep' + '</div>'.repeat(depth);
    const { root } = sanitize(html);
    expect(root.textContent).toBe('deep');
    expect(root.querySelector('strong')).not.toBeNull();
  });

  it('handles a 1 MB paste in under 2 seconds', () => {
    const chunk =
      '<div class="fr-wrap" id="isPasted" style="color:red;font-weight:700" data-x="1">' +
      '<p style="margin:0" onclick="x()"><span style="font-style:italic">Pack meeting</span> on ' +
      '<a href="http://x.org/cal" target="_blank">the calendar</a> and <a href="javascript:alert(1)">here</a>' +
      '<img src="https://x.org/a.jpg" width="552"><!-- c --></p><script>alert(1)</script></div>\n';
    const html = chunk.repeat(Math.ceil((1024 * 1024) / chunk.length));
    expect(html.length).toBeGreaterThanOrEqual(1024 * 1024);
    const started = performance.now();
    const { root, issues } = sanitize(html);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(2000);
    expect(root.querySelector('script, [onclick], [style], [class], [id]')).toBeNull();
    // Repeats collapse to one issue each.
    expect(issues.map((issue) => issue.code).sort()).toEqual([
      'blocked-url',
      'dropped-element',
      'image-no-alt',
      'insecure-url',
    ]);
  });

  it('unwraps 3000 nested elements that are not on the allow list in under a second', () => {
    const depth = 3000;
    const html = '<section><article>'.repeat(depth) + 'deep' + '</article></section>'.repeat(depth);
    const started = performance.now();
    const { root } = sanitize(html);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(root.childNodes.length).toBe(1);
    expect(root.firstChild?.nodeValue).toBe('deep');
  });

  it('removes hidden and dropped content that is thousands of levels deep', () => {
    const deep = '<div>'.repeat(9000) + 'secret' + '</div>'.repeat(9000);
    const html = `<p>Hi</p><div style="display:none">${deep}</div><form>${deep}</form><p>Bye</p>`;
    const started = performance.now();
    const { root, issues } = sanitize(html);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(root.textContent).toBe('HiBye');
    expect(issues.map((issue) => issue.detail)).toEqual(['form']);
  });

  it('checks a link with no destination that wraps thousands of levels', () => {
    const depth = 9000;
    const html = `<a>${'<div>'.repeat(depth)}words${'</div>'.repeat(depth)}</a><a><img src="https://x.org/a.jpg" alt="A"></a>`;
    const started = performance.now();
    const { root, issues } = sanitize(html);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(issues.map((issue) => issue.code)).toEqual(['link-no-destination']);
    // Walk by hand: a tree this deep must not be read with a recursive DOM call.
    const tags = new Set<string>();
    const pending: Node[] = [root];
    for (let node = pending.pop(); node; node = pending.pop()) {
      if (node.nodeType === 1) tags.add((node as Element).tagName);
      pending.push(...Array.from(node.childNodes));
    }
    expect(Array.from(tags).sort()).toEqual(['BODY', 'DIV', 'IMG']);
    expect(sanitize(html).issues).toEqual(issues);
  });

  it.each([1, 199, 200, 201, 202, 399, 400, 401, 1000])(
    'keeps %i nested blocks whole when the element around them is unwrapped',
    (depth) => {
      // Tall content is moved in pieces. No depth may lose a piece or put one in the wrong place.
      const html =
        `<p>before</p><section>lead${'<div>'.repeat(depth)}<b>core</b> text` +
        `${'</div>'.repeat(depth)}<p>after</p>tail</section><p>end</p>`;
      const { root } = sanitize(html);
      const top = Array.from(root.childNodes);
      expect(top.map((node) => node.nodeName)).toEqual(['P', '#text', 'DIV', 'P', '#text', 'P']);
      expect(top.map((node) => (node.nodeType === 3 ? node.nodeValue : ''))).toEqual([
        '',
        'lead',
        '',
        '',
        'tail',
        '',
      ]);
      let levels = 0;
      let node: Node | undefined = top[2];
      while (node && node.nodeName === 'DIV') {
        levels += 1;
        const children: Node[] = Array.from(node.childNodes);
        if (levels < depth) expect(children.map((child) => child.nodeName)).toEqual(['DIV']);
        else expect(children.map((child) => child.nodeName)).toEqual(['B', '#text']);
        node = children[0];
      }
      expect(levels).toBe(depth);
      expect(node?.textContent).toBe('core');
    },
  );

  it('writes messages in plain words with no em dashes', () => {
    const { issues } = sanitize(
      '<script>1</script><a href="http://x.org">a</a><a href="javascript:1">b</a><a href="x.org">c</a>' +
        '<a>d</a><img src="x"><img><img src="http://x.org/a.jpg">',
    );
    expect(issues.length).toBeGreaterThanOrEqual(6);
    for (const issue of issues) {
      expect(issue.message.length).toBeGreaterThan(10);
      expect(issue.message).not.toContain(EM_DASH);
      expect(issue.message.toLowerCase()).not.toContain('sanitiz');
    }
    expect(issues.find((issue) => issue.code === 'insecure-url')?.message).toBe(
      'This link starts with http: rather than https:.',
    );
  });
});

describe('sanitize: November 2026 letter as pasted', () => {
  const html = readFileSync(join(__dirname, '../fixtures/monthly/2026-11.original.html'), 'utf8');
  const { root, issues } = sanitize(html);

  it('leaves no class, id or style attribute and no comments', () => {
    expect(root.querySelector('[class], [id], [style]')).toBeNull();
    expect(root.innerHTML).not.toContain('<!--');
    const allowed = new Set(['href', 'src', 'alt', 'width', 'height']);
    for (const el of Array.from(root.querySelectorAll('*'))) {
      for (const attr of Array.from(el.attributes)) {
        expect(allowed.has(attr.name)).toBe(true);
      }
    }
  });

  it('reports the bare meet.google.com link and the photos with no description', () => {
    expect(
      issues.some(
        (issue) =>
          issue.code === 'link-no-destination' && issue.detail === 'meet.google.com/vgn-rwmf-fmz',
      ),
    ).toBe(true);
    expect(issues.filter((issue) => issue.code === 'image-no-alt').length).toBeGreaterThan(0);
    expect(root.querySelector('a:not([href])')).toBeNull();
  });

  it('removes the hidden preview text and its zero-width padding', () => {
    // The preview div is the only place this sentence runs straight into the padding characters.
    expect(html).toContain('About an 8 minute read. \u034F');
    const text = root.textContent ?? '';
    const summary = 'Fall camping at Watchung and a big month around the pack.';
    // The sentence is shown once more in the visible summary line, and only there.
    expect(html.split(summary).length - 1).toBe(2);
    expect(text.split(summary).length - 1).toBe(1);
    for (const code of [0x200c, 0x034f, 0x00ad, 0x200b, 0xfeff]) {
      expect(text.includes(String.fromCharCode(code))).toBe(false);
    }
  });

  it('gives no dropped-element issue for hidden content or head tags', () => {
    const dropped = issues
      .filter((issue) => issue.code === 'dropped-element')
      .map((issue) => issue.detail);
    for (const tag of ['meta', 'title', 'link', 'base', 'div']) {
      expect(dropped).not.toContain(tag);
    }
  });

  it('takes each photo width from its inline style', () => {
    const widths = Array.from(root.querySelectorAll('img')).map((img) => [
      (img.getAttribute('src') ?? '').split('/').pop(),
      img.getAttribute('width'),
      img.getAttribute('height'),
    ]);
    expect(widths).toEqual([
      ['pack137_logo_800.jpg', '90', '90'],
      ['01-opening-campfire-circle.jpg', '552', null],
      ['02-justin-skit-rehearsal.jpg', '533', null],
      ['03-alex-sunfish.jpg', '552', null],
      ['04-ryan-hiking-station.jpg', '547', null],
      ['05-nico-bannock-on-sticks.jpg', '552', null],
      ['06-nico-recipe-bannock-closeup.jpg', '426', null],
      ['07-david-tarp-shelter.jpg', '492', null],
    ]);
  });
});

describe('sanitize: control characters', () => {
  const NUL = String.fromCharCode(0);
  /** Every C0 control character except tab, newline and carriage return, plus delete. */
  const CONTROLS = Array.from({ length: 32 }, (_, code) => code)
    .filter((code) => code !== 9 && code !== 10 && code !== 13)
    .concat(0x7f)
    .map((code) => String.fromCharCode(code));

  function hasControl(text: string): boolean {
    return CONTROLS.some((control) => text.includes(control));
  }

  it('strips NUL from text', () => {
    const { root } = sanitize(`<p>Pack${NUL} 137${NUL}${NUL} news</p>`);
    expect(root.querySelector('p')?.textContent).toBe('Pack 137 news');
  });

  it('strips every other C0 control character and delete from text', () => {
    // Form feed is left out here: it is white space between words (see the next test).
    const noise = CONTROLS.filter((control) => control !== '\f').join('');
    const { root } = sanitize(`<p>Pa${noise}ck <b>me${noise}et${noise}ing</b></p>${noise}`);
    expect(root.textContent).toBe('Pack meeting');
    expect(hasControl(root.textContent ?? '')).toBe(false);
  });

  it('keeps tab, newline and carriage return in text', () => {
    const { root } = sanitize('<p>one\ttwo\nthree\rfour</p>');
    // The parser may rewrite a carriage return as a newline. Either way the words stay apart.
    expect(root.textContent).toMatch(/^one\ttwo\nthree[\r\n]four$/);
  });

  it('turns a form feed into a space so the words either side stay apart', () => {
    const { root } = sanitize('<p>one\ftwo</p>');
    expect(root.textContent).toBe('one two');
  });

  it('drops a text node that held only control characters', () => {
    const { root } = sanitize(`<p>${NUL}\u0001\u001f</p>`);
    expect(root.querySelector('p')?.childNodes.length).toBe(0);
  });

  it('strips control characters from alt text', () => {
    const noise = CONTROLS.filter((control) => control !== '\f').join('');
    const { root, issues } = sanitize(
      `<img src="https://x.org/a.jpg" alt="Cam${noise}pfire\tcircle">` +
        `<img src="https://x.org/b.jpg" alt="${NUL}\u0001">`,
    );
    const alts = Array.from(root.querySelectorAll('img')).map((img) => img.getAttribute('alt'));
    expect(alts).toEqual(['Campfire\tcircle', '']);
    // An alt made only of control characters is no description at all.
    expect(issues.map((issue) => [issue.code, issue.detail])).toEqual([
      ['image-no-alt', 'https://x.org/b.jpg'],
    ]);
  });

  it('strips control characters from href and src, tab and newline included', () => {
    const noise = CONTROLS.join('') + '\t\n\r';
    const { root, issues } = sanitize(
      `<a href="https://x.org/${noise}cal">c</a><img src="https://x.org/${noise}a.jpg" alt="A">` +
        `<a href="java${NUL}script:alert(1)">bad</a>`,
    );
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://x.org/cal');
    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://x.org/a.jpg');
    expect(root.querySelectorAll('a').length).toBe(1);
    expect(issues.map((issue) => [issue.code, issue.detail])).toEqual([
      ['blocked-url', 'javascript:alert(1)'],
    ]);
  });

  it('leaves no control character in any text node or attribute value', () => {
    const noise = CONTROLS.join('');
    const { root, issues } = sanitize(
      `<div title="${noise}">a${noise}b<a href="mailto:x@y.org?subject=Hi${noise}">m${noise}</a>` +
        `<img src="https://x.org/a.jpg" alt="x${noise}y" width="5${NUL}52" height="${NUL}"></div>`,
    );
    const pending: Node[] = [root];
    for (let node = pending.pop(); node; node = pending.pop()) {
      if (node.nodeType === 3) expect(hasControl(node.nodeValue ?? '')).toBe(false);
      if (node.nodeType === 1) {
        for (const attribute of Array.from((node as Element).attributes)) {
          expect(hasControl(attribute.value)).toBe(false);
        }
      }
      pending.push(...Array.from(node.childNodes));
    }
    for (const issue of issues)
      expect(hasControl(`${issue.message}${issue.detail ?? ''}`)).toBe(false);
  });
});
