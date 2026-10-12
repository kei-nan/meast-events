// Builds the land - physical geography only, no political lines, so nothing modern can leak
// onto a historical year - from Natural Earth (public domain, https://www.naturalearthdata.com/),
// in three forms:
//
//  data/land-mask.json            for scripts/ingest-boundaries.js, which fits shapes to the
//                                 coast: Natural Earth 1:10m inside REGION (every border the
//                                 map draws), unsimplified 1:50m outside. Not shipped.
//  app/src/data/land.json         the light land every view starts with (and MapLoading's
//                                 stand-in): 1:50m simplified to LIGHT_TOLERANCE and rounded to
//                                 LIGHT_DECIMALS, its polygons inside REGION cut into CELL-degree
//                                 cells (each piece tagged with `cell`). Display only.
//  app/src/data/land-cells/<cell>.json   Natural Earth 1:10m land inside each cell, source
//                                 vertices unchanged. The map swaps a cell's light pieces for
//                                 these once they have loaded (lib/landStore.js, MapView.jsx).
//
// Cutting adds vertices only on cut lines (rounded to 6 decimals, the 1:10m source's
// precision); the checks below fail the build if any other vertex differs from its source.
// The map draws the land in one opaque colour, so pieces that meet along a cut show no seam.
//
// Sources, pinned to the upstream commit they were built from (Natural Earth 5.1.x):
//   curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ace5fed0eaf3c6c03c951e75b439ba8fffbc218e/geojson/ne_10m_land.geojson -o data/raw/ne10-land.geojson
//   curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ace5fed0eaf3c6c03c951e75b439ba8fffbc218e/geojson/ne_50m_land.geojson -o data/raw/ne50-land.geojson
// (Natural Earth's separate 10m "minor islands" layer adds nothing here: every one of its
// islands inside REGION is already in ne_10m_land, checked 2026-10-12.)
//
// CLI (optional): --raw-dir=DIR  read the sources from DIR (default data/raw)
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import * as turf from "@turf/turf";
import { MAP_EXTENT } from "../app/src/lib/mapExtent.js";
import { stringifyFeatureCollection } from "./lib/json-lines.js";

// [minLon, minLat, maxLon, maxLat], on the CELL grid. Must hold every border in
// data/boundaries.json (1900-present: 9.31..63.33E, 12.14..43.58N - the Ottoman Empire's
// Tripolitania and Balkans, Iran's east, Yemen's south); the build fails if one reaches out.
export const REGION = [5, 10, 65, 45];
export const CELL = 5;
// The light land: ~2 km tolerance (degrees) and 2 decimals (~1 km). At the zooms where it
// shows alone that is about a pixel; inside REGION it gives way to 1:10m as cells load.
const LIGHT_TOLERANCE = 0.02;
const LIGHT_DECIMALS = 2;

const argVal = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const RAW_DIR = argVal("raw-dir") ? pathToFileURL(resolve(argVal("raw-dir")) + "/") : new URL("../data/raw/", import.meta.url);
const OUT_MASK = new URL("../data/land-mask.json", import.meta.url);
const OUT_LIGHT = new URL("../app/src/data/land.json", import.meta.url);
const OUT_CELLS = new URL("../app/src/data/land-cells/", import.meta.url);

const polygonsOf = (fc) =>
  fc.features.flatMap((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates));
function bboxOf(rings) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of rings[0]) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}
const touches = (b, [w, s, e, n]) => b[2] > w && b[0] < e && b[3] > s && b[1] < n;
const within = (b, [w, s, e, n]) => b[0] >= w && b[2] <= e && b[1] >= s && b[3] <= n;
const roundTo = (dp) => (v) => Math.round(v * 10 ** dp) / 10 ** dp;
const round6 = roundTo(6);
const count = (polys) => polys.reduce((sum, rings) => sum + rings.reduce((a, r) => a + r.length, 0), 0);
const feature = (rings, properties = {}) => ({ type: "Feature", properties, geometry: { type: "Polygon", coordinates: rings } });

