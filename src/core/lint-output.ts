import { color } from '../config/tokens';

/**
 * Output linter (build spec, section 11.3). Every HTML string the tool emits must pass this.
 * Returns a list of problems; an empty list means the output meets the contract.
 */
export interface LintOptions {
  /** Monthly letter may carry Outlook conditional comments, a preview-text div and a VML button. */
  monthly?: boolean;
}

/** Built from its code point so this file itself contains no em dash. */
export const EM_DASH = String.fromCharCode(0x2014);

const allowedColors = new Set(Object.values(color).map((c) => c.toUpperCase()));

export function lintOutput(html: string, options: LintOptions = {}): string[] {
  const problems: string[] = [];
  // Outlook conditional comments are checked separately; strip them before the general rules.
  const body = options.monthly ? html.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, '') : html;

  if (/<script\b/i.test(body)) problems.push('contains <script>');
  if (/<style\b/i.test(body)) problems.push('contains <style>');
  if (/\sclass=/i.test(body)) problems.push('contains a class attribute');
  if (/\sid=/i.test(body)) problems.push('contains an id attribute');
  if (/\sdata-[a-z-]+=/i.test(body)) problems.push('contains a data- attribute');
  if (/\son[a-z]+\s*=/i.test(body)) problems.push('contains an event handler attribute');
  if (body.includes(EM_DASH)) problems.push('contains an em dash');
  if (/calc\(/i.test(body)) problems.push('contains calc()');

  for (const match of body.matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
    if (!allowedColors.has(match[0].toUpperCase()))
      problems.push(`color ${match[0]} is not a token`);
  }
  if (/rgba?\(/i.test(body)) problems.push('contains an rgb() color; use token hex values');

  for (const match of body.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\salt="[^"]+"/i.test(tag)) problems.push('image without alt text');
    if (!/max-width:\s*100%/i.test(tag) && !/max-width:\s*\d+px/i.test(tag))
      problems.push('image without max-width');
  }
  for (const match of body.matchAll(/<a\b[^>]*>/gi)) {
    const href = /\shref="([^"]*)"/i.exec(match[0])?.[1];
    if (!href) problems.push('link without href');
    else if (!/^(https:\/\/|http:\/\/|mailto:)/i.test(href))
      problems.push(`link is not absolute: ${href}`);
  }
  for (const match of body.matchAll(/<table\b[^>]*>/gi)) {
    const widths = [...match[0].matchAll(/width:\s*(\d+(?:\.\d+)?)%/gi)].map((m) => Number(m[1]));
    if (widths.some((w) => w !== 100))
      problems.push('layout table with a percentage width other than 100%');
  }
  if (/<td[^>]*width="96"/i.test(body)) problems.push('retired two-column date row');
  return problems;
}
