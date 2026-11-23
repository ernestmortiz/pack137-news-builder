/**
 * Finish photos (build spec 8.2, Photos): the owner pastes the letter into TroopTrack, replaces
 * each photo spot with a photo there, then pastes TroopTrack's code back. finishPhotos rewrites
 * the photo tags and nothing else.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { finishPhotos, type PhotoSpot } from '../../src/core/finish-photos';
import type { LetterForm } from '../../src/core/letter';
import { lintOutput } from '../../src/core/lint-output';
import { photoSpots, renderLetter } from '../../src/core/render-letter';
import { defaultSettings } from '../../src/core/settings';
import { mulberry32 } from '../fuzz/generate';
import { budget } from './budget';

const here = dirname(fileURLToPath(import.meta.url));
const EM_DASH = String.fromCharCode(0x2014);
const LOGO = defaultSettings().logoUrl;
const OPTIONS = { logoUrl: LOGO };
const SPOT_BOX = /<p style="[^"]*">Insert photo here: [^<]*<\/p>/g;
const FILES = ['01-a', '02-b', '03-c', '04-d', '05-e', '06-f', '07-g'];
const WIDTHS = [552, 533, 552, 547, 552, 426, 492];

function item<T>(list: readonly T[], i: number): T {
  const found = list[i];
  if (found === undefined) throw new Error(`nothing at ${i}`);
  return found;
}

/** The November draft with every photo address removed, so each photo is a spot. */
function novemberLetter(): LetterForm {
  const letter = JSON.parse(
    readFileSync(join(here, '..', 'fixtures', 'monthly', '2026-11.draft.json'), 'utf8'),
  ) as LetterForm;
  for (const block of letter.story.blocks) {
    if (block.kind === 'photo') block.photo.src = '';
    else if (block.kind === 'sidebar' && block.photo !== undefined) block.photo.src = '';
  }
  return letter;
}

const froala = (i: number): string =>
  `<img src="https://styles.trooptrack.com/uploads/${FILES[i]}.jpg" class="fr-fic fr-dib" style="width: ${WIDTHS[i]}px;">`;

const finished = (i: number, alt: string, width = WIDTHS[i]): string =>
  `<img src="https://styles.trooptrack.com/uploads/${FILES[i]}.jpg" width="${width}" alt="${alt}" ` +
  `style="display:block;width:100%;max-width:${width}px;height:auto;border:0;">`;

/** Replaces the spot boxes, in order, with what `put` gives; undefined leaves the box. */
function fillSpots(html: string, put: (i: number) => string | undefined): string {
  let i = 0;
  return html.replace(SPOT_BOX, (box) => put(i++) ?? box);
}

const letter = novemberLetter();
const spots = photoSpots(letter);
const rendered = renderLetter(letter);
const pasted = fillSpots(rendered, froala);

describe('finishPhotos: the November round trip', () => {
  it('starts from a letter with seven spots and seven Froala photos', () => {
    expect(spots).toHaveLength(7);
    expect(rendered.match(SPOT_BOX)).toHaveLength(7);
    expect(pasted).not.toContain('Insert photo here');
    expect(lintOutput(pasted, { monthly: true })).not.toEqual([]);
  });

  it('gives every photo its alt text in order and changes nothing else', () => {
    const result = finishPhotos(pasted, spots, OPTIONS);
    const expected = fillSpots(rendered, (i) => finished(i, item(spots, i).alt));
    expect(result.html).toBe(expected);
    expect(result.fixed).toBe(7);
    expect(result.notes).toEqual(['Fixed 7 photos.']);
  });

  it('leaves the logo exactly as it was', () => {
    const logoTag = item(rendered.match(/<img [^>]*pack137_logo[^>]*>/) ?? [], 0);
    const result = finishPhotos(pasted, spots, OPTIONS);
    expect(result.html).toContain(logoTag);
    expect(result.html.match(/<img /g)).toHaveLength(8);
  });

  it('passes the output lint', () => {
    const result = finishPhotos(pasted, spots, OPTIONS);
    expect(lintOutput(result.html, { monthly: true })).toEqual([]);
  });

  it('keeps conditional comments, VML and the preview div byte for byte', () => {
    const strip = (s: string): string => s.replace(/<img [^>]*>/g, '');
    const result = finishPhotos(pasted, spots, OPTIONS);
    expect(strip(result.html)).toBe(strip(pasted));
    expect(result.html).toContain('<!--[if mso]>');
    expect(result.html).toContain('v:roundrect');
  });

  it('changes nothing on a second run', () => {
    const once = finishPhotos(pasted, spots, OPTIONS);
    const twice = finishPhotos(once.html, spots, OPTIONS);
    expect(twice.html).toBe(once.html);
    expect(twice.fixed).toBe(0);
    expect(twice.notes).toEqual(['All 7 photos were already right. Nothing was changed.']);
  });
});

