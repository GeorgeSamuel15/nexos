import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.{ts,tsx}', 'apps/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', '**/dist/**', '**/node_modules/**'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['**/*.d.ts', '**/dist/**'],
    },
  },
});
