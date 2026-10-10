import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { FontaineTransform } from 'fontaine'
import { defineConfig } from 'vite'

// The event list (data/events/v.<DATA_VERSION>/all.json, scripts/split-data.mjs)
// is the largest file on the critical path and grows with the dataset. The app
// only requests it once its JavaScript has downloaded and run; a preload in
// index.html starts it in parallel with the JavaScript instead. crossorigin
// makes the preload's credentials mode match fetch()'s same-origin default, so
// the app's fetch reuses the preloaded response instead of downloading it again.
function preloadEventList() {
  let base = '/'
  return {
    name: 'preload-event-list',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml() {
      const source = readFileSync(new URL('./src/lib/dataVersion.js', import.meta.url), 'utf8')
      const version = source.match(/DATA_VERSION = "([0-9a-f]{12})"/)?.[1]
      if (!version) throw new Error('preload-event-list: no DATA_VERSION in src/lib/dataVersion.js (run scripts/split-data.mjs)')
      return [
        {
          tag: 'link',
          attrs: { rel: 'preload', href: `${base}data/events/v.${version}/all.json`, as: 'fetch', crossorigin: 'anonymous' },
          injectTo: 'head',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    preloadEventList(),
    // Generates "<family> fallback" @font-faces: local system fonts with
    // size/ascent/descent overrides measured from the self-hosted web fonts
    // (src/main.jsx), named in --font-sans/--font-serif (src/index.css). One
    // fallback each: same-named faces with equal descriptors do not chain, the
    // last one wins (and fontaine writes one per subset; the Latin one is last).
    FontaineTransform.vite({
      fallbacks: {
        'Inter Variable': ['Arial'],
        Spectral: ['Georgia'],
      },
    }),
  ],
  resolve: {
    alias: {
      // Subset web fonts and their @font-face stylesheet, written by
      // scripts/subset-fonts.mjs (prebuild/predev) and imported by src/main.jsx.
      '@subset-fonts': fileURLToPath(new URL('./node_modules/.cache/subset-fonts', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  build: {
    // Never inline a font as a data: URL. Subsetting (scripts/subset-fonts.mjs) makes
    // some faces smaller than Vite's 4 KB default limit, and an inlined face is
    // downloaded with the main stylesheet on every first visit even when no character
    // on the page needs it; as a file it is fetched only if its unicode-range is used.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
})
