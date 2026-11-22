/**
 * Long bare links (owner, 2026-11-22). A link whose words are its own address, such as
 * "https://www.signupgenius.com/go/4090F4CAEAE2AA4F58-61725464-stmichael", cannot wrap and
 * stretches the email on a phone, and a screen reader spells it out. The fix offered is the site's
 * host name as the words, "signupgenius.com", with the address behind the link left as it is.
 *
 * Offered as a one-tap suggestion and never applied by the tool. Only for http and https links,
 * and only when the words are the address: words the writer chose are left alone.
 *
 * Addresses are read as text and never opened. Every step reads the text once, so a very long
 * address stays quick.
 */

/** Words longer than this many characters count as a long link. */
export const LONG_LINK_TEXT = 30;

interface Address {
  scheme: string;
  /** The host in lower case, with any port, without any user name. */
  authority: string;
  /** Everything after the host. A lone "/" counts as nothing. */
  rest: string;
}

function readAddress(url: string): Address | undefined {
  const m = /^(https?):\/\/([^/?#\s]*)(\S*)$/i.exec(url.trim());
  if (m === null) return undefined;
  const [, scheme = '', hostPart = '', rest = ''] = m;
  const authority = hostPart.slice(hostPart.lastIndexOf('@') + 1).toLowerCase();
  if (authority === '') return undefined;
  return { scheme: scheme.toLowerCase(), authority, rest: rest === '/' ? '' : rest };
}

function hostOf(address: Address): string | undefined {
  const { authority } = address;
  // An IPv6 host is written in brackets and holds colons of its own.
  const end = authority.startsWith('[') ? authority.indexOf(']') + 1 : authority.indexOf(':');
  const host = (end > 0 ? authority.slice(0, end) : authority).replace(/^www\./, '');
  return host === '' || host.startsWith(':') ? undefined : host;
}

/**
 * The host name of an http or https address, in lower case, without a leading "www." and without
 * a port. A punycode host is shown as it is. Undefined for any other kind of address.
 */
export function hostLabel(url: string): string | undefined {
  const address = readAddress(url);
  return address === undefined ? undefined : hostOf(address);
}

const hasScheme = (text: string) => /^https?:\/\//i.test(text);

/** True when the words, read as an address, are the address of the link. */
function isSame(words: string, target: Address): boolean {
  const shown = readAddress(hasScheme(words) ? words : `${target.scheme}://${words}`);
  return (
    shown !== undefined &&
    shown.scheme === target.scheme &&
    shown.authority === target.authority &&
    shown.rest === target.rest
  );
}

/**
 * The shorter words to offer for a link, or undefined when there is nothing to offer. Offered when
 * the words are longer than 30 characters and are the link's own address: the address itself, or
 * the address without "https://". Capitals in the host and a closing slash make no difference.
 */
export function shortLinkText(text: string, href: string): string | undefined {
  const words = text.trim();
  if (words.length <= LONG_LINK_TEXT) return undefined;
  const target = readAddress(href);
  if (target === undefined || !isSame(words, target)) return undefined;
  const host = hostOf(target);
  return host === undefined || host === words ? undefined : host;
}

export interface LongAddress {
  /** The address as written in the words. */
  from: string;
  /** The host name to show in its place. */
  to: string;
}

/** Punctuation that closes a sentence or a bracket and is not part of the address before it. */
const CLOSING = /[.,;:!?)\]"'’”>]+$/;
const OPENING = /^[(["'‘“<]+/;

/**
 * The link's own long address where it stands among other words, as in "Sign up here:
 * https://www.signupgenius.com/go/4090F4CAEAE2AA4F58". For a button, a link item or a row, where
 * the tool itself may have joined the words before a link to the link. Only the address is
 * offered for shortening; the words around it stay. Undefined when the words do not hold the
 * address. The first one found is returned.
 */
export function longAddressIn(text: string, href: string): LongAddress | undefined {
  const target = readAddress(href);
  if (target === undefined) return undefined;
  const to = hostOf(target);
  if (to === undefined) return undefined;
  // The address as written is about as long as the link: at most a scheme and a slash apart.
  const most = href.trim().length + 1;
  const least = Math.max(LONG_LINK_TEXT + 1, most - 'https://'.length - 2);
  for (const m of text.matchAll(/\S+/g)) {
    const token = m[0].replace(OPENING, '');
    if (token.length < least) continue;
    for (const from of [token, token.replace(CLOSING, '')]) {
      if (from.length < least || from.length > most || from === to) continue;
      if (isSame(from, target)) return { from, to };
    }
  }
  return undefined;
}
