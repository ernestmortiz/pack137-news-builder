/**
 * Title cleanup helper (build spec, section 7.4). A copied page title often ends with the site
 * name, as in "Headline | Cranford, NJ News". The site name is removed from link text.
 */
export interface TitleCleanup {
  text: string;
  /** The site name that was removed. */
  site: string;
}

const MAX_SITE_LENGTH = 40;

export function stripSiteName(text: string): TitleCleanup | null {
  const at = text.lastIndexOf(' | ');
  if (at <= 0) return null;
  const title = text.slice(0, at).trim();
  const site = text.slice(at + 3).trim();
  if (title === '' || site === '' || site.length > MAX_SITE_LENGTH) return null;
  return { text: title, site };
}

interface Source {
  host: RegExp;
  note: string;
}

const SOURCES: Source[] = [
  { host: /^drive\.google\.com$/, note: 'On Google Drive' },
  { host: /^docs\.google\.com$/, note: 'On Google Docs' },
  { host: /^forms\.gle$/, note: 'On Google Forms' },
  { host: /(^|\.)youtube\.com$|^youtu\.be$/, note: 'On YouTube' },
  { host: /(^|\.)facebook\.com$/, note: 'On Facebook' },
  { host: /(^|\.)tapinto\.net$/, note: 'TAPinto' },
];

/** A short source line for a link to a well-known site, or '' when the site is not known. */
export function sourceNote(url: string): string {
  const host = /^https?:\/\/([^/?#:]+)/i.exec(url.trim())?.[1]?.toLowerCase();
  if (host === undefined) return '';
  return SOURCES.find((s) => s.host.test(host))?.note ?? '';
}
