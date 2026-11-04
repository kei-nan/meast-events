// Pure helpers behind the map's boundary layers (MapView.jsx): which features
// are active in a year, and one label anchor per territory.
import { isIncludedStatus } from "../components/mapBorders.js";

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

// ---- Point-in-shape and distance to a shape's edges ----------------------
// A shape here is its edges (outer rings and holes alike) in runs of up to
// RUN consecutive edges of one ring, each run with its bounding box, so a query
// skips the runs too far away to matter: the West Bank Areas, drawn over Israel,
// have ~135,000 positions.
const RUN = 32;

function edgeRuns(geometry) {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  const runs = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (!ring || ring.length < 3) continue;
      // Edge k joins ring[k] and ring[k + 1], the last one back to ring[0]
      // (zero-length for a closed GeoJSON ring).
      for (let from = 0; from < ring.length; from += RUN) {
        const to = Math.min(from + RUN, ring.length);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let k = from; k <= to; k++) {
          const [x, y] = ring[k % ring.length];
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        runs.push({ ring, from, to, minX, minY, maxX, maxY });
      }
    }
  }
  return runs;
}

const runsBox = (runs) => runs.reduce(
  (b, r) => [Math.min(b[0], r.minX), Math.min(b[1], r.minY), Math.max(b[2], r.maxX), Math.max(b[3], r.maxY)],
  [Infinity, Infinity, -Infinity, -Infinity]
);

// Even-odd rule over every edge: inside an outer ring and not inside one of its
// holes (GeoJSON parts do not overlap, so the count works across parts too).
function inside(x, y, runs) {
  let isIn = false;
  for (const r of runs) {
    if (y < r.minY || y > r.maxY || x > r.maxX) continue;
    const ring = r.ring;
    const n = ring.length;
    for (let k = r.from; k < r.to; k++) {
      const [xi, yi] = ring[k];
      const [xj, yj] = ring[(k + 1) % n];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) isIn = !isIn;
    }
  }
  return isIn;
}

// Distance (degrees, planar) from (x, y) to the nearest edge, or `limit` if
// every edge is at least that far.
function edgeDistance(x, y, runs, limit = Infinity) {
  let best2 = limit * limit;
  for (const r of runs) {
    const dx = Math.max(r.minX - x, 0, x - r.maxX);
    const dy = Math.max(r.minY - y, 0, y - r.maxY);
    if (dx * dx + dy * dy >= best2) continue;
    const ring = r.ring;
    const n = ring.length;
    for (let k = r.from; k < r.to; k++) {
      const [ax, ay] = ring[k];
      const [bx, by] = ring[(k + 1) % n];
      let px = ax;
      let py = ay;
      const ex = bx - ax;
      const ey = by - ay;
      const len2 = ex * ex + ey * ey;
      if (len2 > 0) {
        const t = ((x - ax) * ex + (y - ay) * ey) / len2;
        if (t >= 1) {
          px = bx;
          py = by;
        } else if (t > 0) {
          px = ax + ex * t;
          py = ay + ey * t;
        }
      }
      const d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (d2 < best2) best2 = d2;
    }
  }
  return Math.sqrt(best2);
}


// Where a label may go: inside `own` (holes excluded) and outside every shape in
// `over` (the shapes drawn on top of it). `depth` is positive there and negative
// elsewhere; inside the region it is the distance to the nearest edge that
// bounds it, and nowhere does it understate how deep a point could be, so a
// cell's centre depth plus its half-diagonal bounds every point in the cell -
// what polylabel() below relies on.
function labelRegion(own, over) {
  const contains = (x, y) => inside(x, y, own) && !over.some((runs) => inside(x, y, runs));
  const depth = (x, y) => {
    const d = edgeDistance(x, y, own);
    let s = inside(x, y, own) ? d : -d;
    for (const runs of over) {
      // Only an edge nearer than |s| can lower s.
      const dOver = edgeDistance(x, y, runs, Math.abs(s));
      const sOver = inside(x, y, runs) ? -dOver : dOver;
      if (sOver < s) s = sOver;
    }
    return s;
  };
  return { contains, depth };
}

// The point of the region farthest from its edges (the "pole of inaccessibility"),
// to within `precision` degrees: the polylabel algorithm (Garcia-Castellanos &
// Lombardo 2007, as in Mapbox's polylabel), written here for a region given by
// its depth function rather than as one polygon, so that it can leave out the
// shapes drawn over a territory. Square cells over the bounding box, the most
// promising first; a cell is split only while it could still hold a point
// deeper than the best found by more than `precision`.
function polylabel(depth, [minX, minY, maxX, maxY], precision) {
  const width = maxX - minX;
  const height = maxY - minY;
  const cell = (x, y, h) => {
    const d = depth(x, y);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  // A binary max-heap on `max`.
  const heap = [];
  const push = (c) => {
    heap.push(c);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].max >= heap[i].max) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].max > heap[m].max) m = l;
        if (r < heap.length && heap[r].max > heap[m].max) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  let best = cell(minX + width / 2, minY + height / 2, 0);
  const h0 = Math.min(width, height) / 2;
  if (!(h0 > 0)) return [best.x, best.y];
  for (let x = minX; x < maxX; x += 2 * h0) {
    for (let y = minY; y < maxY; y += 2 * h0) push(cell(x + h0, y + h0, h0));
  }
  while (heap.length) {
    const c = pop();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    const h = c.h / 2;
    push(cell(c.x - h, c.y - h, h));
    push(cell(c.x + h, c.y - h, h));
    push(cell(c.x - h, c.y + h, h));
    push(cell(c.x + h, c.y + h, h));
  }
  return [best.x, best.y];
}

