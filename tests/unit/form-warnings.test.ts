import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formWarnings } from '../../src/core/form-warnings';
import type { AnnouncementForm, DateRow, DateSection, RichText } from '../../src/core/forms';
import { renderAnnouncement } from '../../src/core/render';

const EM = String.fromCharCode(0x2014);
const rt = (text: string, href?: string): RichText => [
  href === undefined ? { kind: 'text', text, marks: [] } : { kind: 'text', text, marks: [], href },
];
const row = (over: Partial<DateRow> = {}): DateRow => ({
  date: { start: { year: 2026, month: 12, day: 6 } },
  event: 'Meeting',
  url: '',
  tags: [],
  note: [],
  ...over,
});
const dateList = (...sections: DateSection[]): AnnouncementForm => ({
  layout: 'date-list',
  label: 'L',
  title: 'T',
  sections,
});
const sec = (over: Partial<DateSection> = {}): DateSection => ({
  name: 'Coming soon',
  style: 'plain',
  subtitle: '',
  rows: [row()],
  ...over,
});
const cta = (button: { text: string; url: string }): AnnouncementForm => ({
  layout: 'call-to-action',
  label: 'L',
  title: 'T',
  paragraph: rt('Hi'),
  button,
});
const message = (
  over: Partial<Extract<AnnouncementForm, { layout: 'message' }>> = {},
): AnnouncementForm => ({
  layout: 'message',
  label: 'L',
  title: 'T',
  paragraphs: [rt('Hi')],
  ...over,
});
const linkList = (
  over: Partial<Extract<AnnouncementForm, { layout: 'link-list' }>> = {},
): AnnouncementForm => ({
  layout: 'link-list',
  label: 'L',
  title: 'T',
  intro: [],
  items: [{ text: 'Story', url: 'https://x.org', note: '' }],
  ...over,
});
const help = (
  over: Partial<Extract<AnnouncementForm, { layout: 'help-wanted' }>> = {},
): AnnouncementForm => ({
  layout: 'help-wanted',
  label: 'L',
  title: 'T',
  intro: [],
  ask: {
    badge: 'B',
    title: 'Ask',
    paragraphs: [rt('Please')],
    button: { text: 'Help', url: 'mailto:a@x.org' },
  },
  outro: [],
  ...over,
});
const codes = (f: AnnouncementForm): string[] => formWarnings(f).map((w) => w.code);

describe('button-no-link', () => {
  it('warns for a call to action button with a bad link or no text', () => {
    expect(codes(cta({ text: 'Go', url: 'example.org' }))).toEqual(['button-no-link']);
    expect(codes(cta({ text: 'Go', url: '' }))).toEqual(['button-no-link']);
    expect(codes(cta({ text: '', url: 'https://x.org' }))).toEqual(['button-no-link']);
    expect(formWarnings(cta({ text: 'Go', url: '' }))[0]?.where).toBe('Button');
  });
  it('warns for a Message button with text but no valid link, not for an empty one', () => {
    expect(codes(message({ button: { text: 'Go', url: 'ftp://x' } }))).toEqual(['button-no-link']);
    expect(codes(message({ button: { text: '', url: '' } }))).toEqual([]);
    expect(codes(message({ button: { text: ' ', url: ' ' } }))).toEqual([]);
    expect(codes(message())).toEqual([]);
  });
  it('covers the Help wanted ask and secondary buttons', () => {
    const base = help();
    if (base.layout !== 'help-wanted') throw new Error('layout');
    expect(codes(help({ ask: { ...base.ask, button: { text: 'Help', url: 'nope' } } }))).toEqual([
      'button-no-link',
    ]);
    expect(codes(help({ secondary: { text: 'More', url: 'nope' } }))).toEqual(['button-no-link']);
    expect(codes(help({ secondary: { text: '', url: 'https://x.org' } }))).toEqual([
      'button-no-link',
    ]);
    expect(codes(help({ secondary: { text: '', url: '' } }))).toEqual([]);
  });
});

describe('empty-section', () => {
  it('warns for a section with no rows or only dropped rows', () => {
    const dropped = row({ date: undefined, event: ' ' });
    const f = dateList(sec(), sec({ rows: [] }), sec({ name: '', rows: [dropped] }));
    const w = formWarnings(f);
    expect(w.map((x) => x.code)).toEqual(['empty-section', 'empty-section']);
    expect(w.map((x) => x.where)).toEqual(['Coming soon section', 'Section 3']);
  });
  it('agrees with the renderer', () => {
    const f = dateList(sec({ name: 'Gone', rows: [] }));
    expect(codes(f)).toEqual(['empty-section']);
    expect(renderAnnouncement(f)).not.toContain('Gone');
  });
});

describe('link-not-valid', () => {
  it('warns for a bad row link and names the row', () => {
    const f = dateList(sec({ rows: [row(), row({ url: 'www.x.org' })] }));
    const w = formWarnings(f);
    expect(w).toHaveLength(1);
    expect(w[0]?.code).toBe('link-not-valid');
    expect(w[0]?.where).toBe('Coming soon section, row 2');
  });
  it('does not warn for empty row links or valid ones', () => {
    expect(
      codes(
        dateList(
          sec({ rows: [row({ url: '' }), row({ url: ' ' }), row({ url: 'https://x.org' })] }),
        ),
      ),
    ).toEqual([]);
  });
  it('warns for link list items and rich text link runs', () => {
    expect(codes(linkList({ items: [{ text: 'S', url: 'x.org', note: '' }] }))).toEqual([
      'link-not-valid',
    ]);
    expect(codes(message({ paragraphs: [rt('see', 'javascript:alert(1)')] }))).toEqual([
      'link-not-valid',
    ]);
    expect(codes(message({ paragraphs: [rt('see', 'https://x.org')] }))).toEqual([]);
    expect(codes(dateList(sec({ rows: [row({ note: rt('n', 'bad') })] })))).toEqual([
      'link-not-valid',
    ]);
  });
});

describe('image-no-alt', () => {
  it('warns for a valid image with empty alt only', () => {
    expect(codes(linkList({ image: { src: 'https://x.org/a.png', alt: ' ' } }))).toEqual([
      'image-no-alt',
    ]);
    expect(codes(linkList({ image: { src: 'https://x.org/a.png', alt: 'Scouts' } }))).toEqual([]);
    expect(codes(linkList({ image: { src: 'bad', alt: '' } }))).toEqual([]);
  });
});

describe('messages', () => {
  it('are plain sentences with no em dash or jargon', () => {
    const all = [
      ...formWarnings(cta({ text: 'Go', url: 'x' })),
      ...formWarnings(dateList(sec({ rows: [] }), sec({ rows: [row({ url: 'x' })] }))),
      ...formWarnings(linkList({ image: { src: 'https://x.org/a.png', alt: '' } })),
    ];
    expect(all.length).toBe(4);
    for (const w of all) {
      expect(w.message).not.toContain(EM);
      expect(w.message).not.toMatch(/href|URL/);
      expect(w.message.endsWith('.')).toBe(true);
    }
  });
});

describe('approved weekly forms', () => {
  const dir = join(__dirname, '..', 'fixtures', 'weekly');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.form.json'))) {
    it(`${file} gives no warnings`, () => {
      const form = JSON.parse(readFileSync(join(dir, file), 'utf8')) as AnnouncementForm;
      expect(formWarnings(form)).toEqual([]);
    });
  }
});
