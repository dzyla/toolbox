import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify('test') },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    environment: 'happy-dom',
    include: ['tests/app/**/*.test.{ts,tsx}', 'tests/core/**/*.test.ts', 'tests/lib/**/*.test.{ts,tsx}', 'tests/build/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // CI runners (and coverage runs) are slower than a laptop; heavy UI and fitting tests need headroom.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      // Scientific core only: this is where a silent regression changes a reported number.
      include: ['src/core/**/*.ts'],
      reporter: ['text-summary', 'json-summary'],
      // Floors set just under the 2026-09-30 baseline (lines 92.8, statements 90.5, functions 95.9, branches 77.6).
      // Raise them as coverage improves; never lower them to make a change pass.
      thresholds: { lines: 91, statements: 89, functions: 94, branches: 76 }
    }
  }
});
