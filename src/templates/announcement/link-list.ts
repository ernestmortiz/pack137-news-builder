import type { DateRow, LinkListForm } from '../../core/forms';
import { image, isEmptyRich, lines, paragraph, rowsTable } from '../components';

/** Link list: optional 80px image above the text, a short intro (6px below) and link rows. */
export function linkListBody(form: LinkListForm): string {
  const rows: DateRow[] = form.items
    .filter((item) => item.text.trim() !== '')
    .map((item) => ({
      event: item.text,
      url: item.url,
      tags: [],
      note: [{ kind: 'text', text: item.note, marks: [] }],
    }));
  return lines(
    image(form.image),
    !isEmptyRich(form.intro) && paragraph(form.intro, '0 0 6px 0'),
    rows.length > 0 &&
      rowsTable(rows, { onPanel: false, separator: 'lavender', firstBorder: false }),
  );
}