describe('finishPhotos: spots and photos that do not line up', () => {
  it('reports a spot left unfilled and keeps the later photos on their own spots', () => {
    const input = fillSpots(rendered, (i) => (i === 2 ? undefined : froala(i)));
    const result = finishPhotos(input, spots, OPTIONS);
    const expected = fillSpots(rendered, (i) =>
      i === 2 ? undefined : finished(i, item(spots, i).alt),
    );
    expect(result.html).toBe(expected);
    expect(result.fixed).toBe(6);
    expect(result.notes).toEqual([
      'Fixed 6 photos.',
      `The spot for ${item(spots, 2).where} still has no photo. Insert it in TroopTrack, then finish the photos again.`,
    ]);
  });

  it('reports photos beyond the last spot and keeps an alt they already have', () => {
    const extra =
      '<img src="https://styles.trooptrack.com/uploads/08-h.jpg" alt="A tent at dusk" style="width: 300px;">' +
      '<img src="https://styles.trooptrack.com/uploads/09-i.jpg" class="fr-fic">';
    const result = finishPhotos(pasted + extra, spots, OPTIONS);
    expect(
      result.html.endsWith(
        '<img src="https://styles.trooptrack.com/uploads/08-h.jpg" width="300" alt="A tent at dusk" style="display:block;width:100%;max-width:300px;height:auto;border:0;">' +
          '<img src="https://styles.trooptrack.com/uploads/09-i.jpg" width="552" alt="" style="display:block;width:100%;max-width:552px;height:auto;border:0;">',
      ),
    ).toBe(true);
    expect(result.fixed).toBe(9);
    expect(result.notes).toEqual([
      'Fixed 9 photos.',
      'The last 2 photos in the pasted code have no photo spot in the letter.',
      'Photo 9 has no description. Add a photo spot for it in the letter, or it will be read as nothing.',
    ]);
  });

  it('works with no spots at all', () => {
    const result = finishPhotos('<p><img src="https://a.example/x.jpg"></p>', [], OPTIONS);
    expect(result.html).toBe(
      '<p><img src="https://a.example/x.jpg" width="552" alt="" style="display:block;width:100%;max-width:552px;height:auto;border:0;"></p>',
    );
    expect(result.notes[1]).toBe(
      'The last photo in the pasted code has no photo spot in the letter.',
    );
  });

  it('uses the alt a photo already has when its spot has none, and says so when neither has', () => {
    const own: PhotoSpot[] = [
      { where: 'Photo 1', alt: '' },
      { where: 'Photo 2', alt: '  ' },
    ];
    const result = finishPhotos(
      '<img src="https://a.example/1.jpg" alt="Kept"><img src="https://a.example/2.jpg" alt=" ">',
      own,
      OPTIONS,
    );
    expect(result.html).toContain('alt="Kept"');
    expect(result.html).toContain('2.jpg" width="552" alt=""');
    expect(result.notes).toEqual([
      'Fixed 2 photos.',
      'Photo 2 has no description. Add its alt text in the letter, then finish the photos again, or it will be read as nothing.',
    ]);
  });

  it('says so when there are no photos', () => {
    expect(finishPhotos('<p>Hello</p>', [], OPTIONS)).toEqual({
      html: '<p>Hello</p>',
      fixed: 0,
      notes: ['No photos were found in the pasted code.'],
    });
  });
});

