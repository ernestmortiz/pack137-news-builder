/**
 * The one settings source for the whole app. Holds the validated result in memory. The converter,
 * the letter and the Settings screen all read from here, and the Settings screen is the only writer
 * (apart from opening a draft and the restore button, which also go through `set`).
 */
import {
  defaultSettings,
  validateSettings,
  type PackSettings,
  type SettingsProblem,
} from '../core/settings';
import type { FeedbackText } from './settings-logic';
import type { DeviceStorage } from './storage';

export interface SettingsStore {
  /** The current validated settings. Treat as read only. */
  get(): PackSettings;
  /** Validates `raw`, keeps the usable result, saves it to the device and tells listeners. Returns whether saving worked. */
  set(raw: unknown): { settings: PackSettings; saved: boolean };
  /** Listeners run after every set. Returns a function that stops listening. */
  subscribe(listener: (settings: PackSettings) => void): () => void;
  /** Problems found when the saved settings were read at start-up. Empty when all was well. */
  loadProblems(): SettingsProblem[];
  /** The feedback subject and body in the letter on screen, once the letter is open. */
  letterFeedback(): FeedbackText | undefined;
  setLetterFeedback(feedback: FeedbackText): void;
  /** Runs when the letter's feedback subject or body changes. */
  subscribeFeedback(listener: () => void): () => void;
}

export function createSettingsStore(storage: DeviceStorage): SettingsStore {
  const loaded = storage.loadSettings();
  let current: PackSettings = loaded?.settings ?? defaultSettings();
  const problems = loaded?.problems ?? [];
  let feedback: FeedbackText | undefined;
  const feedbackListeners = new Set<() => void>();
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
    loadProblems: () => [...problems],
    letterFeedback: () => feedback,
    setLetterFeedback(next) {
      if (feedback?.subject === next.subject && feedback.body === next.body) return;
      feedback = { subject: next.subject, body: next.body };
      for (const listener of [...feedbackListeners]) {
        try {
          listener();
        } catch {
          // A screen failing to redraw must not stop the others.
        }
      }
    },
    subscribeFeedback(listener) {
      feedbackListeners.add(listener);
      return () => feedbackListeners.delete(listener);
    },
  };
}
