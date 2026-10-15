/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH lets the same build work at a domain root or a GitHub Pages
// repository subpath such as /weighing-machine-aplication-/.
const rawBase = process.env.BASE_PATH ?? '/';
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'తెలుగు పఠనం',
        short_name: 'తెలుగు పఠనం',
        description: 'తెలుగు Word, EPUB, టెక్స్ట్ పుస్తకాలను వినండి (Telugu Reader)',
        lang: 'te',
        dir: 'ltr',
        start_url: base,
        scope: base,
        id: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#fbf7f0',
        theme_color: '#7a3e12',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