describe('finishPhotos: the logo and the letter own photos', () => {
  it('leaves the logo alone even after Froala has added classes to it', () => {
    const logo = `<img class="fr-fil fr-dib" src=" ${LOGO} " width="90" style="width: 90px;">`;
    const result = finishPhotos(`${logo}<img src="https://a.example/1.jpg">`, spots, OPTIONS);
    expect(result.html.startsWith(logo)).toBe(true);
    expect(result.html).toContain(`alt="${item(spots, 0).alt}"`);
    expect(result.fixed).toBe(1);
  });

  it('treats no image as the logo when the logo address is empty', () => {
    const result = finishPhotos('<img src="">', [], { logoUrl: ' ' });
    expect(result.html).toBe('');
  });

  it('leaves photos the letter rendered itself alone and does not match them to spots', () => {
    const own = '<img src="https://a.example/own.jpg?a=1&amp;b=2" width="300" alt="Own">';
    const result = finishPhotos(`${own}<img src="https://a.example/1.jpg">`, spots, {
      logoUrl: LOGO,
      ownPhotoUrls: ['https://a.example/own.jpg?a=1&b=2'],
    });
    expect(result.html.startsWith(own)).toBe(true);
    expect(result.html).toContain(`1.jpg" width="552" alt="${item(spots, 0).alt}"`);
  });
});

