/**
 * Warnings helper (build spec, section 7.4). Spots a link to a TroopTrack /manage/ page, which
 * parents may not be able to open, and a service such as SignUpGenius named with no link to it.
 */
export function isManageLink(url: string): boolean {
  return /^https?:\/\/[^/?#]*trooptrack\.com\/manage(?:[/?#]|$)/i.test(url.trim());
}

interface Service {
  name: string;
  mention: RegExp;
  link: RegExp;
}

const SERVICES: Service[] = [
  { name: 'SignUpGenius', mention: /\bsign\s*up\s*genius\b/i, link: /signupgenius\.com/i },
  { name: 'Google Forms', mention: /\bgoogle\s+forms?\b/i, link: /forms\.gle|google\.com\/forms/i },
  { name: 'Evite', mention: /\bevite\b/i, link: /evite\.com/i },
  { name: 'Eventbrite', mention: /\beventbrite\b/i, link: /eventbrite\./i },
  { name: 'Zoom', mention: /\bzoom\b/i, link: /zoom\.us/i },
];

/** Names of the services the text mentions that none of the given links point to. */
export function unlinkedServices(text: string, urls: string[]): string[] {
  return SERVICES.filter((s) => s.mention.test(text) && !urls.some((u) => s.link.test(u))).map(
    (s) => s.name,
  );
}
