/**
 * Copy to the clipboard (build spec 7.5). Tries the async clipboard API first. If that is missing
 * or refused, falls back to a read-only textarea that is selected, and tries the old copy command.
 * If even that fails, the caller shows the selected textarea so the person can press Ctrl+C.
 */

export type CopyOutcome =
  /** The text is on the clipboard. */
  | 'copied'
  /** Could not copy. The textarea is selected so the person can copy by hand. */
  | 'manual';

export interface ClipboardEnv {
  clipboard?: { writeText(text: string): Promise<void> } | undefined;
  /** Runs the old copy command on the current selection. */
  execCopy(): boolean;
}

export function browserClipboardEnv(): ClipboardEnv {
  return {
    clipboard: typeof navigator === 'undefined' ? undefined : navigator.clipboard,
    execCopy: () => {
      try {
        return document.execCommand('copy');
      } catch {
        return false;
      }
    },
  };
}

/** Selects all the text in a read-only textarea, including on touch screens. */
export function selectAll(area: HTMLTextAreaElement): void {
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);
}

/**
 * Copies `text`. `fallbackArea` is the read-only textarea that holds the same text; it is
 * selected whenever the async API did not work.
 */
export async function copyText(
  text: string,
  fallbackArea: HTMLTextAreaElement,
  env: ClipboardEnv = browserClipboardEnv(),
): Promise<CopyOutcome> {
  if (env.clipboard !== undefined) {
    try {
      await env.clipboard.writeText(text);
      return 'copied';
    } catch {
      // Refused or unavailable: fall through to the textarea.
    }
  }
  fallbackArea.value = text;
  selectAll(fallbackArea);
  return env.execCopy() ? 'copied' : 'manual';
}
