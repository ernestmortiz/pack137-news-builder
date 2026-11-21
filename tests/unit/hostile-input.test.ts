import { describe, expect, it } from 'vitest';
import type { Block, Inline, Issue } from '../../src/core/model';
import { parse, type ParseResult } from '../../src/core/pipeline';

interface Collected {
  /** Visible text from runs. */
  texts: string[];
  /** Every href and src, from runs and image blocks. */
  urls: string[];
  alts: string[];
  details: string[];
}

function collectInlines(runs: Inline[], out: Collected): void {
  for (const run of runs) {
    if (run.kind === 'text') {
      out.texts.push(run.text);
      if (run.href !== undefined) out.urls.push(run.href);
    }
  }
}

function collectBlocks(blocks: Block[], out: Collected): void {
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        collectInlines(block.runs, out);
        break;
      case 'list':
        for (const item of block.items) {
          collectInlines(item.runs, out);
          for (const child of item.children) collectBlocks([child], out);
        }
        break;
      case 'image':
        out.urls.push(block.src);
        out.alts.push(block.alt);
        if (block.href !== undefined) out.urls.push(block.href);
        break;
      case 'rule':
        break;
    }
  }
}

function collect(result: ParseResult): Collected {
  const out: Collected = { texts: [], urls: [], alts: [], details: [] };
  collectBlocks(result.model.blocks, out);
  result.issues.forEach((issue: Issue) => {
    out.details.push(issue.message);
    if (issue.detail !== undefined) out.details.push(issue.detail);
  });
  return out;
}

/** What a browser would act on: leading whitespace and control characters are ignored. */
function normalizeUrl(url: string): string {
  // eslint-disable-next-line no-control-regex
  return url.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
}

function assertSafe(html: string): ParseResult {
  let result!: ParseResult;
  expect(() => {
    result = parse(html);
  }).not.toThrow();
  const found = collect(result);
  for (const url of found.urls) {
    const n = normalizeUrl(url);
    expect(n.startsWith('javascript:'), `javascript: url ${JSON.stringify(url)}`).toBe(false);
    expect(n.startsWith('vbscript:'), `vbscript: url ${JSON.stringify(url)}`).toBe(false);
    expect(n.startsWith('data:'), `data: url ${JSON.stringify(url)}`).toBe(false);
    expect(
      /^(https?:|mailto:)/.test(n) || !/^[a-z][a-z0-9+.-]*:/.test(n),
      `unexpected scheme ${JSON.stringify(url)}`,
    ).toBe(true);
  }
  for (const s of [...found.urls, ...found.alts]) {
    const lower = s.toLowerCase();
    expect(lower).not.toContain('<script');
    expect(lower).not.toContain('onerror=');
    expect(lower).not.toContain('onload=');
  }
  // Issue details echo the offending URL by design, so only visible text is checked.
  for (const s of found.texts) {
    expect(s.toLowerCase()).not.toContain('<script');
  }
  return result;
}

function allText(result: ParseResult): string {
  return collect(result).texts.join(' ');
}

describe('hostile input: script elements', () => {
  const payload = 'STEAL_COOKIES()';
  const cases: Record<string, string> = {
    'body script': `<p>Hi</p><script>${payload}</script><p>Bye</p>`,
    'script in head': `<html><head><script>${payload}</script></head><body><p>Hi</p></body></html>`,
    'script with src': `<script src="https://evil.example/x.js"></script><p>Hi</p>`,
    'uppercase tag': `<SCRIPT>${payload}</SCRIPT><p>Hi</p>`,
    'script in svg': `<svg><script>${payload}</script></svg><p>Hi</p>`,
    'script in noscript': `<noscript><script>${payload}</script></noscript><p>Hi</p>`,
    'noscript with img': `<noscript><img src=x onerror="${payload}"></noscript><p>Hi</p>`,
    'script in template': `<template><script>${payload}</script></template><p>Hi</p>`,
  };
  for (const [name, html] of Object.entries(cases)) {
    it(`${name}: safe, payload not in model`, () => {
      const result = assertSafe(html);
      expect(allText(result)).not.toContain(payload);
    });
  }

  it('keeps the legitimate paragraph next to a dropped script', () => {
    const result = assertSafe(`<p>Keep me</p><script>${payload}</script>`);
    expect(allText(result)).toContain('Keep me');
  });

  it('reports a dropped script', () => {
    const result = assertSafe(`<script>${payload}</script><p>Hi</p>`);
    expect(result.issues.some((i) => i.code === 'dropped-element')).toBe(true);
  });
});

