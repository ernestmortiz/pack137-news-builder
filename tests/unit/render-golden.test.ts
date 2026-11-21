import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnnouncementForm } from '../../src/core/forms';
import { lintOutput } from '../../src/core/lint-output';
import { renderAnnouncement } from '../../src/core/render';

const dir = join(__dirname, '../fixtures/weekly');
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

/**
 * Golden comparison rule (ADR 0005): byte for byte, except that a whitespace run holding a line
 * break between two tags is dropped. That is indentation only; email clients ignore it. A space
 * on one line, such as the one between an event link and its tag, still counts.
 */
const layoutOnly = (html: string): string => html.replace(/>\s*\n\s*</g, '><').trim();

const fixtures = [
  '1-pack-calendar',
  '2-help-needed',
  '3-year-in-review-photos',
  '4-in-the-news',
  '5-webelos-dens-10-11',
];

describe('renderAnnouncement: golden fixtures', () => {
  it.each(fixtures)('%s renders to the approved output', (name) => {
    const form = JSON.parse(read(`${name}.form.json`)) as AnnouncementForm;
    expect(layoutOnly(renderAnnouncement(form))).toBe(layoutOnly(read(`${name}.expected.html`)));
  });

  it.each(fixtures)('%s passes the output linter', (name) => {
    const form = JSON.parse(read(`${name}.form.json`)) as AnnouncementForm;
    expect(lintOutput(renderAnnouncement(form))).toEqual([]);
  });
});