// How far (degrees of latitude) the region reaches straight up and straight
// down from (x, y), the smaller of the two: where the vertical line through the
// point first meets an edge of the shape, one of its holes or a shape drawn over it.
function verticalReach(x, y, shapes) {
  let up = Infinity;
  let down = Infinity;
  for (const runs of shapes) {
    for (const r of runs) {
      if (x < r.minX || x > r.maxX) continue;
      const ring = r.ring;
      const n = ring.length;
      for (let k = r.from; k < r.to; k++) {
        const [xi, yi] = ring[k];
        const [xj, yj] = ring[(k + 1) % n];
        if (xi > x === xj > x) continue;
        const cy = yi + ((x - xi) * (yj - yi)) / (xj - xi);
        if (cy >= y) up = Math.min(up, cy - y);
        else down = Math.min(down, y - cy);
      }
    }
  }
  const reach = Math.min(up, down);
  return Number.isFinite(reach) ? reach : 0;
}

// A polygon can be made up of several disconnected parts (exclaves, islands,
// far-flung imperial holdings). Placing one label per part, as MapLibre's
// default "point" symbol placement does for MultiPolygons, produces many
// repeated labels for the same territory. Instead, pick a single anchor point
// on the largest part by area: its centroid when that lies on the part (holes
// excluded) and outside every shape in `over`, the geometries drawn on top of
// this one (overlayGeometries below); otherwise the point of that part, less
// those shapes, farthest from their edges (polylabel above). A centroid can lie
// off its own shape (the Ottoman Empire's crescent before 1915, Israel's 1949
// lines bent around the West Bank, Area C around the Area B enclaves) or on a
// shape drawn over it (Israel from 1967, over the West Bank, Gaza and the
// Golan); there the name, placed early as one of the larger states, also
// crowded out the names it was printed on.
// `room` is how far (degrees of latitude) the label can move up or down and stay
// on the territory (mapInstallLayers.js), the smaller of the two. For a centroid
// it is the part's extent above and below it, as before; a moved anchor sits
// where the region is cramped, between holes or shapes drawn over it, so there
// it is the reach along the vertical line through the anchor, those edges
// included.
export function labelAnchor(geometry, over = []) {
  const polygons =
    geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  let best = null;
  for (const polygon of polygons) {
    const outerRing = polygon[0];
    if (!outerRing || outerRing.length < 3) continue;
    const { area, centroid } = ringAreaAndCentroid(outerRing);
    if (!best || area > best.area) best = { area, centroid, polygon };
  }
  if (!best) return null;
  const own = edgeRuns({ type: "Polygon", coordinates: best.polygon });
  const box = runsBox(edgeRuns({ type: "Polygon", coordinates: [best.polygon[0]] }));
  // Whole shapes only (a shape's even-odd count needs all its edges), those
  // whose box meets the part's.
  const overRuns = over
    .map(edgeRuns)
    .filter((runs) => {
      const b = runsBox(runs);
      return b[2] >= box[0] && b[0] <= box[2] && b[3] >= box[1] && b[1] <= box[3];
    });
  const region = labelRegion(own, overRuns);
  const [cx, cy] = best.centroid;
  const centroidRoom = () => Math.max(0, Math.min(cy - box[1], box[3] - cy));
  if (region.contains(cx, cy)) return { area: best.area, centroid: best.centroid, room: centroidRoom() };
  const pole = polylabel(region.depth, box, Math.max(box[2] - box[0], box[3] - box[1]) / 1000);
  // Nothing of the part is left uncovered (or only slivers finer than the
  // search): keep the centroid rather than invent a place.
  if (!region.contains(pole[0], pole[1])) return { area: best.area, centroid: best.centroid, room: centroidRoom() };
  return { area: best.area, centroid: pole, room: verticalReach(pole[0], pole[1], [own, ...overRuns]) };
}

// The geometries drawn on top of `feature` among `active` (the features shown
// in the same year): for an "...-included" shape (Israel from 1967; see
// isIncludedStatus and foldIncluded in mapBorders.js), every other shape that is
// not itself "...-included" (the West Bank, its Areas or their placeholder
// outline, Gaza, the Golan); nothing for any other shape.
export function overlayGeometries(feature, active) {
  if (!isIncludedStatus(feature.properties.status)) return [];
  return active
    .filter((o) => o !== feature && o.geometry && !isIncludedStatus(o.properties.status))
    .map((o) => o.geometry);
}

// labelAnchor is pure but not free (a search over Israel less the West Bank
// Areas' ~135,000 positions), and the map asks again on every year change:
// remember the answer per feature object (MapView keeps a chunk's objects) and
// the exact geometries drawn over it.
const anchorCache = new WeakMap();
function cachedAnchor(feature, over) {
  let entries = anchorCache.get(feature);
  if (!entries) anchorCache.set(feature, (entries = []));
  const hit = entries.find(
    (e) => e.geometry === feature.geometry && e.over.length === over.length && e.over.every((g, i) => g === over[i])
  );
  if (hit) return hit.anchor;
  const anchor = labelAnchor(feature.geometry, over);
  entries.push({ geometry: feature.geometry, over, anchor });
  if (entries.length > 8) entries.shift();
  return anchor;
}

// A separate point source (one feature per territory, at a single anchor
// point) so the boundaries-label layer never renders duplicate labels for
// multi-part territories - see labelAnchor() above.
export function boundaryLabelsForYear(year, features) {
  const active = features.filter((f) => f.properties.start_year <= year && year <= f.properties.end_year);
  return {
    type: "FeatureCollection",
    features: active
      .map((f) => {
        if (!f.geometry) return null;
        const best = cachedAnchor(f, overlayGeometries(f, active));
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
            room: best.room,
          },
          geometry: { type: "Point", coordinates: anchor },
        };
      })
      .filter(Boolean),
  };
}