describe('finishPhotos: unsafe and odd photo tags', () => {
  it.each([
    ['javascript', '<img src="javascript:alert(1)">'],
    ['javascript with entities', '<img src="java&#115;cript&colon;alert(1)">'],
    ['data', '<img src="data:image/png;base64,AAAA">'],
    ['relative', '<img src="/uploads/x.jpg">'],
    ['protocol relative', '<img src="//a.example/x.jpg">'],
    ['user info', '<img src="https://a.example@evil.example/x.jpg">'],
    ['none', '<img alt="x">'],
    ['empty', '<img src>'],
  ])('removes a photo with a %s address and says so', (_name, tag) => {
    const result = finishPhotos(`<p>a${tag}b</p>`, [{ where: 'Photo 3', alt: 'x' }], OPTIONS);
    expect(result.html).toBe('<p>ab</p>');
    expect(result.fixed).toBe(0);
    expect(result.notes).toEqual([
      'No photos were fixed.',
      'Photo 3 has an address that cannot be used, so it was removed. Insert it again in TroopTrack.',
    ]);
  });

  it('a removed photo still uses up its spot', () => {
    const result = finishPhotos(
      '<img src="data:x"><img src="https://a.example/2.jpg">',
      [
        { where: 'Photo 1', alt: 'One' },
        { where: 'Photo 2', alt: 'Two' },
      ],
      OPTIONS,
    );
    expect(result.html).toContain('alt="Two"');
  });

  it('drops every attribute but the address, and never lets a value break out', () => {
    const tag =
      `<IMG\n  title='a > b "quoted"' data-x="<img src=x>" onerror="alert(1)" id=isPasted class="fr-fic"` +
      ` srcset="a.jpg 2x" sizes=100vw loading=lazy SRC='https://a.example/a b.jpg?x="1"&amp;y=<2>'` +
      ` style="width: 300px; color: #123456" / >`;
    const result = finishPhotos(
      `<td>${tag}</td>`,
      [{ where: 'Photo 1', alt: `"Tom" & 'Al' <b>` }],
      OPTIONS,
    );
    expect(result.html).toBe(
      '<td><img src="https://a.example/a%20b.jpg?x=&quot;1&quot;&amp;y=&lt;2&gt;" width="300" ' +
        'alt="&quot;Tom&quot; &amp; &#39;Al&#39; &lt;b&gt;" ' +
        'style="display:block;width:100%;max-width:300px;height:auto;border:0;"></td>',
    );
    expect(lintOutput(result.html)).toEqual([]);
  });

  it('writes no em dash into alt text', () => {
    const result = finishPhotos(
      '<img src="https://a.example/1.jpg">',
      [{ where: 'Photo 1', alt: `Scouts ${EM_DASH} and a fire` }],
      OPTIONS,
    );
    expect(result.html).not.toContain(EM_DASH);
  });

  it.each([
    ['width attribute', 'width="300"', 300],
    ['width attribute in px', 'width="300px"', 300],
    ['style width', 'style="height:auto;width:  412.4px"', 412],
    ['last style width', 'style="width:100px;WIDTH:200px !important"', 200],
    ['attribute before style', 'width="300" style="width:200px"', 300],
    ['style when the attribute is out of range', 'width="900" style="width:200px"', 200],
    ['too narrow', 'width="39"', 552],
    ['narrowest', 'width="40"', 40],
    ['too wide', 'style="width: 553px"', 552],
    ['percent', 'width="100%" style="width:50%"', 552],
    ['not a number', 'width="wide" style="max-width:300px"', 552],
    ['none', '', 552],
  ])('reads the width from %s', (_name, attrs, width) => {
    const result = finishPhotos(`<img src="https://a.example/1.jpg" ${attrs}>`, [], OPTIONS);
    expect(result.html).toContain(` width="${width}" `);
    expect(result.html).toContain(`max-width:${width}px;`);
  });

  it('keeps a photo inside a narrower spot to that width', () => {
    const narrow: PhotoSpot[] = [{ where: 'Sidebar photo in block 12', alt: 'x', maxWidth: 512 }];
    const wide = finishPhotos(
      '<img src="https://a.example/1.jpg" style="width: 552px;">',
      narrow,
      OPTIONS,
    );
    expect(wide.html).toContain(' width="512" ');
    const small = finishPhotos(
      '<img src="https://a.example/1.jpg" style="width: 426px;">',
      narrow,
      OPTIONS,
    );
    expect(small.html).toContain(' width="426" ');
  });
});

