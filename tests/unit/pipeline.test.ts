import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Block, Inline, IssueCode, Mark } from '../../src/core/model';
import { parse } from '../../src/core/pipeline';

const FIXTURES = join(__dirname, '..', 'fixtures');

function runsOf(block: Block): Inline[][] {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return [block.runs];
    case 'list':
      return block.items.flatMap((item) => [item.runs, ...item.children.flatMap(runsOfList)]);
    default:
      return [];
  }
}

function runsOfList(block: Block): Inline[][] {
  return runsOf(block);
}

/** Visible text in document order, whitespace collapsed. Images contribute their alt text. */
function flatten(blocks: Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'image') parts.push(block.alt);
    for (const runs of runsOf(block)) {
      parts.push(runs.map((r) => (r.kind === 'text' ? r.text : ' ')).join(''));
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function hrefs(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === 'image' && block.href !== undefined) out.push(block.href);
    for (const runs of runsOf(block)) {
      for (const run of runs) if (run.kind === 'text' && run.href !== undefined) out.push(run.href);
    }
  }
  return out;
}

function allRuns(blocks: Block[]): Extract<Inline, { kind: 'text' }>[] {
  return blocks.flatMap((b) => runsOf(b).flat()).filter((r) => r.kind === 'text');
}

function read(...parts: string[]): string {
  return readFileSync(join(FIXTURES, ...parts), 'utf8');
}

describe('pipeline: monthly letter, November 2026 original', () => {
  const html = read('monthly', '2026-11.original.html');

  it('parses without throwing', () => {
    expect(() => parse(html)).not.toThrow();
  });

  it('warns about the image without alt and the bare meet.google.com link', () => {
    const { issues } = parse(html);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('image-no-alt');
    const noDest = issues.filter((i) => i.code === 'link-no-destination');
    expect(noDest.some((i) => (i.detail ?? '').includes('meet.google.com/vgn-rwmf-fmz'))).toBe(
      true,
    );
  });

  it('keeps the story text in document order', () => {
    const text = flatten(parse(html).model.blocks);
    const sentences = [
      'Thank you for a full November',
      '73 of us, 37 scouts and 36 adults',
      'The banner is new. The tradition is not.',
      'relatively new to Scouts',
      'I had the privilege of co-running the fishing station',
      'I had the distinct pleasure of running the Hiking Station',
      'setting up in the rain Friday night',
      'We had an absolute blast teaching the scouts knot-tying and shelter building',
      'A weekend like this does not happen by itself',
      'Were you there? Help us tell the story of this year.',
    ];
    let last = -1;
    for (const sentence of sentences) {
      const at = text.indexOf(sentence);
      expect(at, `missing: ${sentence}`).toBeGreaterThan(-1);
      expect(at, `out of order: ${sentence}`).toBeGreaterThan(last);
      last = at;
    }
  });

  it('keeps the bare link text and the surrounding sentence together', () => {
    const text = flatten(parse(html).model.blocks);
    expect(text).toContain('second Pinewood Derby Committee meeting');
    expect(text).toContain('Meeting link');
  });

  it('does not leak class, id, style or other attribute text into the model', () => {
    const { model } = parse(html);
    const text = flatten(model.blocks);
    for (const leak of [
      'style=',
      'class=',
      'isPasted',
      'txt-muted',
      'txt-body',
      'fr-fic',
      'fr-dib',
      'margin:',
      'font-size',
      'color:#',
      'status="OK"',
      '<p',
      '</',
    ]) {
      expect(text, leak).not.toContain(leak);
    }
    // Structure carries no stray fields either.
    expect(JSON.stringify(model)).not.toMatch(/"(class|id|style)"/);
  });

  it('carries no script or style content', () => {
    const text = flatten(parse(html).model.blocks);
    expect(text).not.toMatch(/<script|<style|@media|\{[^}]*:[^}]*\}/);
  });

  it('keeps the mailto links with their subject', () => {
    const urls = hrefs(parse(html).model.blocks);
    expect(urls).toContain('mailto:cranfordpack137+volunteer@gmail.com?subject=I%20can%20help');
    expect(urls).toContain('https://forms.gle/PvVux1W4764mSD6T7');
  });
});

