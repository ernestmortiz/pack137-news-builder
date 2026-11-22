import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../src/core/settings';
import {
  createOtherTabGuard,
  guardStorage,
  isWatchedKey,
  OTHER_TAB_MESSAGE,
} from '../../src/ui/other-tab';
import {
  createDeviceStorage,
  DRAFT_KEY,
  SETTINGS_KEY,
  type KeyValueStore,
} from '../../src/ui/storage';

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('other tab guard', () => {
  it('watches the two keys and a full clear, nothing else', () => {
    expect(isWatchedKey(DRAFT_KEY)).toBe(true);
    expect(isWatchedKey(SETTINGS_KEY)).toBe(true);
    expect(isWatchedKey(null)).toBe(true);
    expect(isWatchedKey('something-else')).toBe(false);
  });
  it('does not save over another tab until the person keeps their version', () => {
    const store = memory();
    const guard = createOtherTabGuard();
    const storage = guardStorage(
      createDeviceStorage(() => store),
      guard,
    );
    expect(storage.saveSettings(defaultSettings())).toBe(true);
    guard.changed();
    store.data.clear();
    expect(storage.saveSettings(defaultSettings())).toBe(false);
    expect(storage.saveDraft('{}')).toBe(false);
    expect(store.data.size).toBe(0);
    const onKeep = vi.fn();
    guard.onKeep(onKeep);
    guard.keep();
    expect(onKeep).toHaveBeenCalledOnce();
    expect(storage.saveDraft('{}')).toBe(true);
    expect(store.data.get(DRAFT_KEY)).toBe('{}');
  });
  it('has plain words', () => {
    expect(OTHER_TAB_MESSAGE).toBe(
      'This letter or the settings were changed in another tab. Reload to see the latest.',
    );
  });
});
