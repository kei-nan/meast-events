// Pure helpers behind the map's boundary layers (MapView.jsx): which features
// are active in a year, and one label anchor per territory.

// `features` is whatever decade chunk covers `year` (see the boundary-loading
// effects in MapView.jsx) - a decade chunk can contain features that are only
// active for *part* of that decade (a short-lived phase, a flag window), so this
// still needs to filter down to the exact year, same as when the app had the
// whole boundaries.json in memory.
export function boundariesForYear(year, features) {
  return {
    type: "FeatureCollection",
    features: features.filter(
      (f) => f.properties.start_year <= year && year <= f.properties.end_year
    ),
  };
}

// Signed area (shoelace) and area-weighted centroid of a single linear ring
// (an array of [lon, lat] positions). Coordinates are treated as flat/planar,
// which is an adequate approximation at the scale of a single territory.
export function ringAreaAndCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    // Degenerate ring (collinear points) - fall back to a plain average.
    const avg = ring.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
    return { area: 0, centroid: [avg[0] / ring.length, avg[1] / ring.length] };
  }
  cx /= 6 * area;
  cy /= 6 * area;
  return { area: Math.abs(area), centroid: [cx, cy] };
}

// A polygon can be made up of several disconnected parts (exclaves, islands,
// far-flung imperial holdings). Placing one label per part, as MapLibre's
// default "point" symbol placement does for MultiPolygons, produces many
// repeated labels for the same territory. Instead, pick a single anchor
// point: the centroid of the largest part by area.
export function labelAnchor(geometry) {
  const polygons =
    geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  let best = null;
  for (const polygon of polygons) {
    const outerRing = polygon[0];
    if (!outerRing || outerRing.length < 3) continue;
    const { area, centroid } = ringAreaAndCentroid(outerRing);
    if (!best || area > best.area) best = { area, centroid };
  }
  return best ?? null;
}

// A separate point source (one feature per territory, at a single anchor
// point) so the boundaries-label layer never renders duplicate labels for
// multi-part territories - see labelAnchor() above.
export function boundaryLabelsForYear(year, features) {
  return {
    type: "FeatureCollection",
    features: features
      .filter((f) => f.properties.start_year <= year && year <= f.properties.end_year)
      .map((f) => {
        const best = labelAnchor(f.geometry);
        if (!best) return null;
        const anchor = best.centroid;
        // f.properties.name is already the period-appropriate display name - see
        // scripts/boundary-corrections.js.
        return {
          type: "Feature",
          // area (deg^2 of the largest part) drives placement priority and size:
          // big states are placed first and printed larger, so small neighbours
          // can't squeeze them out (Iraq, Saudi Arabia).
          properties: {
            name: f.properties.name,
            area: best.area,
            big: Math.min(1, Math.sqrt(best.area) / 20),
          },
          geometry: { type: "Point", coordinates: anchor },
        };
      })
      .filter(Boolean),
  };
}
