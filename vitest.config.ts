import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration
 * Server tests share one Postgres test database, so files run one at a time
 */
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['server/test/setupEnv.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
