/**
 * Small fixes (build spec, section 7.4). These are offered as one-tap suggestions and never
 * applied by the tool: "&" to "and", "On going" to "Ongoing", doubled spaces.
 */
export interface SmallFix {
  from: string;
  to: string;
  /** One plain sentence. */
  message: string;
}

export function smallFixes(text: string): SmallFix[] {
  const out: SmallFix[] = [];

  if (/\S & \S/.test(text)) out.push({ from: ' & ', to: ' and ', message: 'Change "&" to "and".' });

  const going = /\bon going\b/i.exec(text)?.[0];
  if (going !== undefined) {
    const to = going.startsWith('O') ? 'Ongoing' : 'ongoing';
    out.push({ from: going, to, message: `Change "${going}" to "${to}".` });
  }

  const spaces = / {2,}/.exec(text)?.[0];
  if (spaces !== undefined)
    out.push({ from: spaces, to: ' ', message: 'Remove the extra space between two words.' });

  return out;
}
