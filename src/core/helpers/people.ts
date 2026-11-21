/**
 * People helper (build spec, section 7.4). Text after " - " at the end of a link row is read as
 * the person to contact.
 */
import { EM_DASH, squash } from './text';

const AFTER_DASH = new RegExp(`^\\s*[-\\u2013${EM_DASH}]\\s*(.+?)\\s*$`);

/** The name in " - Jen and Tess", or null when the text is not a dash and a short name. */
export function readContact(afterLink: string): string | null {
  const name = AFTER_DASH.exec(squash(afterLink))?.[1];
  if (name === undefined) return null;
  if (!/^\p{L}/u.test(name) || /[.!?:;/@\d]/.test(name)) return null;
  if (name.split(' ').length > 6) return null;
  return name;
}

export function contactNote(name: string): string {
  return `Contact: ${name}`;
}
