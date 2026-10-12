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
// only the ones in view: not when the visitor has asked to save data, or is on 2G.
// `connection` is navigator.connection (Network Information API; absent in some browsers).
export function wantsBackgroundDetail(connection) {
  if (!connection) return true;
  return !connection.saveData && !/(^|-)2g$/.test(connection.effectiveType ?? "");
}
