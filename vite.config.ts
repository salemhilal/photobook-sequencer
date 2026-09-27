/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig(({ mode }) => {
  // `--mode app` builds for the native Mac app (see src-tauri), which has no service worker.
  const app = mode === 'app';
  return {
    plugins: [
      react(),
      // Works offline: a service worker (production builds only) caches the whole app,
      // including lazily loaded chunks like the PDF library. Updates wait for the user
      // to reload (see src/update.ts), so a new version never interrupts work.
      VitePWA({
        // The Mac app has no service worker (its code is never started there; see main.tsx).
        disable: app,
        registerType: 'prompt',
        injectRegister: false,
        // The glob below already caches the icons.
        includeManifestIcons: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff,woff2}'],
          // Don't cache old builds' leftovers.
          cleanupOutdatedCaches: true,
          // The first install takes control of open pages right away, so they work
          // offline without a second load. Updates still wait (see src/update.ts).
          clientsClaim: true,
        },
        manifest: {
          name: 'Photobook Sequencer',
          short_name: 'Sequencer',
          description: 'A tool for prototyping photo sequences',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#151514',
          theme_color: '#151514',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    // Where the website and the Mac app differ (see src/platform/types.ts): each build
    // gets its own implementation, so the app's code is never part of the website.
    resolve: {
      alias: {
        '#platform': fileURLToPath(
          new URL(app ? './src/platform/macos/index.ts' : './src/platform/browser.ts', import.meta.url),
        ),
      },
    },
    // Pre-bundle lucide-react with React up front; discovering it mid-session
    // can load it against a second copy of React ("Invalid hook call").
    optimizeDeps: { include: ['lucide-react'] },
    // Inlined at build time; see src/env.d.ts.
    define: {
      __APP_VERSION__: JSON.stringify(version),
      // The Mac app's end-to-end test build (npm run test:app).
      __E2E__: JSON.stringify(process.env.PBS_E2E_BUILD === '1'),
    },
    // Tauri's dev server output reads better without Vite clearing the terminal.
    clearScreen: false,
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
