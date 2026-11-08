import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The data layer is picked at build time: only the chosen file enters the
  // module graph, so a self-hosted bundle contains no supabase-js.
  const backend = loadEnv(mode, process.cwd(), 'VITE_').VITE_BACKEND || 'supabase'
  if (backend !== 'supabase' && backend !== 'selfhosted') {
    throw new Error(`VITE_BACKEND must be "supabase" or "selfhosted", got "${backend}"`)
  }

  return {
    resolve: {
      alias: { '@backend': fileURLToPath(new URL(`./src/lib/backend/${backend}.ts`, import.meta.url)) },
    },
    // Dev server only: lets `vite --mode selfhosted` reach the API on :3000.
    server: { proxy: { '/api': 'http://localhost:3000' } },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'reflow',
          short_name: 'reflow',
          description: 'your day doesn\'t fall apart — it reflows.',
          theme_color: '#171335',
          background_color: '#FAF9FB',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Precache the built app shell only — this app is realtime-sync-dependent,
          // so task data is deliberately NOT cached for offline use. Opening the app
          // offline shows the shell; data operations still require a connection.
          globPatterns: ['**/*.{js,css,html,svg}'],
          // keep /api/* (e.g. opening /api/health in the browser) out of the SPA fallback
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
  }
})
