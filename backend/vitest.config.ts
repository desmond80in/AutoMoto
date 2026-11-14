import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['lambdas/**/*.test.ts', 'scripts/**/*.test.ts'], environment: 'node' },
});