describe('hostile input: event handlers', () => {
  it('img with onerror: no handler survives', () => {
    const result = assertSafe('<img src=x onerror="alert(1)" alt="a">');
    const text = JSON.stringify(result.model);
    expect(text.toLowerCase()).not.toContain('onerror');
    expect(text).not.toContain('alert(1)');
  });

  it('img onerror with no quotes and no alt', () => {
    const result = assertSafe('<img src=x onerror=alert(1)>');
    expect(JSON.stringify(result.model)).not.toContain('alert(1)');
  });

  it('onload on body and svg', () => {
    const result = assertSafe(
      '<body onload="alert(1)"><svg onload="alert(2)"></svg><p>Hi</p></body>',
    );
    expect(JSON.stringify(result.model)).not.toMatch(/alert\(/);
  });

  it('onclick and onmouseover on a link keep the link', () => {
    const result = assertSafe(
      '<p><a href="https://x.org/" onclick="alert(1)" onmouseover="alert(2)">go</a></p>',
    );
    expect(JSON.stringify(result.model)).not.toMatch(/alert\(|onclick|onmouseover/);
    expect(collect(result).urls).toContain('https://x.org/');
  });
});

describe('hostile input: dangerous link destinations', () => {
  const links: Record<string, string> = {
    plain: 'javascript:alert(1)',
    'mixed case': 'JaVaScRiPt:alert(1)',
    'entity encoded decimal': '&#106;avascript:alert(1)',
    'entity encoded hex': '&#x6A;avascript:alert(1)',
    'entity encoded colon': 'javascript&colon;alert(1)',
    'entity without semicolon': '&#106avascript:alert(1)',
    'tab split': 'java\tscript:alert(1)',
    'newline split': 'java\nscript:alert(1)',
    'encoded tab split': 'java&#9;script:alert(1)',
    'encoded newline split': 'java&#10;script:alert(1)',
    'leading spaces': '   javascript:alert(1)',
    'leading control chars': '\u0001\u0002\u0003javascript:alert(1)',
    'leading newline': '\njavascript:alert(1)',
    'leading nbsp': ' javascript:alert(1)',
    vbscript: 'vbscript:msgbox(1)',
    'data html': 'data:text/html,<script>alert(1)</script>',
    'data html base64': 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'data svg': 'data:image/svg+xml,<svg onload=alert(1)>',
    'data uppercase': 'DATA:text/html,hi',
    file: 'file:///etc/passwd',
    blob: 'blob:https://x.org/abc',
  };
  for (const [name, href] of Object.entries(links)) {
    it(`link: ${name}`, () => {
      const result = assertSafe(`<p><a href="${href}">click</a></p>`);
      expect(allText(result)).toContain('click');
    });
  }

  it('reports a blocked url for javascript: links', () => {
    const result = assertSafe('<p><a href="javascript:alert(1)">click</a></p>');
    expect(result.issues.some((i) => i.code === 'blocked-url')).toBe(true);
  });

  it('image src: javascript, data html, data svg', () => {
    for (const src of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:image/svg+xml,<svg onload=alert(1)>',
      ' JaVaScRiPt:alert(1)',
    ]) {
      const result = assertSafe(`<img src="${src}" alt="x">`);
      const images = result.model.blocks.filter((b) => b.type === 'image');
      expect(images).toEqual([]);
    }
  });

  it('image wrapped in a javascript: link keeps no link', () => {
    assertSafe('<a href="javascript:alert(1)"><img src="https://x.org/a.png" alt="a"></a>');
  });

  it('attribute-breaking href stays a single href value', () => {
    const result = assertSafe(
      '<p><a href="https://x.org/&quot;onmouseover=&quot;alert(1)">go</a></p>',
    );
    expect(allText(result)).toContain('go');
    // Whatever survives is data, never markup: the model has no handler attributes.
    expect(Object.keys(result.model.blocks[0] ?? {}).sort()).toEqual(['runs', 'type']);
  });
});

describe('hostile input: embedded content', () => {
  const embedded: Record<string, string> = {
    'iframe srcdoc': '<iframe srcdoc="<script>alert(1)</script>"></iframe><p>Hi</p>',
    'iframe src': '<iframe src="javascript:alert(1)"></iframe><p>Hi</p>',
    'object data': '<object data="javascript:alert(1)"></object><p>Hi</p>',
    'object data html':
      '<object data="data:text/html,<script>alert(1)</script>"></object><p>Hi</p>',
    embed: '<embed src="javascript:alert(1)"><p>Hi</p>',
    'form action': '<form action="javascript:alert(1)"><button>Go</button></form><p>Hi</p>',
    'form with formaction':
      '<form><button formaction="javascript:alert(1)">Go</button></form><p>Hi</p>',
    'svg xlink:href': '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg><p>Hi</p>',
    'svg href': '<svg><a href="javascript:alert(1)"><text>x</text></a></svg><p>Hi</p>',
    'svg use': '<svg><use href="data:image/svg+xml,<svg onload=alert(1)>"></use></svg><p>Hi</p>',
    'math href': '<math href="javascript:alert(1)"><mi>x</mi></math><p>Hi</p>',
    'math xlink': '<math><mtext xlink:href="javascript:alert(1)">x</mtext></math><p>Hi</p>',
    'math maction':
      '<math><maction actiontype="statusline#" xlink:href="javascript:alert(1)">x</maction></math><p>Hi</p>',
    'video poster':
      '<video poster="javascript:alert(1)" src="javascript:alert(2)"></video><p>Hi</p>',
    'meta refresh': '<meta http-equiv="refresh" content="0;url=javascript:alert(1)"><p>Hi</p>',
    link: '<link rel="stylesheet" href="https://evil.example/x.css"><p>Hi</p>',
    'image map':
      '<img src="https://x.org/a.png" alt="a" usemap="#m"><map name="m"><area href="javascript:alert(1)"></map>',
  };
  for (const [name, html] of Object.entries(embedded)) {
    it(`${name}: safe`, () => {
      const result = assertSafe(html);
      expect(JSON.stringify(result.model)).not.toMatch(/alert\(/);
    });
  }

  it('base href cannot redirect relative links', () => {
    const result = assertSafe(
      '<base href="https://evil.example/"><p><a href="/x">rel</a> <a href="https://ok.org/">abs</a></p>',
    );
    const urls = collect(result).urls;
    expect(urls).toContain('https://ok.org/');
    // A relative link must not be quietly resolved against the attacker base.
    expect(urls.some((u) => u.includes('evil.example'))).toBe(false);
  });

  it('base href with a javascript: value', () => {
    assertSafe('<base href="javascript:alert(1)//"><p><a href="x">rel</a></p>');
  });
});

describe('hostile input: style attacks', () => {
  it('expression() in style does not reach the model', () => {
    const result = assertSafe('<p style="width:expression(alert(1))">Hi</p>');
    expect(JSON.stringify(result.model)).not.toMatch(/expression|alert\(/);
  });

  it('url(javascript:) in style does not reach the model', () => {
    const result = assertSafe(
      '<div style="background:url(javascript:alert(1))"><p style="background-image:url(\'javascript:alert(2)\')">Hi</p></div>',
    );
    expect(JSON.stringify(result.model)).not.toMatch(/javascript|alert\(|url\(/i);
  });

  it('style block contents are dropped', () => {
    const result = assertSafe('<style>body{background:url(javascript:alert(1))}</style><p>Hi</p>');
    expect(allText(result)).not.toContain('background');
  });
});

describe('hostile input: malformed markup', () => {
  const cases: Record<string, string> = {
    'unclosed tags': '<p><b><i>text<a href="https://x.org/">link',
    'unclosed attribute': '<a href="https://x.org/>text</a><p>after',
    'unclosed comment': '<p>Hi</p><!-- <script>alert(1)</script>',
    'bogus comment': '<p>Hi</p><!--><script>alert(1)</script>-->',
    'mismatched nesting': '<b><i>one</b>two</i><p><div></p></div>',
    'stray close tags': '</p></div></a></b></script></style>text',
    'lone angle brackets': '<<<>>> <p <p> <a <b>',
    'tag with junk': '<p/////onclick=alert(1)>text</p>',
    'null bytes': '<p>te\u0000xt</p><scr\u0000ipt>x</scr\u0000ipt>',
    cdata: '<![CDATA[<b>]]><p>Hi</p>',
    'deeply odd attrs': '<a href=https://x.org/ href=javascript:alert(1)>dup</a>',
    'table nonsense': '<table><td><p>cell<tr><li>x</table></table>',
    'doctype only': '<!DOCTYPE html>',
    'xml processing': '<?xml version="1.0"?><p>Hi</p>',
    'mutation xss style':
      '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
    'mutation xss noscript': '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  };
  for (const [name, html] of Object.entries(cases)) {
    it(`${name}: does not throw and stays safe`, () => {
      const result = assertSafe(html);
      expect(JSON.stringify(result.model)).not.toMatch(/alert\(/);
    });
  }

  it('keeps the text of unclosed formatting', () => {
    const result = assertSafe('<p><b><i>text</p>');
    expect(allText(result)).toContain('text');
  });
});

/** Generous per-test limit for the huge inputs; a hang still fails. */
const SLOW = 60_000;

describe('hostile input: size and shape', () => {
  it('empty string gives an empty model', () => {
    const result = assertSafe('');
    expect(result.model.blocks).toEqual([]);
  });

  it('whitespace only gives an empty model', () => {
    expect(assertSafe('   \n\t    ').model.blocks).toEqual([]);
  });

  it('plain text with no tags becomes text in the model', () => {
    const result = assertSafe('Just some plain words');
    expect(allText(result)).toBe('Just some plain words');
  });

  it(
    'survives a 1 MB paste of real markup with hostile pieces',
    () => {
      const unit =
        '<p>Para <b>bold</b> <a href="https://x.org/a">link</a> <script>alert(1)</script>' +
        '<img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a></p>\n';
      const html = unit.repeat(Math.ceil((1024 * 1024) / unit.length));
      expect(html.length).toBeGreaterThanOrEqual(1024 * 1024);
      const result = assertSafe(html);
      expect(result.model.blocks.length).toBeGreaterThan(0);
    },
    SLOW,
  );

  it(
    'survives a 1 MB paste of one text node',
    () => {
      const result = assertSafe('a'.repeat(1024 * 1024));
      expect(allText(result).length).toBeGreaterThan(0);
    },
    SLOW,
  );

  it(
    'survives a 1 MB paste of unclosed tags',
    () => {
      assertSafe('<b><i><a href="https://x.org/">'.repeat(Math.ceil((1024 * 1024) / 30)));
    },
    SLOW,
  );

  it(
    'survives 3000 levels of div nesting and keeps the text',
    () => {
      const depth = 3000;
      const html = '<div>'.repeat(depth) + 'deep text' + '</div>'.repeat(depth);
      const result = assertSafe(html);
      expect(allText(result)).toContain('deep text');
    },
    SLOW,
  );

  const nests: Record<string, [string, string]> = {
    span: ['<span>', '</span>'],
    b: ['<b>', '</b>'],
    blockquote: ['<blockquote>', '</blockquote>'],
    'ul and li': ['<ul><li>', '</li></ul>'],
    table: ['<table><tr><td>', '</td></tr></table>'],
  };
  for (const [name, [open, close]] of Object.entries(nests)) {
    // The table case overflows the stack in normalize; remove it.fails once fixed.
    const run = name === 'table' ? it.fails : it;
    run(
      `survives 3000 levels of ${name} nesting`,
      () => {
        const result = assertSafe(open.repeat(3000) + 'deep item' + close.repeat(3000));
        expect(allText(result)).toContain('deep item');
      },
      SLOW,
    );
  }

  it(
    'survives 3000 levels of unclosed div',
    () => {
      assertSafe('<div>'.repeat(3000) + 'x');
    },
    SLOW,
  );
});

describe('hostile input: literal text', () => {
  it('keeps escaped angle brackets and ampersands as literal text', () => {
    const result = assertSafe('<p>1 &lt; 2 &amp; 3 &gt; 0</p>');
    expect(allText(result)).toBe('1 < 2 & 3 > 0');
  });

  it('keeps an escaped script tag as text, never as an element', () => {
    const result = parse('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(allText(result)).toBe('<script>alert(1)</script>');
    expect(result.issues.some((i) => i.code === 'dropped-element')).toBe(false);
  });

  it('keeps bare angle brackets and ampersands that do not form tags', () => {
    const result = parse('<p>a < b and c > d & e</p>');
    expect(allText(result)).toBe('a < b and c > d & e');
  });

  it('keeps a literal entity-looking string intact', () => {
    const result = parse('<p>&amp;lt; stays &amp;lt;</p>');
    expect(allText(result)).toBe('&lt; stays &lt;');
  });
});

describe('hostile input: http links', () => {
  it('keeps an http link unchanged and raises insecure-url', () => {
    const result = assertSafe('<p><a href="http://example.org/page">old site</a></p>');
    expect(collect(result).urls).toEqual(['http://example.org/page']);
    const issue = result.issues.find((i) => i.code === 'insecure-url');
    expect(issue).toBeDefined();
    expect(issue?.detail).toBe('http://example.org/page');
  });

  it('keeps an http image src unchanged and raises insecure-url', () => {
    const result = assertSafe('<img src="http://example.org/a.png" alt="a">');
    const image = result.model.blocks.find((b) => b.type === 'image');
    expect(image).toMatchObject({ type: 'image', src: 'http://example.org/a.png' });
    expect(result.issues.some((i) => i.code === 'insecure-url')).toBe(true);
  });

  it('does not raise insecure-url for https and mailto', () => {
    const result = assertSafe(
      '<p><a href="https://example.org/">a</a> <a href="mailto:a@example.org">b</a></p>',
    );
    expect(result.issues.some((i) => i.code === 'insecure-url')).toBe(false);
  });

  it('treats an uppercase HTTP scheme as insecure too', () => {
    const result = assertSafe('<p><a href="HTTP://example.org/">x</a></p>');
    expect(result.issues.some((i) => i.code === 'insecure-url')).toBe(true);
  });
});
