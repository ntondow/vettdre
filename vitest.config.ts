import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    // Pre-existing src/lib/**/*.test.ts files use a custom ad-hoc test runner
    // (not vitest's describe/it). Scope discovery to ./tests/ so those don't
    // confuse vitest. If we ever migrate them to vitest, drop the include.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
