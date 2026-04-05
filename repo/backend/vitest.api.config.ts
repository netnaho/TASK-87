import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [path.resolve(__dirname, '../API_tests/**/*.test.ts')],
    testTimeout: 30000,
    hookTimeout: 30000,
    // API tests run against a live Docker stack where real secrets are injected
    // via docker-compose. This flag is a safety net for test-harness imports
    // that transitively load the config module before the real secrets are
    // available in the test-runner process.
    env: { ALLOW_INSECURE_DEV_SECRETS: 'true' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
