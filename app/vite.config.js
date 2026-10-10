import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { FontaineTransform } from 'fontaine'
import { defineConfig } from 'vite'

// maplibre-gl's worker script (see src/components/MapView.jsx) does a
// plain, non-hashed relative import of its shared chunk
// (`./maplibre-gl-shared.mjs`) at runtime. If Vite fingerprints that file's
// build output name (its default behavior for emitted assets), the
// worker's hardcoded import breaks in production and the map silently
// fails to render (the failure happens inside the Worker, so it doesn't
// surface as a page-level error - see MapView.jsx for the full story).
// Keep both files' original names so the worker's relative import still
// resolves once bundled. They go in a folder named after the MapLibre
// version, so the folder name is their cache key (public/_headers).
const UNHASHED_ASSET_NAMES = new Set(['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'])
const MAPLIBRE_VERSION = JSON.parse(
  readFileSync(new URL('./node_modules/maplibre-gl/package.json', import.meta.url), 'utf8')
).version
const MAPLIBRE_DIR = `assets/maplibre-gl-${MAPLIBRE_VERSION}`

// maplibre-gl.mjs (the main-thread entry) also imports ./maplibre-gl-shared.mjs.
// Left alone, Vite inlines that 513 kB module into the app bundle while the
// worker downloads the same file again from MAPLIBRE_DIR. In the build, the
// main thread imports the worker's copy instead, so it is downloaded once.
function shareMaplibreChunk() {
  let base = '/'
  return {
    name: 'share-maplibre-chunk',
    apply: 'build',
    enforce: 'pre',
    configResolved(config) {
      base = config.base
    },
    resolveId(source, importer) {
      if (source === './maplibre-gl-shared.mjs' && /maplibre-gl[\\/]dist[\\/]maplibre-gl\.mjs$/.test(importer ?? '')) {
        return { id: `${base}${MAPLIBRE_DIR}/maplibre-gl-shared.mjs`, external: true }
      }
      return null
    },
  }
}

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
    shareMaplibreChunk(),
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
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const names = assetInfo.names ?? (assetInfo.name ? [assetInfo.name] : [])
          if (names.some((name) => UNHASHED_ASSET_NAMES.has(name))) {
            return `${MAPLIBRE_DIR}/[name][extname]`
          }
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
