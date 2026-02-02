import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa'; // <--- Import the plugin

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
          '/api': { target: 'http://localhost:3001', changeOrigin: true },
          '/media': { target: 'http://localhost:3001', changeOrigin: true },
          '/thumbnails': { target: 'http://localhost:3001', changeOrigin: true },
          '/subtitles': { target: 'http://localhost:3001', changeOrigin: true }
        }
      },
      plugins: [
        react(),
        // --- PWA CONFIGURATION ---
        VitePWA({
          registerType: 'autoUpdate', // Automatically update the app when you deploy new code
          includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
          manifest: {
            name: 'Play21',
            short_name: 'Play21',
            description: 'Your Personal Streaming Library',
            theme_color: '#000000', // Matches your bg-black
            background_color: '#000000',
            display: 'standalone', // <--- This removes the browser URL bar on mobile!
            orientation: 'any',
            icons: [
              {
                src: 'pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png'
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable' // Looks good on Android round icons
              }
            ]
          },
          workbox: {
            // Don't try to cache your huge video files in the Service Worker!
            navigateFallbackDenylist: [/^\/api/, /^\/media/],
            runtimeCaching: [
              {
                // Cache thumbnails to make scrolling instant
                urlPattern: ({ url }) => url.pathname.startsWith('/thumbnails'),
                handler: 'CacheFirst',
                options: {
                  cacheName: 'thumbnail-cache',
                  expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 60 * 60 * 24 * 7 // 1 Week
                  }
                }
              }
            ]
          }
        })
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});