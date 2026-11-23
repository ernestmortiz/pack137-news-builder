import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The sandbox has its own Chromium. CI installs one with `npx playwright install chromium`.
const localChromium = '/opt/pw-browsers/chromium';
const executablePath = existsSync(localChromium) ? localChromium : undefined;

// PAGES_HEADERS=1 (npm run e2e:pages) serves the build with the hosted site's headers instead of
// vite preview, so the whole suite also proves those headers leave the app working.
const pagesHeaders = process.env.PAGES_HEADERS === '1';

// Pasting now lands on "Edit on the card". Every spec except tests/e2e/card-view.spec.ts was written
// for the form, so each browser starts with "Edit in the form" remembered (the stored choice the
// switch itself writes). card-view.spec.ts starts from an empty device to test the real default.
const formViewDevice = {
  cookies: [],
  origins: [
    {
      origin: 'http://localhost:4173',
      localStorage: [{ name: 'pack137:edit-view', value: 'form' }],
    },
  ],
};

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    storageState: formViewDevice,
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: pagesHeaders
      ? 'npm run build && node scripts/serve-pages.mjs 4173'
      : 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
