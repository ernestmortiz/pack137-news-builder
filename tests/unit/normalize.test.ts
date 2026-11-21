import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalize } from '../../src/core/normalize';
import { sanitize } from '../../src/core/sanitize';

/** Sanitize then normalize, and give back the body markup. */
function clean(html: string): string {
  return normalize(sanitize(html).root).innerHTML;
}

function wrapped(levels: number): string {
  let html = '<p>Hello <b>world</b></p>';
  for (let i = 0; i < levels; i += 1) {
    html = i % 2 === 0 ? `<div class="w${i}">${html}</div>` : `<span id="s${i}">${html}</span>`;
  }
  return html;
}

describe('normalize: wrapper stripping', () => {
  it.each([1, 15, 50])('reduces %i levels of div and span wrappers to one paragraph', (levels) => {
    expect(clean(wrapped(levels))).toBe('<p>Hello <strong>world</strong></p>');
  });

  it('gives the same result for div only wrappers around inline text', () => {
    expect(clean('<div>'.repeat(50) + 'Hello <b>world</b>' + '</div>'.repeat(50))).toBe(
      '<p>Hello <strong>world</strong></p>',
    );
  });

  it('returns the element it was given', () => {
    const { root } = sanitize('<p>a</p>');
    expect(normalize(root)).toBe(root);
  });

  it('copes with thousands of nested wrappers', () => {
    expect(clean('<div>'.repeat(3000) + 'deep' + '</div>'.repeat(3000))).toBe('<p>deep</p>');
  });
});

describe('normalize: element mapping', () => {
  it('maps b, i, strike and del', () => {
    expect(clean('<p><b>a</b> <i>b</i> <strike>c</strike> <del>d</del> <s>e</s></p>')).toBe(
      '<p><strong>a</strong> <em>b</em> <s>c d e</s></p>',
    );
  });

  it('unwraps u, span, font, center, small, sup, sub and blockquote', () => {
    expect(
      clean(
        '<p><u>a</u><span>b</span><font color="red">c</font><small>d</small><sup>e</sup><sub>f</sub></p>' +
          '<center>g</center><blockquote><p>h</p></blockquote>',
      ),
    ).toBe('<p>abcdef</p><p>g</p><p>h</p>');
  });

  it('unwraps tables and turns cells into paragraphs', () => {
    expect(
      clean(
        '<table><thead><tr><th>Head</th></tr></thead><tbody><tr><td>One</td><td><p>Two</p><p>Three</p></td></tr></tbody></table>',
      ),
    ).toBe('<p>Head</p><p>One</p><p>Two</p><p>Three</p>');
  });

  it('keeps mixed content of an unwrapped div as separate blocks', () => {
    expect(clean('<div>intro<div><p>x</p></div>tail</div>next')).toBe(
      '<p>intro</p><p>x</p><p>tail</p><p>next</p>',
    );
  });

  it('pushes emphasis that wraps blocks down into them', () => {
    expect(clean('<b><div>One</div><div>Two</div></b>')).toBe(
      '<p><strong>One</strong></p><p><strong>Two</strong></p>',
    );
    expect(clean('<a href="https://x.org"><div>Card</div></a>')).toBe(
      '<p><a href="https://x.org">Card</a></p>',
    );
  });
});

describe('normalize: body level content', () => {
  it('wraps runs of inline content beside blocks into paragraphs', () => {
    expect(
      clean('Loose <b>text</b><h2>Title</h2>more <a href="https://x.org">link</a><hr>end'),
    ).toBe(
      '<p>Loose <strong>text</strong></p><h2>Title</h2><p>more <a href="https://x.org">link</a></p><hr><p>end</p>',
    );
  });

  it('leaves an image standing alone at body level unwrapped', () => {
    expect(clean('<p>a</p>\n<img src="https://x.org/a.jpg" alt="a">\n<p>b</p>')).toBe(
      '<p>a</p><img src="https://x.org/a.jpg" alt="a"><p>b</p>',
    );
    expect(clean('<div><span><img src="https://x.org/a.jpg" alt="a"></span></div>')).toBe(
      '<img src="https://x.org/a.jpg" alt="a">',
    );
  });

  it('keeps an image inside a paragraph with text inline', () => {
    expect(clean('<p>See <img src="https://x.org/a.jpg" alt="a"> here</p>')).toBe(
      '<p>See <img src="https://x.org/a.jpg" alt="a"> here</p>',
    );
  });

  it('leaves mixed content inside list items alone', () => {
    expect(
      clean('<ul>\n<li> One <b>two</b> </li>\n<li>Three<ul><li>Four</li></ul></li>\n</ul>'),
    ).toBe('<ul><li>One <strong>two</strong></li><li>Three<ul><li>Four</li></ul></li></ul>');
  });

  it('keeps headings, lists and rules as they are', () => {
    expect(clean('<h1>A</h1><ol><li>b</li></ol><hr><h6>c</h6>')).toBe(
      '<h1>A</h1><ol><li>b</li></ol><hr><h6>c</h6>',
    );
  });
});

