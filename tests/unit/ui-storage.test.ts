import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/core/settings';
import { createSettingsStore } from '../../src/ui/app-settings';
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
const throwing: KeyValueStore = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('quota');
  },
  removeItem() {
    throw new Error('blocked');
  },
};

describe('device storage', () => {
  it('uses only the two namespaced keys', () => {
    expect(SETTINGS_KEY).toBe('pack137:settings');
    expect(DRAFT_KEY).toBe('pack137:letter-draft');
    const mem = memory();
    const storage = createDeviceStorage(() => mem);
    expect(storage.saveSettings(defaultSettings())).toBe(true);
    expect(storage.saveDraft('{}')).toBe(true);
    expect([...mem.data.keys()].sort()).toEqual([DRAFT_KEY, SETTINGS_KEY]);
    expect(JSON.parse(mem.data.get(SETTINGS_KEY) ?? '')).toEqual(defaultSettings());
  });

  it('never throws when storage throws', () => {
    const storage = createDeviceStorage(() => throwing);
    expect(storage.loadSettings()).toBeUndefined();
    expect(storage.loadDraft()).toBeUndefined();
    expect(storage.saveSettings(defaultSettings())).toBe(false);
    expect(storage.saveDraft('x')).toBe(false);
    expect(storage.clearSettings()).toBe(false);
    expect(storage.clearDraft()).toBe(false);
  });

  it('never throws when the browser will not hand over storage', () => {
    const none = createDeviceStorage(() => {
      throw new Error('SecurityError');
    });
    expect(none.saveDraft('x')).toBe(false);
    expect(none.loadSettings()).toBeUndefined();
    const missing = createDeviceStorage(() => undefined);
    expect(missing.saveDraft('x')).toBe(false);
    expect(missing.loadDraft()).toBeUndefined();
  });

  it('treats stored text that is not JSON as nothing saved', () => {
    const mem = memory();
    mem.data.set(SETTINGS_KEY, '{not json');
    const storage = createDeviceStorage(() => mem);
    expect(storage.loadSettings()).toBeUndefined();
  });

  it('reads settings back through validation and drafts through readDraft', () => {
    const mem = memory();
    mem.data.set(SETTINGS_KEY, JSON.stringify({ programYearStartMonth: 99 }));
    mem.data.set(DRAFT_KEY, 'not a draft');
    const storage = createDeviceStorage(() => mem);
    const settings = storage.loadSettings();
    expect(settings?.settings.programYearStartMonth).toBeGreaterThanOrEqual(1);
    expect(settings?.settings.programYearStartMonth).toBeLessThanOrEqual(12);
    const draft = storage.loadDraft();
    expect(draft?.ok).toBe(false);
  });
});

describe('settings store', () => {
  it('starts from defaults when storage is blocked and still works', () => {
    const store = createSettingsStore(createDeviceStorage(() => throwing));
    expect(store.get()).toEqual(defaultSettings());
    const seen: number[] = [];
    store.subscribe((s) => seen.push(s.programYearStartMonth));
    const result = store.set({ ...defaultSettings(), programYearStartMonth: 3 });
    expect(result.saved).toBe(false);
    expect(seen.length).toBe(1);
  });

  it('keeps a listener failure from stopping the others', () => {
    const store = createSettingsStore(createDeviceStorage(() => memory()));
    let ran = false;
    store.subscribe(() => {
      throw new Error('boom');
    });
    store.subscribe(() => (ran = true));
    expect(store.set(defaultSettings()).saved).toBe(true);
    expect(ran).toBe(true);
  });
});
