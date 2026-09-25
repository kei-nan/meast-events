import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// maplibre-gl's worker script (see src/components/MapView.jsx) does a
// plain, non-hashed relative import of its shared chunk
// (`./maplibre-gl-shared.mjs`) at runtime. If Vite fingerprints that file's
// build output name (its default behavior for emitted assets), the
// worker's hardcoded import breaks in production and the map silently
// fails to render (the failure happens inside the Worker, so it doesn't
// surface as a page-level error - see MapView.jsx for the full story).
// Keep both files' original names so the worker's relative import still
// resolves once bundled.
const UNHASHED_ASSET_NAMES = new Set(['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'])

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const names = assetInfo.names ?? (assetInfo.name ? [assetInfo.name] : [])
          if (names.some((name) => UNHASHED_ASSET_NAMES.has(name))) {
            return 'assets/[name][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
