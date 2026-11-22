import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

/**
 * Makes the built index.html work when opened straight from disk (file://), so the web build can
 * be unzipped and double-clicked before a host is chosen (spec 13). Browsers refuse module
 * scripts and crossorigin assets from file://, so the bundle is a classic deferred script.
 */
/**
 * The built app's Content Security Policy: stricter than the dev page's, which must allow the dev
 * server's live reload. Nothing is fetched at runtime, so connect-src is 'none'; the only script
 * is the bundle; styles are injected by the bundle at runtime, hence 'unsafe-inline' for styles.
 */
const BUILD_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "frame-src 'self' about:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function openFromDisk(): Plugin {
  return {
    name: 'open-from-disk',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html
          .replace(/content="default-src 'self';[^"]*"/, `content="${BUILD_CSP}"`)
          .replace(/<script type="module" crossorigin src=/g, '<script defer src=')
          .replace(/<link rel="stylesheet" crossorigin href=/g, '<link rel="stylesheet" href='),
    },
  };
}

// base './' keeps every asset path relative, so dist/ can be dropped on any host or subfolder.
export default defineConfig({
  base: './',
  plugins: [openFromDisk()],
  build: {
    modulePreload: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts'],
    // The stress tests parse very large pastes, and happy-dom keeps each parsed document in
    // memory, so one test file can reach about 3.3 GB. Give each worker room, and on CI (4 cores,
    // 16 GB) run two files at a time so the workers cannot exhaust the machine.
    execArgv: ['--max-old-space-size=6144'],
    maxWorkers: process.env.CI ? 2 : undefined,
    // Timing tests carry their own limits (tests/unit/budget.ts, 3 times wider on CI); the
    // default 5 s test timeout must not cut them off first.
    testTimeout: process.env.CI ? 30_000 : 5_000,
  },
});