// The polygons of `rings` inside (or outside) `box`; new vertices on the cut rounded to 6 dp.
function clip(rings, box, mode = "inside") {
  const pair = turf.featureCollection([turf.polygon(rings), turf.bboxPolygon(box)]);
  const out = mode === "inside" ? turf.intersect(pair) : turf.difference(pair);
  if (!out) return [];
  const polys = out.geometry.type === "Polygon" ? [out.geometry.coordinates] : out.geometry.coordinates;
  return polys.map((p) => p.map((ring) => ring.map(([x, y]) => [round6(x), round6(y)])));
}

// Splits polygons over the CELL grid inside REGION: { cells: Map(cellId -> [rings]), outside: [rings] }.
// Cell ids are "<west>_<south>".
function splitIntoCells(polys) {
  const cells = new Map();
  const outside = [];
  const add = (id, rings) => (cells.get(id) ?? cells.set(id, []).get(id)).push(rings);
  const cellsOf = (b) => {
    const ids = [];
    for (let x = REGION[0]; x < REGION[2]; x += CELL)
      for (let y = REGION[1]; y < REGION[3]; y += CELL) {
        const box = [x, y, x + CELL, y + CELL];
        if (touches(b, box)) ids.push([`${x}_${y}`, box]);
      }
    return ids;
  };
  for (const rings of polys) {
    const b = bboxOf(rings);
    if (!touches(b, REGION)) {
      outside.push(rings);
      continue;
    }
    if (!within(b, REGION)) outside.push(...clip(rings, REGION, "outside"));
    for (const piece of within(b, REGION) ? [rings] : clip(rings, REGION)) {
      const pb = bboxOf(piece);
      const ids = cellsOf(pb);
      if (ids.length === 1 && within(pb, ids[0][1])) {
        add(ids[0][0], piece);
        continue;
      }
      // Column strips first, so the continental polygon is not clipped whole once per cell.
      for (const x of new Set(ids.map(([, box]) => box[0]))) {
        for (const strip of clip(piece, [x, REGION[1], x + CELL, REGION[3]])) {
          const sb = bboxOf(strip);
          for (const [id, box] of cellsOf(sb)) {
            if (box[0] !== x) continue;
            if (within(sb, box)) add(id, strip);
            else for (const cp of clip(strip, box)) add(id, cp);
          }
        }
      }
    }
  }
  return { cells, outside };
}

// Every output vertex is a source vertex or lies on a cut line (a multiple of CELL), and
// every vertex of `mustKeep` survives - except one exactly on the straight line between its
// neighbours, which the clipper drops without changing the shape.
function checkVertices(name, srcPolys, outPolys, mustKeep) {
  const key = ([x, y]) => `${x},${y}`;
  const src = new Set(srcPolys.flatMap((rings) => rings.flatMap((r) => r.map(key))));
  const out = new Set(outPolys.flatMap((rings) => rings.flatMap((r) => r.map(key))));
  const onCut = (v) => Math.abs(v / CELL - Math.round(v / CELL)) < 1e-9;
  let changed = 0;
  for (const rings of outPolys)
    for (const r of rings)
      for (const p of r) if (!src.has(key(p)) && !onCut(p[0]) && !onCut(p[1])) changed++;
  let lost = 0;
  let collinear = 0;
  for (const rings of mustKeep)
    for (const r of rings)
      r.forEach(([x, y], i) => {
        if (out.has(key([x, y]))) return;
        const [px, py] = r[(i - 1 + r.length - 1) % (r.length - 1)];
        const [nx, ny] = r[(i + 1) % (r.length - 1)];
        // Cross product ~0 (1e-12 deg^2 absorbs floating-point error on rounded coordinates).
        if (Math.abs((x - px) * (ny - py) - (y - py) * (nx - px)) < 1e-12) collinear++;
        else {
          lost++;
          console.error(`${name}: lost ${x},${y}`);
        }
      });
  console.log(`${name}: ${count(outPolys)} vertices; ${collinear} collinear source vertices dropped by the cut (shape unchanged)`);
  if (changed || lost) throw new Error(`${name}: ${changed} vertices neither from the source nor on a cut, ${lost} source vertices lost`);
}

const ne10 = polygonsOf(JSON.parse(await readFile(new URL("ne10-land.geojson", RAW_DIR), "utf-8")));
const ne50 = polygonsOf(JSON.parse(await readFile(new URL("ne50-land.geojson", RAW_DIR), "utf-8")));
const inMap = (rings) => touches(bboxOf(rings), MAP_EXTENT);