describe('finishPhotos: what is not a photo tag', () => {
  const photo = '<img src="https://a.example/1.jpg" class="fr-fic">';
  const one: PhotoSpot[] = [{ where: 'Photo 1', alt: 'One' }];

  it.each([
    ['an Outlook conditional comment', `<!--[if mso]><v:rect>${photo}</v:rect><![endif]-->`],
    ['a plain comment', `<!-- ${photo} -->`],
    ['a comment that never ends', `<!-- ${photo}`],
    ['a comment with a dash run', `<!---${photo}--->`],
    [
      'an attribute value',
      `<a href="https://a.example/" title="${photo.replace(/"/g, "'")}">x</a>`,
    ],
    ['a single quoted value', `<a title='>${photo}'>x</a>`],
    ['a script', `<script>var a = '${photo}';</script>`],
    ['a style block', `<STYLE>p::after{content:'${photo}'}</Style >`],
    ['a textarea', `<textarea>${photo}</textarea>`],
    ['a tag that never ends', `<img src="https://a.example/1.jpg" class="fr-fic"`],
    ['a quote that never ends', `<img src="https://a.example/1.jpg class=fr-fic>`],
    [
      'another tag name',
      '<imgx src="https://a.example/1.jpg"><picture src="https://a.example/1.jpg">',
    ],
    ['a closing tag', '</img src="https://a.example/1.jpg">'],
    ['escaped text', '&lt;img src="https://a.example/1.jpg"&gt;'],
  ])('leaves %s alone', (_name, html) => {
    const result = finishPhotos(html, one, OPTIONS);
    expect(result.html).toBe(html);
    expect(result.fixed).toBe(0);
  });

  it.each([
    ['an empty comment', '<!-->'],
    ['a short comment', '<!--->'],
    ['a closed comment', '<!-- a -->'],
    ['a comment closed the odd way', '<!-- a --!>'],
    ['a conditional comment', '<!--[if mso]><img src="x"><![endif]-->'],
    ['a revealed conditional', '<![if !mso]>'],
    ['a doctype', '<!DOCTYPE html>'],
    ['a closed script', '<script>if (a < b) { c("<!--"); }</script>'],
    ['a tag with a quote in a name', '<p a"b>'],
    ['a tag with a quote in a bare value', "<p a=b'c>"],
    ['a stray less-than', 'a < b and <3 '],
    ['an empty closing tag', '</>'],
  ])('finds the photo after %s', (_name, before) => {
    const result = finishPhotos(`${before}${photo}`, one, OPTIONS);
    expect(result.html).toBe(
      `${before}<img src="https://a.example/1.jpg" width="552" alt="One" style="display:block;width:100%;max-width:552px;height:auto;border:0;">`,
    );
  });

  it('treats an image tag as the img a browser makes of it', () => {
    const result = finishPhotos(
      '<image src="https://a.example/1.jpg" onerror="x()">',
      one,
      OPTIONS,
    );
    expect(result.html).toBe(
      '<img src="https://a.example/1.jpg" width="552" alt="One" style="display:block;width:100%;max-width:552px;height:auto;border:0;">',
    );
  });

  it('does not count Insert photo here text inside a tag or a comment as a spot', () => {
    const html = `<!-- Insert photo here: a --><a title="Insert photo here: b">x</a>${photo}`;
    const result = finishPhotos(html, one, OPTIONS);
    expect(result.html).toContain('alt="One"');
    expect(result.notes).toEqual(['Fixed 1 photo.']);
  });
});

describe('finishPhotos: notes', () => {
  it('lists at most 20 notes and counts the rest', () => {
    const result = finishPhotos('<img src="x">'.repeat(30), [], OPTIONS);
    expect(result.html).toBe('');
    expect(result.notes).toHaveLength(21);
    expect(result.notes[20]).toBe('And 12 more.');
  });

  it('never quotes pasted text and holds no em dash', () => {
    const many: PhotoSpot[] = [{ where: `Photo ${EM_DASH} 1 ${'x'.repeat(500)}`, alt: 'a' }];
    const result = finishPhotos(
      '<p>Insert photo here: a</p><img src="data:SECRET">',
      many,
      OPTIONS,
    );
    for (const note of result.notes) {
      expect(note).not.toContain(EM_DASH);
      expect(note).not.toContain('SECRET');
      expect(note.length).toBeLessThan(250);
    }
  });

  it('never throws on values of the wrong type', { retry: 2 }, () => {
    const bad = [null, undefined, 5, {}, [{ where: 5, alt: null }, null, 'x']];
    for (const html of bad)
      for (const s of bad)
        for (const o of bad) {
          const result = finishPhotos(html as string, s as PhotoSpot[], o as { logoUrl: string });
          expect(typeof result.html).toBe('string');
        }
    const result = finishPhotos(
      '<img src="https://a.example/1.jpg">',
      [{ where: 5, alt: null }] as unknown as PhotoSpot[],
      { logoUrl: 7 } as unknown as { logoUrl: string },
    );
    expect(result.html).toContain('alt=""');
  });
});

