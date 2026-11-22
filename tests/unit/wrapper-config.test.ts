/**
 * Guards the desktop and Android wrappers' no-bridge design (ADR 0006). Tauri loads every file in
 * src-tauri/capabilities automatically, and a plugin or a CSP string in the config would loosen
 * what the page can reach. Any of those changes must be a deliberate decision, so it fails here
 * first. Runs in the main CI on every push, with no Rust toolchain needed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

interface TauriWindow {
  label?: string;
  create?: boolean;
  dragDropEnabled?: boolean;
  devtools?: boolean;
}
interface TauriConfig {
  version?: string;
  identifier?: string;
  plugins?: Record<string, unknown>;
  app?: {
    withGlobalTauri?: boolean;
    windows?: TauriWindow[];
    security?: { csp?: unknown; devCsp?: unknown; capabilities?: unknown[] };
  };
  bundle?: { createUpdaterArtifacts?: unknown; targets?: unknown; macOS?: unknown };
}

const config = JSON.parse(read('src-tauri/tauri.conf.json')) as TauriConfig;

describe('desktop wrapper configuration', () => {
  it('grants the page no capabilities and no plugins', () => {
    expect(existsSync(join(root, 'src-tauri', 'capabilities'))).toBe(false);
    expect(config.app?.security?.capabilities ?? []).toEqual([]);
    expect(config.plugins ?? {}).toEqual({});
    expect(config.app?.withGlobalTauri).toBe(false);
  });

  it('leaves the web build CSP in force (Tauri must not rewrite it)', () => {
    expect(config.app?.security?.csp).toBeNull();
    expect(config.app?.security?.devCsp ?? null).toBeNull();
    expect(read('vite.config.ts')).toContain(`"connect-src 'none'"`);
  });

  it('depends on tauri alone, without the devtools feature', () => {
    const cargo = read('src-tauri/Cargo.toml');
    const deps = cargo.split('[dependencies]')[1]?.split(/^\[/m)[0] ?? '';
    const names = deps
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
      .map((line) => line.split(/\s*=/)[0]);
    expect(names).toEqual(['tauri']);
    const tauriLine = deps.split('\n').find((line) => line.trim().startsWith('tauri')) ?? '';
    expect(tauriLine).toContain('features = []');
  });

  it('adds no Tauri JavaScript package to the app', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    const tauriDev = Object.keys(pkg.devDependencies ?? {}).filter((n) =>
      n.startsWith('@tauri-apps/'),
    );
    expect(tauriDev).toEqual(['@tauri-apps/cli']);
  });

  it('builds its one window in Rust, with drag and drop left to the page', () => {
    const windows = config.app?.windows ?? [];
    expect(windows).toHaveLength(1);
    expect(windows[0]?.create).toBe(false);
    expect(windows[0]?.dragDropEnabled).toBe(false);
    expect(windows[0]?.devtools ?? false).toBe(false);
  });

  it('takes its version from package.json and has no updater', () => {
    expect(config.version).toBe('../package.json');
    expect(config.bundle?.createUpdaterArtifacts ?? false).toBe(false);
  });

  it('builds the Windows installer only (Mac volunteers use the web build, ADR 0006)', () => {
    expect(config.bundle?.targets).toEqual(['nsis']);
    expect(config.bundle?.macOS).toBeUndefined();
  });
});

describe('Android wrapper project (src-tauri/gen/android)', () => {
  const manifest = read('src-tauri/gen/android/app/src/main/AndroidManifest.xml');
  const gradle = read('src-tauri/gen/android/app/build.gradle.kts');

  it('asks Android for no permission, so it cannot use the network or storage', () => {
    expect(manifest).not.toMatch(/<uses-permission/);
    expect(manifest).not.toContain('INTERNET');
  });

  it('allows no clear-text traffic and no cloud backup of the saved work, in any build type', () => {
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(manifest).toContain('android:allowBackup="false"');
    expect(gradle).not.toContain('usesCleartextTraffic');
  });

  it('supports Android 10 and later (spec 13 assumption)', () => {
    expect(gradle).toMatch(/minSdk = 29\b/);
  });

  it('keeps every signing detail out of the repository', () => {
    expect(gradle).not.toMatch(/signingConfigs|storeFile|storePassword|keyPassword|keyAlias/);
    const ignore = read('src-tauri/gen/android/.gitignore');
    expect(ignore).toContain('key.properties');
    expect(ignore).toContain('keystore.properties');
  });
});

describe('Android saving (ADR 0006): one message channel, Downloads only', () => {
  const kotlinDir = 'src-tauri/gen/android/app/src/main/java/org/pack137/newsbuilder';
  const activity = read(`${kotlinDir}/MainActivity.kt`);
  const saver = read(`${kotlinDir}/DownloadSaver.kt`);
  const rules = read(`${kotlinDir}/SaveRules.kt`);
  const script = read('src-tauri/src/android-save.js');
  const lib = read('src-tauri/src/lib.rs');

  it('registers the one message object for the app origin only, and only when supported', () => {
    const calls = activity.match(/addWebMessageListener\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(activity).toContain('"pack137Save"');
    expect(activity).toContain('setOf("http://tauri.localhost")');
    expect(activity).not.toContain('"*"');
    expect(activity).toContain('WebViewFeature.WEB_MESSAGE_LISTENER');
    expect(activity).not.toContain('addJavascriptInterface');
  });

  it('turns WebView debugging on in debug builds only', () => {
    expect(activity).toContain(
      'if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)',
    );
    expect(activity.match(/setWebContentsDebuggingEnabled/g) ?? []).toHaveLength(1);
  });

  it('checks the origin and the main frame, and writes only into Downloads with MediaStore', () => {
    expect(saver).toContain('!isMainFrame');
    expect(saver).toContain('SaveRules.isAppOrigin(');
    expect(saver).toContain('MediaStore.Downloads');
    expect(saver).toContain('Environment.DIRECTORY_DOWNLOADS');
    // Nothing that could write anywhere else.
    for (const other of [
      'java.io.File',
      'FileOutputStream',
      'getExternalStorage',
      'getExternalFilesDir',
      'openFileOutput',
      'DIRECTORY_DOCUMENTS',
      'DIRECTORY_PICTURES',
      'Intent',
    ]) {
      expect(saver, other).not.toContain(other);
    }
  });

  it('keeps the file type list, name length and size cap the Windows wrapper uses', () => {
    expect(rules).toContain('setOf("json", "jpg", "jpeg")');
    expect(rules).toContain('count < 120');
    expect(rules).toContain('const val MAX_BYTES = 8 * 1024 * 1024');
    expect(script).toContain('var MAX_BYTES = 8 * 1024 * 1024;');
    expect(lib).toContain('["json", "jpg", "jpeg"]');
  });

  it('has a script that reads the Blob without the network and adds no global but the channel', () => {
    expect(script).toContain("'use strict'");
    expect(script).toContain('readAsDataURL');
    expect(script).not.toMatch(/\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|eval\(|Function\(/);
    expect(script).toContain('window.pack137Save');
    expect(script.match(/window\.\w+\s*=/g) ?? []).toEqual([]);
  });

  it('adds the script from Rust on Android only', () => {
    expect(lib).toContain('#[cfg(target_os = "android")]\nconst ANDROID_SAVE_SCRIPT');
    expect(lib).toContain(
      '#[cfg(target_os = "android")]\n            let builder = builder.initialization_script(ANDROID_SAVE_SCRIPT);',
    );
    expect(lib.match(/initialization_script/g) ?? []).toHaveLength(1);
  });

  it('uses no em dash', () => {
    for (const text of [activity, saver, rules, script])
      expect(text).not.toContain(String.fromCharCode(0x2014));
  });
});
