// The map's land as one GeoJSON source with two levels of detail (scripts/build-land.js):
// the light land (data/land.json, land-far.json), its Middle East polygons cut into cells,
// and per cell the Natural Earth 1:10m coast (data/land-cells/<cell>.json). A cell shows
// its light pieces until its 1:10m file has arrived, then only that: never both, never
// neither. Feature ids let the map swap one cell at a time (GeoJSONSource.updateData)
// instead of re-sending the world. Kept free of MapLibre so it can be unit-tested.

export function createLandStore() {
  let nextId = 1;
  const lightIds = new Map(); // cell -> ids of its light pieces in the source
  const detailed = new Set(); // cells showing 1:10m
  const current = new Map(); // id -> feature: what the source holds

  const withId = (f) => ({ ...f, id: nextId++ });

  return {
    // Light land (the near or the far file): every piece, except those of a cell already detailed.
    addLow(fc) {
      const add = [];
      for (const f of fc.features) {
        const cell = f.properties?.cell;
        if (cell && detailed.has(cell)) continue;
        const g = withId(f);
        if (cell) (lightIds.get(cell) ?? lightIds.set(cell, []).get(cell)).push(g.id);
        current.set(g.id, g);
        add.push(g);
      }
      return { add };
    },
    // A cell's 1:10m land replaces its light pieces.
    addDetail(cell, fc) {
      if (detailed.has(cell)) return { add: [], remove: [] };
      detailed.add(cell);
      const remove = lightIds.get(cell) ?? [];
      lightIds.delete(cell);
      for (const id of remove) current.delete(id);
      const add = fc.features.map(withId);
      for (const g of add) current.set(g.id, g);
      return { add, remove };
    },
    isDetailed: (cell) => detailed.has(cell),
    data: () => ({ type: "FeatureCollection", features: [...current.values()] }),
  };
}

// Cells (ids "<west>_<south>") of a `size`-degree grid that overlap bounds [w, s, e, n].
export function cellsInBounds(cells, size, [w, s, e, n]) {
  return cells.filter((id) => {
    const [x, y] = id.split("_").map(Number);
    return x < e && x + size > w && y < n && y + size > s;
  });
}

// Whether to fetch every cell in the background (so a zoom-in finds its coast drawn), or
// only the ones in and around the view once zoomed in (MapView's onView): not when the
// visitor has asked to save data, or the link looks slow. All cells are ~257 KB; on a
// slow link that download runs for seconds after the map shows (measured 2026-10 on a
// throttled phone, 1.6 Mbps/150 ms: until ~10 s, ~4.6 s past the map) and delays what a
// click asks for next, an event's details or another decade's borders. The effective
// type alone misses that link: Chromium calls it "4g" (3G starts at 270 ms or below
// 0.7 Mbps). The round-trip time is the signal: 150 ms+ is a mobile network's, while
// Chromium's starting estimate before it has measured anything is ~100 ms (a fresh
// profile on a fast desktop link reported 100 ms, 1.45 Mbps). That estimate's downlink is why bandwidth only
// counts below 1 Mbps: 1-2 Mbps is also what a fast link reports at first.
// `connection` is navigator.connection (Network Information API, Chromium only): an
// unknown field, or no API, keeps the fill on, as does a 0 (no estimate).
export const SLOW_RTT_MS = 150;
export const SLOW_DOWNLINK_MBPS = 1;
export function wantsBackgroundDetail(connection) {
  if (!connection) return true;
  if (connection.saveData) return false;
  if (/(^|-)[23]g$/.test(connection.effectiveType ?? "")) return false;
  const { downlink, rtt } = connection;
  if (rtt >= SLOW_RTT_MS) return false;
  if (downlink > 0 && downlink < SLOW_DOWNLINK_MBPS) return false;
  return true;
}

// Whether the link is known to be fast enough for the map's downloads to start at
// once, alongside the page's own, instead of after its first paint (App.jsx). The
// wait is for slow links, where they would share bandwidth with the panel and
// delay it; on a fast one it only holds the map back (~0.2 s on desktop). So, the
// opposite default to wantsBackgroundDetail's: anything not known to be fast waits
// - no API (Safari, Firefox), save-data, or no estimate (0). Nor does Chromium's
// estimate before it has measured much: a fresh profile on a fast desktop link
// reported 1.45-1.75 Mbps with 100 or 50 ms (2026-10), hence the bandwidth floor;
// and below 100 ms, as a mobile network's round trip (150 ms+) never is. Chromium
// reports at most 10 Mbps, in 25 ms and 25 kbps steps.
export const FAST_RTT_MS = 100;
export const FAST_DOWNLINK_MBPS = 5;
export function isFastConnection(connection) {
  if (!connection || connection.saveData) return false;
  if (connection.effectiveType && connection.effectiveType !== "4g") return false;
  const { downlink, rtt } = connection;
  return rtt > 0 && rtt < FAST_RTT_MS && downlink >= FAST_DOWNLINK_MBPS;
}
