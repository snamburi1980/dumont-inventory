import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  css: { postcss: {} },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Dumont Inventory',
        short_name: 'Dumont',
        description: 'Inventory management for Dumont Creamery stores',
        theme_color: '#2C1810',
        background_color: '#FDF6EC',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/dumont-inventory/',
        start_url: '/dumont-inventory/',
        icons: [
          {
            src: '/dumont-inventory/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/dumont-inventory/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: '/dumont-inventory/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
          }
        ]
      }
    })
  ],
  base: '/dumont-inventory/',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
})