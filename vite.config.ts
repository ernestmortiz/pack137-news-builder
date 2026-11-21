import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

// base './' keeps every asset path relative, so dist/ can be dropped on any host or subfolder.
export default defineConfig({
  base: './',
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