describe('finishPhotos: time', () => {
  const MB2 = 2 * 1024 * 1024;
  const fill = (unit: string): string => unit.repeat(Math.ceil(MB2 / unit.length)).slice(0, MB2);

  it.each([
    ['the letter repeated', fill(pasted)],
    [
      'photos only',
      fill('<img src="https://a.example/1.jpg" class="fr-fic" style="width: 552px;">'),
    ],
    [
      'one tag with a huge attribute',
      `<img src="https://a.example/1.jpg" title="${'a'.repeat(MB2)}">`,
    ],
    [
      'one tag with many attributes',
      `<img src="https://a.example/1.jpg"${' a=b'.repeat(MB2 / 4)}>`,
    ],
    [
      'one huge style',
      `<img src="https://a.example/1.jpg" style="${'width:1px;'.repeat(MB2 / 10)}">`,
    ],
    ['one huge address', `<img src="https://a.example/${'&amp;'.repeat(MB2 / 5)}">`],
    ['comments that never end', fill('<!-- <img ')],
    ['quotes that never end', fill('<img src="')],
    ['less-than signs', fill('<')],
    ['open tags', fill('<img ')],
    ['open scripts', fill('<script>')],
    ['spot text', fill('Insert photo here:')],
    ['spot text inside tags', fill('<a title="Insert photo here:">')],
    ['dashes', `<!--${fill('--!')}`],
    ['bad addresses', fill('<img src=x>')],
  ])('handles 2 MB of %s within budget', (_name, html) => {
    expect(html.length).toBeGreaterThanOrEqual(MB2);
    const start = performance.now();
    const result = finishPhotos(html, spots, OPTIONS);
    expect(performance.now() - start).toBeLessThan(budget(1000));
    expect(result.notes.length).toBeLessThanOrEqual(21);
  });
});

/* ---------- random mutation ---------- */

/** Lower-cases A to Z only, so positions stay the same. */
const lowerAscii = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
const RAW = ['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes'];

/**
 * A slow reference reader written from the HTML standard's tokenizer, one character at a time:
 * the start and end of every img start tag outside comments and raw text elements.
 */
function referenceImgRanges(s: string): [number, number][] {
  const ranges: [number, number][] = [];
  const lower = lowerAscii(s);
  const ws = (c: string | undefined): boolean =>
    c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
  const alpha = (c: string | undefined): boolean => c !== undefined && /^[a-zA-Z]$/.test(c);
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '<') {
      i++;
      continue;
    }
    if (s.startsWith('<!--', i)) {
      let j = i + 4;
      if (s[j] === '>') {
        i = j + 1;
        continue;
      }
      if (s[j] === '-' && s[j + 1] === '>') {
        i = j + 2;
        continue;
      }
      let end = -1;
      for (; j < s.length; j++) {
        if (s.startsWith('-->', j)) end = j + 3;
        else if (s.startsWith('--!>', j)) end = j + 4;
        if (end !== -1) break;
      }
      if (end === -1) return ranges;
      i = end;
      continue;
    }
    const closing = s[i + 1] === '/';
    const first = closing ? s[i + 2] : s[i + 1];
    if (!alpha(first)) {
      if (s[i + 1] === '!' || s[i + 1] === '?' || (closing && first !== undefined)) {
        const gt = s.indexOf('>', i + 2);
        if (gt === -1) return ranges;
        i = gt + 1;
      } else i++;
      continue;
    }
    let j = i + (closing ? 2 : 1);
    const nameStart = j;
    while (j < s.length && !ws(s[j]) && s[j] !== '/' && s[j] !== '>') j++;
    const name = lower.slice(nameStart, j);
    type State = 'before' | 'name' | 'after' | 'beforeValue' | 'dq' | 'sq' | 'bare' | 'done';
    let state: State = 'before';
    for (; j < s.length && state !== 'done'; j++) {
      const c = s[j];
      if (state === 'before') {
        if (c === '>') state = 'done';
        else if (!ws(c) && c !== '/') state = 'name';
      } else if (state === 'name') {
        if (c === '>') state = 'done';
        else if (ws(c)) state = 'after';
        else if (c === '/') state = 'before';
        else if (c === '=') state = 'beforeValue';
      } else if (state === 'after') {
        if (c === '>') state = 'done';
        else if (c === '=') state = 'beforeValue';
        else if (c === '/') state = 'before';
        else if (!ws(c)) state = 'name';
      } else if (state === 'beforeValue') {
        if (c === '>') state = 'done';
        else if (c === '"') state = 'dq';
        else if (c === "'") state = 'sq';
        else if (!ws(c)) state = 'bare';
      } else if (state === 'dq') {
        if (c === '"') state = 'before';
      } else if (state === 'sq') {
        if (c === "'") state = 'before';
      } else if (state === 'bare') {
        if (c === '>') state = 'done';
        else if (ws(c)) state = 'before';
      }
    }
    if (state !== 'done') return ranges;
    if (!closing && (name === 'img' || name === 'image')) ranges.push([i, j]);
    i = j;
    if (closing) continue;
    if (name === 'plaintext') return ranges;
    if (RAW.includes(name)) {
      let from = i;
      for (;;) {
        const at = lower.indexOf(`</${name}`, from);
        if (at === -1) return ranges;
        const after = s[at + 2 + name.length];
        if (ws(after) || after === '/' || after === '>') {
          i = at;
          break;
        }
        from = at + 1;
      }
    }
  }
  return ranges;
}