const borders = turf.bbox(JSON.parse(await readFile(new URL("../data/boundaries.json", import.meta.url), "utf-8")));
if (!within(borders, REGION)) throw new Error(`borders reach ${borders.join(", ")}, outside REGION ${REGION.join(", ")}: widen it`);

// --- 1:10m cells ------------------------------------------------------------------------
const ne10InRegion = ne10.filter((rings) => touches(bboxOf(rings), REGION));
const detail = splitIntoCells(ne10InRegion);
const detailPolys = [...detail.cells.values()].flat();
checkVertices("1:10m cells", ne10InRegion, detailPolys, ne10InRegion.filter((r) => within(bboxOf(r), REGION)));

// --- light land -------------------------------------------------------------------------
// Simplified and rounded BEFORE cutting, so the cut lines stay exact.
const roundLight = roundTo(LIGHT_DECIMALS);
const light = [];
for (const rings of ne50.filter(inMap)) {
  const simple = turf.simplify(turf.polygon(rings), { tolerance: LIGHT_TOLERANCE, highQuality: true }).geometry.coordinates;
  const kept = [];
  for (const ring of simple) {
    const r = [];
    for (const [x, y] of ring) {
      const p = [roundLight(x), roundLight(y)];
      const last = r[r.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) r.push(p);
    }
    if (r.length >= 4) kept.push(r);
    else if (!kept.length) break; // the outer ring collapsed: an islet under ~1 km
  }
  if (kept.length) light.push(kept);
}
const lightCut = splitIntoCells(light);
checkVertices("light land", light, [...lightCut.outside, ...[...lightCut.cells.values()].flat()], light);

// --- border mask: 1:10m inside REGION, unsimplified 1:50m outside, one polygon per landmass
const maskInside = ne10InRegion.flatMap((rings) => (within(bboxOf(rings), REGION) ? [rings] : clip(rings, REGION)));
const maskOutside = ne50.filter(inMap).flatMap((rings) => {
  const b = bboxOf(rings);
  if (within(b, REGION)) return [];
  return touches(b, REGION) ? clip(rings, REGION, "outside") : [rings];
});
// Join pieces on either side of REGION's edge: the fits treat the mask's outline as coast.
const [w, s, e, n] = REGION;
const onEdge = (rings) => rings.some((r) => r.some(([x, y]) => x === w || x === e || y === s || y === n));
const seamed = [...maskInside, ...maskOutside].filter(onEdge);
const joined = turf.union(turf.featureCollection(seamed.map((rings) => turf.polygon(rings))));
const mask = [
  ...[...maskInside, ...maskOutside].filter((rings) => !onEdge(rings)),
  ...(joined.geometry.type === "Polygon" ? [joined.geometry.coordinates] : joined.geometry.coordinates),
];

// --- write -------------------------------------------------------------------------------
const cellIds = [...new Set([...lightCut.cells.keys(), ...detail.cells.keys()])].sort();
await rm(OUT_CELLS, { recursive: true, force: true });
await mkdir(OUT_CELLS, { recursive: true });
for (const id of cellIds) {
  const fc = { type: "FeatureCollection", features: (detail.cells.get(id) ?? []).map((r) => feature(r, { cell: id })) };
  await writeFile(new URL(`${id}.json`, OUT_CELLS), stringifyFeatureCollection(fc));
}
await writeFile(
  OUT_LIGHT,
  stringifyFeatureCollection({
    type: "FeatureCollection",
    region: REGION,
    cellSize: CELL,
    cells: cellIds,
    features: [
      ...lightCut.outside.map((r) => feature(r)),
      ...[...lightCut.cells].flatMap(([id, polys]) => polys.map((r) => feature(r, { cell: id }))),
    ],
  })
);
await writeFile(OUT_MASK, stringifyFeatureCollection({ type: "FeatureCollection", features: mask.map((r) => feature(r)) }));
console.log(
  `land.json: ${count(light)} vertices (1:50m, ${LIGHT_TOLERANCE} deg, ${LIGHT_DECIMALS} dp); ` +
    `${cellIds.length} cells of 1:10m, ${count(detailPolys)} vertices; land-mask.json: ${mask.length} polygons, ${count(mask)} vertices`
);
