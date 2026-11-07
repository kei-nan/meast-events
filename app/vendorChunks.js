// MapLibre and React in chunks of their own (about 355 KB gzipped between
// them), so a deploy that changes only the app's own code leaves their file
// names, which are content hashes, as they were, and a returning visitor's cache
// keeps them. JavaScript only: the stylesheets stay in the chunks they were in,
// in the same order. MapLibre is still loaded only with the map (MapView).
// vite.config.js hands these to rolldown as output.codeSplitting.groups.
export const VENDOR_CHUNKS = [
  { name: 'maplibre', test: /[\\/]node_modules[\\/]maplibre-gl[\\/].*\.m?js$/ },
  { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/].*\.m?js$/ },
]
