import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: { provider: 'v8' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Server-only markers Next resolves at build time but Vitest cannot.
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
      'next/headers': path.resolve(__dirname, './src/test/next-headers-stub.ts'),
      'next/navigation': path.resolve(__dirname, './src/test/next-navigation-stub.ts'),
    },
  },
});
