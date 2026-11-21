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
