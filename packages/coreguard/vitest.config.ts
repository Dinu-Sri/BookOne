import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Guard and flow suites share cluster-wide test roles; run the files one after another.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
