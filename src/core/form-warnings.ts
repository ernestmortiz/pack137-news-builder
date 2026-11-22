/**
 * Warnings for a form (ADR 0005, owner decisions 2026-11-21). The renderer leaves out buttons with
 * no valid link and sections with no rows, shows bad links as plain text and keeps images with no
 * alt text. This lists each of those so the UI can tell the volunteer. It uses the same link check
 * (`safeUrl`, `safeWebUrl`), the same row rule (`rowIsShown`) and the same text rule as the
 * renderer, so the two cannot drift. Pure: a form in, a list out.
 */
import { altTextProblems } from './alt-text';
import { containsDate } from './dates';
import { isEmptyRich, rowIsShown, safeUrl, safeWebUrl } from '../templates/components';

export { rowIsShown };
import type { AnnouncementForm, ButtonField, RichText } from './forms';

export type FormWarningCode =
  | 'button-no-link'
  | 'empty-section'
  | 'link-not-valid'
  | 'image-no-alt'
  | 'image-alt'
  | 'row-no-date'
  | 'title-has-date';

export interface FormWarning {
  code: FormWarningCode;
  message: string;
  where: string;
}

/** True when the renderer shows the row: it has an event name or a usable date. */
/** A non-empty link that the renderer cannot use. Empty links are normal. */
function badLink(url: string): boolean {
  return url.trim() !== '' && safeUrl(url) === null;
}

function buttonWarnings(
  field: ButtonField | undefined,
  where: string,
  optional: boolean,
): FormWarning[] {
  if (field === undefined) return optional ? [] : [noLink(where, 'is missing')];
  const noText = field.text.trim() === '';
  const noUrl = field.url.trim() === '';
  if (optional && noText && noUrl) return [];
  if (noText) return [noLink(where, 'has no text')];
  if (safeUrl(field.url) === null)
    return [noLink(where, 'needs a link that starts with https://, http:// or mailto:')];
  return [];
}

function noLink(where: string, reason: string): FormWarning {
  return {
    code: 'button-no-link',
    where,
    message: `The ${where.toLowerCase()} ${reason}, so it is left out of the announcement.`,
  };
}

function badLinkWarning(where: string): FormWarning {
  return {
    code: 'link-not-valid',
    where,
    message: `${where}: this link is not a full web or email link, so it shows as plain text.`,
  };
}

function richWarnings(runs: RichText, where: string): FormWarning[] {
  if (isEmptyRich(runs)) return [];
  const bad = runs.some(
    (run) => run.kind === 'text' && run.text !== '' && run.href !== undefined && badLink(run.href),
  );
  return bad ? [badLinkWarning(where)] : [];
}

function warningsFor(form: AnnouncementForm): FormWarning[] {
  switch (form.layout) {
    case 'message':
      return [
        ...form.paragraphs.flatMap((p, i) => richWarnings(p, `paragraph ${i + 1}`)),
        ...buttonWarnings(form.button, 'Button', true),
      ];
    case 'call-to-action':
      return [
        ...richWarnings(form.paragraph, 'paragraph'),
        ...buttonWarnings(form.button, 'Button', false),
      ];
    case 'link-list': {
      const out: FormWarning[] = [];
      const img = form.image;
      if (img !== undefined && safeWebUrl(img.src) !== null) {
        for (const problem of altTextProblems(img.alt)) {
          out.push({
            code: problem.code === 'missing' ? 'image-no-alt' : 'image-alt',
            where: 'Image',
            message:
              problem.code === 'missing'
                ? 'The image has no description, so people using screen readers will not know what it shows.'
                : problem.message,
          });
        }
      }
      out.push(...richWarnings(form.intro, 'intro'));
      form.items.forEach((item, i) => {
        if (item.text.trim() !== '' && badLink(item.url)) out.push(badLinkWarning(`Link ${i + 1}`));
      });
      return out;
    }
    case 'date-list': {
      const out: FormWarning[] = [];
      // Owner request, 2026-11-22: a date in the title repeats the list's dates. The title is the
      // volunteer's copy, so it is only pointed out, never changed.
      const dated = form.sections.some((s) => s.rows.some((r) => r.date !== undefined));
      if (dated && containsDate(form.title))
        out.push({
          code: 'title-has-date',
          where: 'Title',
          message: 'The title has a date, and the dates are now in the list. Shorten the title?',
        });
      form.sections.forEach((section, si) => {
        const name =
          section.name.trim() !== '' ? `${section.name.trim()} section` : `Section ${si + 1}`;
        if (!section.rows.some(rowIsShown)) {
          out.push({
            code: 'empty-section',
            where: name,
            message: `The ${name} has no rows to show, so it is left out of the announcement.`,
          });
          return;
        }
        section.rows.forEach((row, ri) => {
          if (!rowIsShown(row)) return;
          const where = `${name}, row ${ri + 1}`;
          if (row.date === undefined && row.url.trim() === '')
            out.push({
              code: 'row-no-date',
              where,
              message: `${where} has no date and no link. Add a date, or move this text into another row's note.`,
            });
          if (badLink(row.url)) out.push(badLinkWarning(where));
          out.push(...richWarnings(row.note, `${where} note`));
        });
      });
      return out;
    }
    case 'help-wanted':
      return [
        ...richWarnings(form.intro, 'intro'),
        ...form.ask.paragraphs.flatMap((p, i) => richWarnings(p, `request paragraph ${i + 1}`)),
        ...buttonWarnings(form.ask.button, 'Help button', false),
        ...richWarnings(form.outro, 'closing line'),
        ...buttonWarnings(form.secondary, 'Second button', true),
      ];
  }
}

export function formWarnings(form: AnnouncementForm): FormWarning[] {
  return warningsFor(form);
}