describe('normalize: text', () => {
  it('collapses nbsp runs and whitespace and trims each block', () => {
    expect(clean('<p>&nbsp;&nbsp;Hello&nbsp;&nbsp;&nbsp;there \n\t friend&nbsp; </p>')).toBe(
      '<p>Hello there friend</p>',
    );
  });

  it('trims across inline elements and does not double a space between them', () => {
    expect(clean('<p> <b> Hello </b> <i> world </i> </p>')).toBe(
      '<p><strong>Hello </strong><em>world</em></p>',
    );
  });

  it('trims headings and list items', () => {
    expect(clean('<h2>&nbsp;Title </h2><ul><li>&nbsp;item&nbsp;</li></ul>')).toBe(
      '<h2>Title</h2><ul><li>item</li></ul>',
    );
  });
});

describe('normalize: empty nodes', () => {
  it('removes empty and br only elements until stable', () => {
    expect(
      clean(
        '<p></p><p>&nbsp;</p><p><br></p><div><span><b> </b></span></div><ul><li></li></ul><p>kept</p><p><strong><em></em></strong></p>',
      ),
    ).toBe('<p>kept</p>');
  });

  it('keeps elements that hold an image or a rule', () => {
    expect(
      clean('<p><a href="https://x.org"><img src="https://x.org/a.jpg" alt="a"></a></p><hr>'),
    ).toBe('<p><a href="https://x.org"><img src="https://x.org/a.jpg" alt="a"></a></p><hr>');
  });

  it('removes a br at the start or end of a block and keeps one in the middle', () => {
    expect(clean('<p><br>One<br>two<br></p><p><b><br>Three<br></b><br></p>')).toBe(
      '<p>One<br>two</p><p><strong>Three</strong></p>',
    );
  });

  it('keeps the space when an inline element held only a space', () => {
    expect(clean('<p>a<b> </b>b</p>')).toBe('<p>a b</p>');
  });
});

describe('normalize: merging', () => {
  it('merges adjacent identical inline elements', () => {
    expect(clean('<p><strong>a</strong><strong>b</strong><b>c</b> <em>d</em><i>e</i></p>')).toBe(
      '<p><strong>abc</strong> <em>de</em></p>',
    );
  });

  it('merges adjacent links to the same place but not to different places', () => {
    expect(
      clean(
        '<p><a href="https://x.org">a</a><a href="https://x.org">b</a><a href="https://y.org">c</a></p>',
      ),
    ).toBe('<p><a href="https://x.org">ab</a><a href="https://y.org">c</a></p>');
  });

  it('flattens an emphasis element nested inside the same emphasis', () => {
    expect(clean('<p><span style="font-weight:bold"><b>a</b> b</span></p>')).toBe(
      '<p><strong>a b</strong></p>',
    );
  });

  it('keeps a bold block bold on every piece of its text, inside links too', () => {
    expect(
      clean('<div style="font-weight:700">Hello <a href="https://x.org">x</a> there</div>'),
    ).toBe(
      '<p><strong>Hello </strong><a href="https://x.org"><strong>x</strong></a><strong> there</strong></p>',
    );
  });
});

describe('normalize: output the tool made earlier', () => {
  const html = readFileSync(
    join(__dirname, '../fixtures/weekly/2-help-needed.expected.html'),
    'utf8',
  );
  const root = normalize(sanitize(html).root);

  it('comes back as block level content only', () => {
    const allowed = /^(p|h[1-6]|ul|ol|hr|img)$/;
    const tags = Array.from(root.children).map((el) => el.tagName.toLowerCase());
    expect(tags.length).toBeGreaterThan(4);
    for (const tag of tags) expect(tag).toMatch(allowed);
    for (const node of Array.from(root.childNodes)) expect(node.nodeType).toBe(1);
    expect(root.querySelector('table, tr, td, div, span, [style]')).toBeNull();
  });

  it('keeps "Legal and finance help" as its own block', () => {
    const texts = Array.from(root.children).map((el) => el.textContent);
    expect(texts).toContain('Legal and finance help');
    expect(texts).toContain('Volunteer');
    expect(texts).toContain('The pack could use your help');
  });

  it('keeps the links', () => {
    const hrefs = Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(
      'mailto:cranfordpack137@gmail.com?subject=Help%20with%20nonprofit%20formation',
    );
    expect(hrefs).toContain('mailto:cranfordpack137@gmail.com');
  });
});

