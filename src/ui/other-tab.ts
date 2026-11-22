/**
 * Two tabs can have the app open on the same device. When another tab changes the saved draft or
 * the saved settings, this tab must not save over that change until the person chooses. No DOM here
 * except `watchOtherTabs`, which only listens for the browser's storage event.
 */
import type { DeviceStorage } from './storage';
import { DRAFT_KEY, SETTINGS_KEY } from './storage';

/** True for the two keys the app owns. A null key means the whole storage was cleared. */
export function isWatchedKey(key: string | null): boolean {
  return key === null || key === DRAFT_KEY || key === SETTINGS_KEY;
}

export interface OtherTabGuard {
  /** Another tab changed something. Saving here stops. */
  changed(): void;
  blocked(): boolean;
  /** The person chose to keep this tab's version. Saving works again, and listeners save now. */
  keep(): void;
  /** Runs after keep(). Returns a function that stops listening. */
  onKeep(listener: () => void): () => void;
}

export function createOtherTabGuard(): OtherTabGuard {
  let isBlocked = false;
  const listeners = new Set<() => void>();
  return {
    changed: () => {
      isBlocked = true;
    },
    blocked: () => isBlocked,
    keep() {
      isBlocked = false;
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch {
          // One failing save must not stop the others.
        }
      }
    },
    onKeep(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The same storage, except that saves do nothing (and report failure) while the guard is blocked. */
export function guardStorage(storage: DeviceStorage, guard: OtherTabGuard): DeviceStorage {
  return {
    ...storage,
    saveSettings: (settings) => !guard.blocked() && storage.saveSettings(settings),
    saveDraft: (text) => !guard.blocked() && storage.saveDraft(text),
    clearSettings: () => !guard.blocked() && storage.clearSettings(),
    clearDraft: () => !guard.blocked() && storage.clearDraft(),
  };
}

export const OTHER_TAB_MESSAGE =
  'This letter or the settings were changed in another tab. Reload to see the latest.';
