import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify('test') },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    environment: 'happy-dom',
    include: ['tests/app/**/*.test.{ts,tsx}', 'tests/core/**/*.test.ts', 'tests/lib/**/*.test.ts'],
    setupFiles: ['tests/setup.ts']
  }
});
