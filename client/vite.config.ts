/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server port and API proxy target are configurable through env vars so
// multiple checkouts (or CI) can run on non-default ports without editing
// this file. Defaults match the values documented in the README.
const devPort = process.env.VITE_PORT ? Number(process.env.VITE_PORT) : 5173;
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:4000';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // GitHub Pages serves the built site from https://taan1el.github.io/authmesh/,
  // so asset and router paths need that subpath. Local dev and the Docker
  // image serve from the root, so the default stays "/".
  base: mode === 'pages' ? '/authmesh/' : '/',
  server: {
    port: devPort,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}));
