// Boundary geometries that load only once the map is zoomed in over them
// (DEFERRED_GROUPS in scripts/split-data.mjs: OCHA's West Bank Areas A/B/C,
// ~1 MB compressed). In a decade chunk such a member arrives with its
// properties, `geometry: null`, `geometry_ref`, `bbox` and `minzoom`; the
// group's placeholder (an existing source outline of the same ground) carries
// `placeholder_for: [member names]` and is drawn until every member has arrived.

export const isPending = (f) => f.geometry == null && Boolean(f.geometry_ref);
export const isPlaceholder = (f) => Array.isArray(f.properties.placeholder_for);

// What the map draws from a chunk: members whose geometry has arrived, and a
// placeholder only while one of its members is still pending. Keeps the
// chunk's feature objects (MapView compares them by identity).
export function drawableBoundaries(features) {
  const pending = new Set(features.filter(isPending).map((f) => f.properties.name));
  return features.filter((f) =>
    isPlaceholder(f) ? f.properties.placeholder_for.some((n) => pending.has(n)) : !isPending(f)
  );
}

// What the Borders list and popups describe: the real features, loaded or not
// (their properties are all in the chunk), never the placeholder.
export function listedBoundaries(features) {
  return features.filter((f) => !isPlaceholder(f));
}

// The members a placeholder stands for, from the same chunk.
export function placeholderMembers(placeholder, features) {
  const names = new Set(placeholder.properties.placeholder_for);
  return features.filter((f) => !isPlaceholder(f) && names.has(f.properties.name));
}

// geometry_refs of pending features active in `year` that the view needs:
// zoomed in to their minzoom and their bbox overlapping `bounds`
// ([west, south, east, north]).
export function deferredRefsInView(features, year, zoom, bounds) {
  const [w, s, e, n] = bounds;
  const refs = new Set();
  for (const f of features) {
    if (!isPending(f) || zoom < (f.minzoom ?? 0)) continue;
    if (f.properties.start_year > year || year > f.properties.end_year) continue;
    const [bw, bs, be, bn] = f.bbox ?? [-180, -90, 180, 90];
    if (bw <= e && be >= w && bs <= n && bn >= s) refs.add(f.geometry_ref);
  }
  return [...refs];
}

// `features` with the pending feature(s) named by `ref` given their geometry;
// the same array when none is pending, so callers can skip a re-render.
export function withGeometry(features, ref, geometry) {
  if (!features.some((f) => isPending(f) && f.geometry_ref === ref)) return features;
  return features.map((f) => {
    if (!isPending(f) || f.geometry_ref !== ref) return f;
    const { geometry_ref: _ref, bbox: _bbox, minzoom: _minzoom, ...rest } = f;
    return { ...rest, geometry };
  });
}
