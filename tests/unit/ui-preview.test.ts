import { describe, expect, it } from 'vitest';
import type { AnnouncementForm } from '../../src/core/forms';
import { lintOutput } from '../../src/core/lint-output';
import { renderAnnouncement } from '../../src/core/render';
import { PREVIEW_CSP, previewDocument, replaceImagesWithPlaceholders } from '../../src/ui/preview';

const linkList: AnnouncementForm = {
  layout: 'link-list',
  label: 'Read',
  title: 'Links',
  image: { src: 'https://example.org/pic.png', alt: 'A "big" cat & dog' },
  intro: [],
  items: [{ text: 'One', url: 'https://example.org/1', note: '' }],
};

describe('replaceImagesWithPlaceholders', () => {
  it('replaces an image with a box sized like the picture, showing the alt text', () => {
    const html = renderAnnouncement(linkList);
    expect(html).toContain('<img');
    const out = replaceImagesWithPlaceholders(html);
    expect(out).not.toContain('<img');
    expect(out).not.toContain('example.org/pic.png');
    // The Link list picture is a fixed 80px in the email, so its stand-in is too.
    expect(out).toContain('width:80px;max-width:100%;');
    expect(out).toContain('A &quot;big&quot; cat &amp; dog</div>');
  });

  it('says Image when the alt text is empty or only spaces', () => {
    const empty = renderAnnouncement({
      ...linkList,
      image: { src: 'https://example.org/p.png', alt: '' },
    });
    expect(replaceImagesWithPlaceholders(empty)).toContain('>Image</div>');
    expect(
      replaceImagesWithPlaceholders('<img src="https://x.org/a.png" width="40" alt="  ">'),
    ).toContain('>Image</div>');
  });

  it('handles several images and tags in any attribute order', () => {
    const out = replaceImagesWithPlaceholders(
      '<p>a</p><IMG alt="One" width="120" src="https://x.org/1.png"><img src="https://x.org/2.png" alt="Two">',
    );
    expect(out).toContain('width:120px;');
    expect(out).toContain('>One</div>');
    expect(out).toContain('width:100%;');
    expect(out).toContain('>Two</div>');
    expect(out).not.toMatch(/<img/i);
  });

  it('does not change the string it was given', () => {
    const html = renderAnnouncement(linkList);
    const copy = String(html);
    replaceImagesWithPlaceholders(html);
    expect(html).toBe(copy);
    expect(html).toContain('<img');
  });

  it('leaves text that only looks like an image alone', () => {
    const html = renderAnnouncement({
      layout: 'message',
      label: '',
      title: '',
      paragraphs: [[{ kind: 'text', text: '<img src=x onerror=alert(1)>', marks: [] }]],
    });
    const out = replaceImagesWithPlaceholders(html);
    expect(out).toBe(html);
    expect(out).toContain('&lt;img');
  });

  it('produces no remote address and passes the output linter apart from the placeholder', () => {
    const out = replaceImagesWithPlaceholders(renderAnnouncement(linkList));
    expect(out).not.toMatch(/https?:\/\/example\.org\/pic/);
    expect(lintOutput(renderAnnouncement(linkList))).toEqual([]);
  });
});

describe('previewDocument', () => {
  it('carries its own policy and no script', () => {
    const doc = previewDocument(renderAnnouncement(linkList));
    expect(doc).toContain(`content="${PREVIEW_CSP}"`);
    expect(PREVIEW_CSP).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    expect(doc).not.toMatch(/<script/i);
    expect(doc).not.toContain('<img');
  });

  it('sizes each stand-in like its picture: full-width photos and fixed-size logos', () => {
    const out = replaceImagesWithPlaceholders(
      '<img src="https://x.org/a.jpg" width="552" alt="Photo" style="display:block;width:100%;max-width:552px;height:auto;border:0;">' +
        '<img src="https://x.org/l.jpg" width="90" height="90" alt="Logo" style="display:block;width:90px;max-width:100%;height:90px;border-radius:50%;border:0;">' +
        '<img src="https://x.org/n.jpg" width="80" alt="No style">',
    );
    expect(out).toContain('width:100%;max-width:552px;');
    expect(out).toContain('width:90px;max-width:100%;');
    expect(out).toContain('width:80px;max-width:100%;');
  });
});
