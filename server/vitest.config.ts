import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    // Every file resets the same Postgres database, so files must not run in parallel.
    fileParallelism: false,
  },
});
