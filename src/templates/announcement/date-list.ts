import type { DateListForm, DateRow, DateSection } from '../../core/forms';
import {
  badge,
  dateText,
  esc,
  lines,
  panel,
  rowBody,
  rowsTable,
  sectionHeading,
  spacer,
} from '../components';
import { color } from '../../config/tokens';

function usable(row: DateRow): boolean {
  return row.event.trim() !== '' || dateText(row.date) !== null;
}

function plainSection(name: string, rows: DateRow[]): string {
  const named = name.trim() !== '';
  return lines(
    named && sectionHeading(name),
    // A named section puts a border on every row; an unnamed one starts without.
    rowsTable(rows, { onPanel: false, separator: 'lavender', firstBorder: named }),
  );
}

function highlightSection(name: string, rows: DateRow[]): string {
  const named = name.trim() !== '';
  const inner =
    !named && rows.length === 1 && rows[0] !== undefined
      ? rowBody(rows[0], true)
      : lines(
          named && badge(name, 'navy'),
          rowsTable(rows, { onPanel: true, separator: 'white', firstBorder: false }),
        );
  return panel('goldPale', inner);
}

function quietSection(section: DateSection, rows: DateRow[]): string {
  const named = section.name.trim() !== '';
  const hasSubtitle = section.subtitle.trim() !== '';
  return panel(
    'lavender',
    lines(
      named &&
        `<div style="color:${color.navy};font-size:17px;font-weight:700;">${esc(section.name)}</div>`,
      hasSubtitle &&
        `<div style="font-size:13px;color:${color.ink};padding-top:2px;">${esc(section.subtitle)}</div>`,
      rowsTable(rows, { onPanel: true, separator: 'white', firstBorder: false }),
    ),
  );
}

/** Date list: sections of plain, highlight or quiet style. A section with no rows renders nothing. */
export function dateListBody(form: DateListForm): string {
  const parts: string[] = [];
  for (const section of form.sections) {
    const rows = section.rows.filter(usable);
    if (rows.length === 0) continue;
    if (section.style === 'plain') {
      parts.push(plainSection(section.name, rows));
      continue;
    }
    if (parts.length > 0) parts.push(spacer());
    parts.push(
      section.style === 'highlight'
        ? highlightSection(section.name, rows)
        : quietSection(section, rows),
    );
  }
  return parts.join('\n');
}
