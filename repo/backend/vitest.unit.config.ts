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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Express boilerplate — tested via API tests, not unit tests
        'src/**/*.routes.ts',
        'src/**/*.controller.ts',
        'src/**/*.schema.ts',
        // Infrastructure singletons: no testable logic, just instantiation
        'src/lib/prisma.ts',
        'src/lib/logger.ts',
        'src/lib/scheduler.ts',
        // App entrypoint — integration bootstrapping only
        'src/index.ts',
        // Express middleware that wraps third-party libs (multer, pino-http, express-rate-limit)
        // — behavior is verified end-to-end by API tests, not unit tests
        'src/middleware/upload.ts',
        'src/middleware/rateLimiter.ts',
        'src/middleware/requestLogger.ts',
        'src/middleware/errorHandler.ts',
        // Reports processor — orchestrates DB + scheduler; covered by API tests
        'src/modules/reports/reports.processor.ts',
      ],
      reporter: ['text', 'json'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Redirect @prisma/client to a thin stub so unit tests never attempt to
      // load the native query-engine binary.  This prevents the
      // PrismaClientInitializationError / libssl unhandled rejection that
      // appears when the container's OpenSSL version differs from the one the
      // binary was compiled against.  All unit tests that need the prisma
      // singleton mock '@/lib/prisma' directly.
      '@prisma/client': path.resolve(__dirname, '../unit_tests/__mocks__/prisma-client.ts'),
    },
  },
});
