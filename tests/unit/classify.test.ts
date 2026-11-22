import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classify } from '../../src/core/classify';
import { parse } from '../../src/core/pipeline';

const layoutOf = (html: string) => classify(parse(html).model).layout;
const weekly = (file: string) => readFileSync(join(__dirname, '../fixtures/weekly', file), 'utf8');

describe('classify', () => {
  it('suggests Date list when list items mostly start with a date', () => {
    expect(
      layoutOf(
        '<p>Upcoming</p><ul><li>Dec 6 Parent Planning Meeting (Virtual)</li><li>12/15 Pack Meeting</li><li>Jan 3 Den meeting</li><li>Bring a toy</li></ul>',
      ),
    ).toBe('date-list');
  });

  it('suggests Date list from dated paragraphs when there is no list', () => {
    expect(
      layoutOf('<p>Dec 6 Parent meeting.</p><p>Dec 15 Pack meeting.</p><p>See you there.</p>'),
    ).toBe('date-list');
  });

  it('reads a struck-through date as a date', () => {
    expect(layoutOf('<ul><li><s>Dec 6</s> Dec 13 Hike</li><li>Dec 15 Meeting</li></ul>')).toBe(
      'date-list',
    );
  });

  it('reads a date behind a bullet or ornament', () => {
    expect(
      layoutOf(
        '<ul><li>\u2022 Dec 6 Meeting</li><li>\u27A4 Dec 8 Hike</li><li>\u2605 Dec 15 Pack meeting</li></ul>',
      ),
    ).toBe('date-list');
  });

  it('does not suggest Date list when only one item is dated', () => {
    expect(
      layoutOf('<ul><li>Dec 6 Meeting</li><li>Bring snacks</li><li>Wear class B</li></ul>'),
    ).toBe('message');
  });

  it('suggests Link list when items are mostly links', () => {
    expect(
      layoutOf(
        '<p>Read all about it!</p><ul><li><a href="https://a.org/1">Cranford Scouts collect food | TAPinto</a></li><li><a href="https://a.org/2">Thank you letter</a> - From the pack</li><li><a href="https://a.org/3">A short history</a></li></ul>',
      ),
    ).toBe('link-list');
  });

  it('suggests Help wanted for a volunteer ask with an email link', () => {
    expect(
      layoutOf(
        '<p>We need volunteers for the Pinewood Derby.</p><p>Email <a href="mailto:pack@example.org">pack@example.org</a> and a second link <a href="https://x.org">here</a>.</p>',
      ),
    ).toBe('help-wanted');
  });

  it('does not suggest Help wanted without a mailto link', () => {
    expect(
      layoutOf(
        '<p>We need volunteers.</p><p>Sign up <a href="https://x.org/a">here</a> or <a href="https://x.org/b">there</a>.</p>',
      ),
    ).toBe('message');
  });

  it('suggests Call to action for one link and a short paragraph', () => {
    expect(
      layoutOf(
        '<p>Share your favorite pack memories for the poster board.</p><p><a href="https://forms.gle/x">Upload your photos</a></p>',
      ),
    ).toBe('call-to-action');
  });

  it('counts the same link twice as one link', () => {
    expect(
      layoutOf(
        '<p><a href="https://forms.gle/x">Upload</a> your photos.</p><p><a href="https://forms.gle/x">Upload here</a></p>',
      ),
    ).toBe('call-to-action');
  });

  it('suggests Message for a long note with one link', () => {
    const long = 'word '.repeat(80);
    expect(layoutOf(`<p>${long}</p><p><a href="https://x.org">Link</a></p>`)).toBe('message');
  });

  it('suggests Message for plain text and for empty input', () => {
    expect(layoutOf('<p>Thank you all for a great campout.</p>')).toBe('message');
    expect(layoutOf('')).toBe('message');
  });

  it('gives a plain-words reason for every suggestion', () => {
    const { reason } = classify(parse('<ul><li>Dec 6 A</li><li>Dec 7 B</li></ul>').model);
    expect(reason).toMatch(/date/i);
  });

  it('prefers Date list over Help wanted when both match', () => {
    expect(
      layoutOf(
        '<p>We need help at these events. Email <a href="mailto:a@b.org">us</a>.</p><ul><li>Dec 6 Setup</li><li>Dec 7 Cleanup</li></ul>',
      ),
    ).toBe('date-list');
  });

  it('recognizes re-pasted approved output for Help wanted and Call to action', () => {
    expect(layoutOf(weekly('2-help-needed.expected.html'))).toBe('help-wanted');
    expect(layoutOf(weekly('3-year-in-review-photos.expected.html'))).toBe('call-to-action');
  });
});