describe('pipeline: re-pasting approved weekly output', () => {
  const dir = join(FIXTURES, 'weekly');
  const files = readdirSync(dir).filter((f) => f.endsWith('.expected.html'));
  // Re-pasting our own output must be clean. Any code listed here needs a reason.
  const allowed: IssueCode[] = [];

  it('finds the fixtures', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of files) {
    describe(file, () => {
      const html = readFileSync(join(dir, file), 'utf8');

      it('does not throw', () => {
        expect(() => parse(html)).not.toThrow();
      });

      it('keeps every link destination', () => {
        const wanted = [...html.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map((m) =>
          (m[1] ?? '').replace(/&amp;/g, '&'),
        );
        expect(wanted.length).toBeGreaterThan(0);
        const have = new Set(hrefs(parse(html).model.blocks));
        for (const url of wanted) expect(have.has(url), `lost link ${url}`).toBe(true);
      });

      it('keeps the visible title text', () => {
        const m = html.match(/font-size:20px;font-weight:700[^"]*">([^<]+)</);
        expect(m, 'title not found in fixture').not.toBeNull();
        const title = (m?.[1] ?? '').replace(/&amp;/g, '&').trim();
        expect(flatten(parse(html).model.blocks)).toContain(title);
      });

      it('keeps the text of every paragraph', () => {
        const paragraphs = [...html.matchAll(/<p\s[^>]*>([\s\S]*?)<\/p>/g)]
          .map((m) =>
            (m[1] ?? '')
              .replace(/<[^>]+>/g, '')
              .replace(/&amp;/g, '&')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim(),
          )
          .filter((t) => t.length > 0 && !/&[a-z#0-9]+;/.test(t));
        const text = flatten(parse(html).model.blocks);
        for (const p of paragraphs) expect(text, p).toContain(p);
      });

      it('raises no unexpected issues', () => {
        const unexpected = parse(html).issues.filter((i) => !allowed.includes(i.code));
        expect(unexpected).toEqual([]);
      });

      it('leaks no markup or style text', () => {
        const text = flatten(parse(html).model.blocks);
        expect(text).not.toMatch(/style=|<\/?(td|tr|table|div|span)|padding:|background-color/);
      });
    });
  }
});

describe('pipeline: wrapper stripping', () => {
  for (const depth of [1, 15, 50]) {
    for (const tag of ['div', 'span']) {
      it(`${depth} nested ${tag} around one paragraph gives exactly one paragraph`, () => {
        const html = `<${tag}>`.repeat(depth) + '<p>Hello pack</p>' + `</${tag}>`.repeat(depth);
        const { model } = parse(html);
        expect(model.blocks).toHaveLength(1);
        expect(model.blocks[0]).toMatchObject({ type: 'paragraph' });
        expect(flatten(model.blocks)).toBe('Hello pack');
      });

      it(`${depth} nested ${tag} around bare text gives exactly one paragraph`, () => {
        const html = `<${tag}>`.repeat(depth) + 'Hello pack' + `</${tag}>`.repeat(depth);
        const { model } = parse(html);
        expect(model.blocks).toHaveLength(1);
        expect(model.blocks[0]).toMatchObject({ type: 'paragraph' });
        expect(flatten(model.blocks)).toBe('Hello pack');
      });
    }

    it(`${depth} alternating div and span levels give exactly one paragraph`, () => {
      const open = '<div><span>'.repeat(depth);
      const close = '</span></div>'.repeat(depth);
      const { model } = parse(`${open}<p>Hello pack</p>${close}`);
      expect(model.blocks).toHaveLength(1);
      expect(model.blocks[0]).toMatchObject({ type: 'paragraph' });
    });
  }

  it('wrappers with styles and attributes are stripped the same way', () => {
    const html =
      '<div class="a" style="color:red" id="x"><span style="font-weight:700"><p>Hello pack</p></span></div>';
    const { model } = parse(html);
    expect(model.blocks).toHaveLength(1);
    expect(flatten(model.blocks)).toBe('Hello pack');
  });

  it('wrappers around two paragraphs give two paragraphs', () => {
    const { model } = parse('<div><div><p>One</p></div><div><p>Two</p></div></div>');
    expect(model.blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
  });
});

describe('pipeline: inline marks', () => {
  function marksOf(html: string, text: string): Mark[] {
    const run = allRuns(parse(html).model.blocks).find((r) => r.text.includes(text));
    expect(run, `no run containing ${text}`).toBeDefined();
    return run?.marks ?? [];
  }

  it('keeps strikethrough as the strike mark for s, strike and del', () => {
    expect(marksOf('<p>Dec 6 <s>old</s> new</p>', 'old')).toEqual(['strike']);
    expect(marksOf('<p>Dec 6 <strike>old</strike> new</p>', 'old')).toEqual(['strike']);
    expect(marksOf('<p>Dec 6 <del>old</del> new</p>', 'old')).toEqual(['strike']);
  });

  it('does not put strike on the text beside it', () => {
    expect(marksOf('<p><s>old</s> plain</p>', 'plain')).toEqual([]);
  });

  it('maps b to strong and strong to strong', () => {
    expect(marksOf('<p>a <b>bold</b></p>', 'bold')).toEqual(['strong']);
    expect(marksOf('<p>a <strong>bold</strong></p>', 'bold')).toEqual(['strong']);
  });

  it('maps i to em and em to em', () => {
    expect(marksOf('<p>a <i>ital</i></p>', 'ital')).toEqual(['em']);
    expect(marksOf('<p>a <em>ital</em></p>', 'ital')).toEqual(['em']);
  });

  it('combines marks, sorted and without duplicates', () => {
    const marks = marksOf('<p>x <b><i><s><b>all</b></s></i></b> y</p>', 'all');
    expect(marks).toEqual([...new Set(marks)].sort());
    expect(marks.sort()).toEqual(['em', 'strike', 'strong']);
  });

  it('keeps strike inside a link and keeps the href', () => {
    const run = allRuns(
      parse('<p><a href="https://x.org/"><s>Dec 6</s></a></p>').model.blocks,
    ).find((r) => r.text.includes('Dec 6'));
    expect(run?.marks).toEqual(['strike']);
    expect(run?.href).toBe('https://x.org/');
  });

  it('keeps strike inside list items', () => {
    const { model } = parse('<ul><li><s>Dec 6</s> moved</li><li>Dec 13 on</li></ul>');
    const list = model.blocks.find((b) => b.type === 'list');
    expect(list?.type === 'list' && list.items).toHaveLength(2);
    const first = allRuns(model.blocks).find((r) => r.text.includes('Dec 6'));
    expect(first?.marks).toEqual(['strike']);
  });

  it('does not invent marks on plain text', () => {
    expect(marksOf('<p>plain</p>', 'plain')).toEqual([]);
  });
});
