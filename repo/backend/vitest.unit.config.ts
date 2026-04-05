import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [path.resolve(__dirname, '../unit_tests/**/*.test.ts')],
    testTimeout: 10000,
    // Allow insecure dev-only secret fallbacks in the unit-test environment.
    // Individual config tests override specific env vars and call vi.resetModules()
    // to exercise the strict-failure branches in isolation.
    env: { ALLOW_INSECURE_DEV_SECRETS: 'true' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
