import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { IncomingMessage, ServerResponse } from 'http';

export default defineConfig(({ mode }) => {
  // Load ALL .env vars (not just VITE_-prefixed) so server-only keys are accessible here
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'Notes App',
          short_name: 'Notes',
          description: 'GoodNotes-style Apple Pencil web notebook',
          theme_color: '#4F46E5',
          background_color: '#f8f9fa',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
            },
          ],
        },
      }),
      // Local dev stub for Vercel API routes (production uses the real api/ functions)
      {
        name: 'local-api',
        configureServer(server) {
          server.middlewares.use(
            '/api/deepgram-token',
            (_req: IncomingMessage, res: ServerResponse) => {
              const token = env.DEEPGRAM_API_KEY;
              if (!token) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'DEEPGRAM_API_KEY not set in .env' }));
                return;
              }
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-store');
              res.end(JSON.stringify({ token }));
            }
          );
        },
      },
    ],
  };
});
