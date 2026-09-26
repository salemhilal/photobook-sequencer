/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Inlined at build time; see src/env.d.ts.
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Pre-bundle lucide-react with React up front; discovering it mid-session
  // can load it against a second copy of React ("Invalid hook call").
  optimizeDeps: { include: ['lucide-react'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
