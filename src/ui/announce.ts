/**
 * One quiet spoken line for screen readers ("Saved", "Undone: typing in Title"). Visible notes
 * stay on screen but do not speak by themselves, so nothing repeats on every keystroke or every
 * autosave.
 */

/** Lets a message through at most once per `gapMs`, per key. Pure, so it can be tested. */
export function createThrottle(gapMs: number): (key: string, now: number) => boolean {
  const last = new Map<string, number>();
  return (key, now) => {
    const before = last.get(key);
    if (before !== undefined && now - before < gapMs) return false;
    last.set(key, now);
    return true;
  };
}

let region: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function liveRegion(): HTMLElement {
  if (region?.isConnected) return region;
  region = document.createElement('div');
  region.className = 'sr-only';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  document.body.append(region);
  return region;
}

/**
 * Speaks `text`. The line is emptied first, so saying the same words twice (Undone, Undone)
 * is announced twice.
 */
export function announce(text: string): void {
  const node = liveRegion();
  node.textContent = '';
  clearTimeout(timer);
  timer = setTimeout(() => {
    node.textContent = text;
  }, 60);
}

/** How often "Saved on this device" may be spoken while someone keeps typing. */
export const SAVE_ANNOUNCE_GAP_MS = 60_000;
