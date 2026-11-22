/**
 * Device storage (build spec 8.3 and 9). Only three keys are ever used, both namespaced. Every read and
 * write is wrapped, because private windows and blocked storage throw. Values are JSON text and
 * always go back through validateSettings or readDraft when read, so stored text is never trusted.
 */
import { readDraft, type DraftReadResult } from '../core/draft';
import { validateSettings, type PackSettings, type SettingsResult } from '../core/settings';

export const SETTINGS_KEY = 'pack137:settings';
export const SETTINGS_SEEN_KEY = 'pack137:settings-seen';
export const DRAFT_KEY = 'pack137:letter-draft';

/** The part of Storage that is used. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DeviceStorage {
  /** Saved settings, validated, or undefined when nothing usable is saved or storage is blocked. */
  loadSettings(): SettingsResult | undefined;
  /** True when the write worked. */
  saveSettings(settings: PackSettings): boolean;
  clearSettings(): boolean;
  /** The fingerprint of the settings this device last saw, or undefined. */
  loadSettingsSeen(): string | undefined;
  saveSettingsSeen(fingerprint: string): boolean;
  /** The saved draft, read through readDraft, or undefined when there is none or storage is blocked. */
  loadDraft(): DraftReadResult | undefined;
  /** `text` is the output of writeDraft. True when the write worked. */
  saveDraft(text: string): boolean;
  clearDraft(): boolean;
}

/** `window.localStorage`, or undefined when the browser refuses even to hand it over. */
export function browserStore(): KeyValueStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function createDeviceStorage(
  getStore: () => KeyValueStore | undefined = browserStore,
): DeviceStorage {
  const read = (key: string): string | undefined => {
    try {
      const value = getStore()?.getItem(key);
      return typeof value === 'string' ? value : undefined;
    } catch {
      return undefined;
    }
  };
  const write = (key: string, value: string): boolean => {
    try {
      const store = getStore();
      if (!store) return false;
      store.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  const remove = (key: string): boolean => {
    try {
      const store = getStore();
      if (!store) return false;
      store.removeItem(key);
      return true;
    } catch {
      return false;
    }
  };
  return {
    loadSettings() {
      const text = read(SETTINGS_KEY);
      if (text === undefined) return undefined;
      try {
        return validateSettings(JSON.parse(text) as unknown);
      } catch {
        return undefined;
      }
    },
    saveSettings(settings) {
      try {
        return write(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        return false;
      }
    },
    clearSettings: () => remove(SETTINGS_KEY),
    loadSettingsSeen: () => read(SETTINGS_SEEN_KEY),
    saveSettingsSeen: (fingerprint) => write(SETTINGS_SEEN_KEY, fingerprint),
    loadDraft() {
      const text = read(DRAFT_KEY);
      if (text === undefined) return undefined;
      try {
        return readDraft(text);
      } catch {
        return undefined;
      }
    },
    saveDraft: (text) => write(DRAFT_KEY, text),
    clearDraft: () => remove(DRAFT_KEY),
  };
}
