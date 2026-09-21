import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  // Vite's dev server does not auto-resolve tsconfig `paths` (only the Rolldown
  // build does), so the `@/` alias used throughout src/ must be declared here for
  // `vite dev` / `vite preview` to resolve it — mirroring vitest.config.ts.
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname }
  },
  plugins: [
    preact(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'Bio-Bench',
        short_name: 'Bio-Bench',
        description: 'Free, offline lab calculators, sequence tools and gel analysis.',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'Gel / Blot', url: '#/t/gel', description: 'Annotate lanes, ladders and bands' },
          { name: 'Molarity & Dilution', url: '#/t/molarity', description: 'Mass, moles, C1V1' },
          { name: 'Protein Workbench', url: '#/t/protein', description: 'MW, pI, extinction, digests' },
          { name: 'Buffer Recipes', url: '#/t/buffers', description: 'Recipes from stocks and solids' },
          { name: 'Plate Layout', url: '#/t/plate', description: '6–384 well layouts' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // The frozen /legacy/ pages are served from disk (copied by deploy), not from the precache —
        // the SPA fallback must not swallow their navigation requests.
        navigateFallbackDenylist: [/^\/legacy\//]
      }
    })
  ],
  build: { target: 'es2022', sourcemap: true }
});
