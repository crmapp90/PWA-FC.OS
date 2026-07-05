import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              // Cache-first untuk aset statis
              urlPattern: /\.(?:js|css|woff2|svg|png)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'fcos-assets-v2',
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // Network-first untuk navigasi HTML
              urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'fcos-navigation',
                networkTimeoutSeconds: 5,
              },
            },
            {
              // Bypass Supabase — jangan pernah dicache
              urlPattern: /supabase\.co/i,
              handler: 'NetworkOnly',
            },
          ],
          // Pastikan app shell selalu fresh
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
        },
        manifest: {
          name: 'FC.OS — Field Collection Operating System',
          short_name: 'FC.OS',
          description: 'Sistem operasi kerja harian field collector — offline-first',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#1B4332',
          theme_color: '#1B4332',
          orientation: 'portrait-primary',
          icons: [
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          ],
        },
        devOptions: {
          enabled: false, // disable SW in dev to avoid caching issues during development
        },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