describe('normalize: deep and very large input', () => {
  /** Runs sanitize first, then times normalize on its own. */
  function timed(html: string): { root: HTMLElement; elapsed: number } {
    const { root } = sanitize(html);
    const started = performance.now();
    normalize(root);
    return { root, elapsed: performance.now() - started };
  }

  it('flattens 3000 nested layout tables without overflowing the stack', () => {
    const depth = 3000;
    const html = '<table><tr><td>'.repeat(depth) + 'deep item' + '</td></tr></table>'.repeat(depth);
    const { root, elapsed } = timed(html);
    expect(root.innerHTML).toBe('<p>deep item</p>');
    expect(elapsed).toBeLessThan(1000);
  });

  it('unwraps 3000 nested spans in under a second', () => {
    const depth = 3000;
    const { root, elapsed } = timed('<span>'.repeat(depth) + 'deep' + '</span>'.repeat(depth));
    expect(root.innerHTML).toBe('<p>deep</p>');
    expect(elapsed).toBeLessThan(1000);
  });

  it('flattens 3000 nested bold tags to one strong in under a second', () => {
    const depth = 3000;
    const { root, elapsed } = timed('<b>'.repeat(depth) + 'deep' + '</b>'.repeat(depth));
    expect(root.innerHTML).toBe('<p><strong>deep</strong></p>');
    expect(elapsed).toBeLessThan(1000);
  });

  it('handles 1 MB of unclosed bold, italic and link tags in under a second', () => {
    const count = 30000;
    const html = '<b><i><a href="https://x.org">t'.repeat(count);
    expect(html.length).toBeGreaterThan(900 * 1024);
    // The other test files run at the same moment and compete for the processor, so a slow run
    // is tried again, up to three times.
    let result = timed(html);
    for (let attempt = 1; attempt < 3 && result.elapsed >= 1000; attempt += 1) result = timed(html);
    const { root, elapsed } = result;
    expect(elapsed).toBeLessThan(1000);
    // Every letter survives, in blocks of the usual kind, and the links keep their address.
    expect(root.textContent).toBe('t'.repeat(count));
    for (const el of Array.from(root.children)) expect(el.tagName).toBe('P');
    expect(root.querySelector('b, i, span, div')).toBeNull();
    const links = Array.from(root.querySelectorAll('a'));
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a.getAttribute('href')).toBe('https://x.org');
  }, 30000);

  it('keeps 3000 nested lists as lists', () => {
    const depth = 3000;
    const { root, elapsed } = timed('<ul><li>'.repeat(depth) + 'deep' + '</li></ul>'.repeat(depth));
    expect(elapsed).toBeLessThan(1000);
    // Walk down by hand: a deep tree must not be read with a recursive DOM call.
    let levels = 0;
    let node: Element | null = root.firstElementChild;
    while (node && (node.tagName === 'UL' || node.tagName === 'LI')) {
      levels += 1;
      const next: Element | null = node.firstElementChild;
      if (!next) expect(node.firstChild?.nodeValue).toBe('deep');
      node = next;
    }
    expect(levels).toBe(depth * 2);
  });

  it('settles a deep chain of list items that hold only a line break in under a second', () => {
    // Each item is empty once the list inside it has gone, so the whole chain goes, inside out.
    const depth = 3000;
    const html = '<ul><li><br>'.repeat(depth) + '</li></ul>'.repeat(depth) + '<p>kept</p>';
    const { root, elapsed } = timed(html);
    expect(elapsed).toBeLessThan(1000);
    expect(root.innerHTML).toBe('<p>kept</p>');
  });

  it('replaces the content of a root that holds 3000 nested wrappers and a wide run', () => {
    const depth = 3000;
    const html =
      '<div>'.repeat(depth) + '<p>a</p>'.repeat(2000) + '</div>'.repeat(depth) + '<p>last</p>';
    const { root, elapsed } = timed(html);
    expect(elapsed).toBeLessThan(2000);
    expect(root.children.length).toBe(2001);
    expect(root.lastElementChild?.textContent).toBe('last');
  });
});
