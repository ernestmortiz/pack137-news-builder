/**
 * The one settings source for the whole app. Holds the validated result in memory. The converter,
 * the letter and the Settings screen all read from here, and the Settings screen is the only writer
 * (apart from opening a draft and the restore button, which also go through `set`).
 */
import { defaultSettings, validateSettings, type PackSettings } from '../core/settings';
import type { DeviceStorage } from './storage';

export interface SettingsStore {
  /** The current validated settings. Treat as read only. */
  get(): PackSettings;
  /** Validates `raw`, keeps the usable result, saves it to the device and tells listeners. Returns whether saving worked. */
  set(raw: unknown): { settings: PackSettings; saved: boolean };
  /** Listeners run after every set. Returns a function that stops listening. */
  subscribe(listener: (settings: PackSettings) => void): () => void;
}

export function createSettingsStore(storage: DeviceStorage): SettingsStore {
  let current: PackSettings = storage.loadSettings()?.settings ?? defaultSettings();
  const listeners = new Set<(settings: PackSettings) => void>();
  return {
    get: () => current,
    set(raw) {
      current = validateSettings(raw).settings;
      const saved = storage.saveSettings(current);
      for (const listener of [...listeners]) {
        try {
          listener(current);
        } catch {
          // One screen failing to redraw must not stop the others.
        }
      }
      return { settings: current, saved };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
