/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pre-bundle lucide-react with React up front; discovering it mid-session
  // can load it against a second copy of React ("Invalid hook call").
  optimizeDeps: { include: ['lucide-react'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
