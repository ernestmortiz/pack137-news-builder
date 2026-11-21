/**
 * Title cleanup helper (build spec, section 7.4). A copied page title often ends with the site
 * name, as in "Headline | Cranford, NJ News". The site name is removed from link text.
 */
import { packConfig } from '../../config/pack.config';

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

/**
 * A short source line for a link to a well-known site (the `knownSites` of pack.config.ts), or ''
 * when the site is not known.
 */
export function sourceNote(url: string): string {
  const host = /^https?:\/\/([^/?#:]+)/i.exec(url.trim())?.[1]?.toLowerCase();
  if (host === undefined) return '';
  const site = packConfig.knownSites.find(
    (s) => host === s.host || (s.subdomains && host.endsWith('.' + s.host)),
  );
  return site?.note ?? '';
}
