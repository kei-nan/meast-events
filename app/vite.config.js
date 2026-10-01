import { readFileSync } from 'node:fs'
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    shareMaplibreChunk(),
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
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  build: {
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
