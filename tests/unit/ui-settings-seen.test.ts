import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/core/settings';
import { createSettingsStore } from '../../src/ui/app-settings';
import {
  differingSettingNames,
  settingsChangedOutside,
  settingsFingerprint,
} from '../../src/ui/settings-logic';
import { createDeviceStorage, SETTINGS_KEY, SETTINGS_SEEN_KEY } from '../../src/ui/storage';

const changed = () => ({ ...defaultSettings(), photoFormUrl: 'https://example.org/p' });

describe('settings fingerprint and the outside-change decision', () => {
  it('is stable and changes with the settings', () => {
    expect(settingsFingerprint(defaultSettings())).toBe(settingsFingerprint(defaultSettings()));
    expect(settingsFingerprint(changed())).not.toBe(settingsFingerprint(defaultSettings()));
    expect(settingsFingerprint(defaultSettings())).toMatch(/^[0-9a-f]{8}$/);
  });
  it('names only what differs', () => {
    expect(differingSettingNames(defaultSettings())).toEqual([]);
    expect(differingSettingNames(changed())).toEqual(['Photo form address']);
  });
  it('warns only for non-default settings that were never seen', () => {
    expect(settingsChangedOutside(defaultSettings(), undefined)).toBe(false);
    expect(settingsChangedOutside(changed(), undefined)).toBe(true);
    expect(settingsChangedOutside(changed(), 'deadbeef')).toBe(true);
    expect(settingsChangedOutside(changed(), settingsFingerprint(changed()))).toBe(false);
  });
  it('the store flags unseen settings and markSeen records them', () => {
    const mem = new Map<string, string>([[SETTINGS_KEY, JSON.stringify(changed())]]);
    const kv = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    const first = createSettingsStore(createDeviceStorage(() => kv));
    expect(first.changedOutside()).toBe(true);
    expect(mem.has(SETTINGS_SEEN_KEY)).toBe(false);
    first.markSeen();
    expect(createSettingsStore(createDeviceStorage(() => kv)).changedOutside()).toBe(false);
  });
});