const BITS = [
  '<',
  '>',
  '"',
  "'",
  '=',
  '/',
  ' ',
  '\n',
  '\t',
  '\f',
  '&',
  ';',
  '-',
  '!',
  '<!--',
  '-->',
  '--!>',
  '<!-->',
  '<!--[if mso]>',
  '<![endif]-->',
  '<![if !mso]>',
  '<img ',
  '<IMG\n',
  '<img',
  'src=',
  ' src="',
  " alt='",
  'style="width: 300px;"',
  'width=200',
  '<script>',
  '</script>',
  '</SCRIPT >',
  '<style>',
  '</style>',
  '<textarea>',
  '</textarea>',
  '<title>',
  '</title',
  '<plaintext>',
  '</',
  '<p>',
  '</p>',
  '<a title="',
  '&amp;',
  '&#x3c;',
  '&#0;',
  '&#99999999999;',
  '&quot',
  'javascript:alert(1)',
  'data:image/png;base64,AAAA',
  'https://a.example/x.jpg',
  ` ${LOGO} `,
  'Insert photo here:',
  '\u0000',
  '\ud800',
  '\udfff',
  ' ',
  String.fromCharCode(0x2014),
  '<img src="https://a.example/q.jpg" alt=\'a>b\'>',
  '<img src=https://a.example/u.jpg>',
  '<img src="javascript:alert(1)">',
  "<img src='data:x'/>",
];

const BASES = [
  pasted,
  rendered,
  `<div style="display:none;">Preview</div><!--[if mso]><table><tr><td><![endif]--><p>Hi</p>` +
    `<img src="${LOGO}" width="90" alt="Logo"><p>Insert photo here: a</p>` +
    `<img src="https://a.example/1.jpg" class="fr-fic fr-dib" style="width: 552px;"><p><em>Caption</em></p>` +
    `<img class="fr-fic" src='https://a.example/2.jpg' data-x="a > b" title='"q"'>` +
    `<!--[if mso]><v:roundrect href="https://a.example/"><img src="https://a.example/3.jpg"></v:roundrect><![endif]-->` +
    `<a href="https://a.example/" title="<img src=x>">Link</a><img src="javascript:alert(1)"><img src=//x>`,
];

function mutate(base: string, random: () => number): string {
  let s = base;
  const pick = (n: number): number => Math.floor(random() * n);
  const edits = 1 + pick(8);
  for (let e = 0; e < edits; e++) {
    const at = pick(s.length + 1);
    const kind = pick(5);
    if (kind === 0) s = s.slice(0, at) + item(BITS, pick(BITS.length)) + s.slice(at);
    else if (kind === 1) s = s.slice(0, at) + s.slice(at + 1 + pick(12));
    else if (kind === 2) {
      // Aim at a photo tag, where a change matters most.
      const img = s.indexOf('<img', at);
      const spot = img === -1 ? at : img + pick(60);
      s = s.slice(0, spot) + item(BITS, pick(BITS.length)) + s.slice(spot);
    } else if (kind === 3) {
      const from = pick(s.length + 1);
      s = s.slice(0, at) + s.slice(from, from + pick(200)) + s.slice(at);
    } else s = s.slice(0, at) + s.slice(at + pick(400));
  }
  return s;
}

