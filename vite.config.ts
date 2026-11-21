import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

// base './' keeps every asset path relative, so dist/ can be dropped on any host or subfolder.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: { environment: 'happy-dom', include: ['tests/unit/**/*.test.ts'] },
});