describe('finishPhotos: random mutation', () => {
  const RUNS = Number(process.env.FUZZ_RUNS ?? 600);
  const ONE = process.env.FUZZ_SEED === undefined ? undefined : Number(process.env.FUZZ_SEED);
  const seeds = ONE !== undefined ? [ONE] : Array.from({ length: RUNS }, (_, i) => i + 1);
  // Alt text that cannot be in any input, so a rewritten tag is told from an untouched one.
  const marked: PhotoSpot[] = Array.from({ length: 400 }, (_, i) => ({
    where: `Photo ${i + 1}`,
    alt: `ZQJ${i}X`,
  }));
  const REWRITTEN =
    /<img src="https?:\/\/[^"<>]*" width="(\d+)" alt="ZQJ(\d+)X" style="display:block;width:100%;max-width:(\d+)px;height:auto;border:0;">/y;

  /** Undefined when `out` is `input` with only img tags rewritten, removed or kept; else why not. */
  function onlyImgTagsDiffer(input: string, out: string): string | undefined {
    let o = 0;
    let last = 0;
    let lastSpot = -1;
    for (const [start, end] of referenceImgRanges(input)) {
      const between = input.slice(last, start);
      if (!out.startsWith(between, o)) return `text before the tag at ${start} changed`;
      o += between.length;
      last = end;
      REWRITTEN.lastIndex = o;
      const m = REWRITTEN.exec(out);
      if (m !== null) {
        const [whole, width, spot, max] = m;
        if (width !== max || Number(width) < 40 || Number(width) > 552)
          return `bad width at ${start}`;
        if (Number(spot) <= lastSpot) return `spot out of order at ${start}`;
        lastSpot = Number(spot);
        o += whole.length;
      } else if (out.startsWith(input.slice(start, end), o)) o += end - start;
      // Otherwise the tag was removed.
    }
    const rest = input.slice(last);
    if (out.slice(o) !== rest) return 'text after the last tag changed';
    return undefined;
  }

  it('the reference reader agrees with the hand-written cases', () => {
    expect(referenceImgRanges('<a title="<img>"><img a=">"><!-- <img> --><IMG/>')).toEqual([
      [17, 28],
      [42, 48],
    ]);
    expect(referenceImgRanges('<script><img></script><img><textarea><img>')).toEqual([[22, 27]]);
  });

  it(
    'never throws and only ever changes img tags',
    () => {
      const failures: string[] = [];
      let fixed = 0;
      for (const seed of seeds) {
        const random = mulberry32(seed);
        const input = mutate(item(BASES, seed % BASES.length), random);
        let why: string | undefined;
        try {
          const result = finishPhotos(input, marked, OPTIONS);
          fixed += result.fixed;
          why = onlyImgTagsDiffer(input, result.html);
          if (why === undefined && result.notes.length > 21) why = 'too many notes';
          if (why === undefined && result.notes.some((n) => n.includes(EM_DASH)))
            why = 'em dash in a note';
        } catch (error) {
          why = `threw ${String(error)}`;
        }
        if (why !== undefined && failures.length < 3)
          failures.push(`seed ${seed}: ${why}\n${JSON.stringify(input.slice(0, 2000))}`);
      }
      expect(failures).toEqual([]);
      // The mutations must leave plenty of photos to rewrite, or the check above proves little.
      if (ONE === undefined) expect(fixed).toBeGreaterThan(seeds.length);
    },
    5000 + seeds.length * 5,
  );
});
