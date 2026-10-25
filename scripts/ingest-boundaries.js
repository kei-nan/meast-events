// Filters the CShapes 2.0 dataset (data/raw/cshapes-2.0.geojson, downloaded separately
// from https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson) down to our region and
// 1900-present, then applies our own corrections (scripts/boundary-corrections.js) to
// produce data/boundaries.json for the map's time-driven border layer.
//
// CShapes 2.0 by Schvitz et al., ETH Zurich - CC BY-NC-SA 4.0. Non-commercial use only;
// see https://icr.ethz.ch/data/cshapes/ before any commercial reuse of this project.
//
// data/raw/cshapes-2.0.geojson is untouched upstream data and should never be hand-edited.
// Every historical correction/addition this project makes lives in boundary-corrections.js
// instead, and is carried through to every output feature's `source`/`status`/`note`
// properties, so the generated file is self-documenting about what came from where.
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { CORRECTIONS } from "./boundary-corrections.js";
import * as turf from "@turf/turf";
import { stringifyFeatureCollection } from "./lib/json-lines.js";
import { dropRepeatedPositionsInGeometry } from "./lib/ring-positions.js";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// CLI (both optional; for checking a change without touching the committed files):
//   --raw-dir=DIR   read cshapes-2.0.geojson / ne10-countries.geojson from DIR (default data/raw)
//   --out=FILE      write the result to FILE instead of data/boundaries.json
const argVal = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const RAW_DIR = argVal("raw-dir") ? pathToFileURL(resolve(argVal("raw-dir")) + "/") : new URL("../data/raw/", import.meta.url);
const OUT = argVal("out") ? pathToFileURL(resolve(argVal("out"))) : new URL("../data/boundaries.json", import.meta.url);

const CSHAPES_CITATION = "CShapes 2.0 (Schvitz et al., ETH Zurich, CC BY-NC-SA 4.0)";

const REGION_ENTITIES = [
  "Turkey (Ottoman Empire)",
  "Iran (Persia)",
  "Iraq",
  "Syria",
  "Lebanon",
  "Jordan",
  "Palestine",
  "Israel",
  "Egypt",
  "Saudi Arabia",
  "Yemen (Arab Republic of Yemen)",
  "Yemen, People's Republic of",
  // South Arabia under British rule, before South Yemen's independence in 1967.
  "Aden",
  "East Aden Protectorate",
  "Federation of South Arabia",
  "Kuwait",
  "Bahrain",
  "Qatar",
  "United Arab Emirates",
  "Oman",
];

// The map works in whole years, but CShapes records start and end on exact dates, so a
// predecessor and its successor both "cover" the changeover year. Each year is given to
// the record in force on 1 July, so exactly one record per entity is shown per year.
// A record that spans no 1 July (the 10-day Iraq record of 1932, two Balkan-war Ottoman
// snapshots) gets an empty range and is skipped.
const REFERENCE_DAY = "-07-01";
const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function activeYears(p) {
  const start = isoDate(p.gwsyear, p.gwsmonth, p.gwsday);
  const end = isoDate(p.gweyear, p.gwemonth, p.gweday);
  const startYear = start <= `${p.gwsyear}${REFERENCE_DAY}` ? p.gwsyear : p.gwsyear + 1;
  // CShapes ends in 2019; treat each country's last record as still current, since
  // none of these recognized sovereign borders have changed since (corrections that
  // extend into the present, like Israel's, rely on this too).
  if (p.gweyear >= 2019) return [startYear, 9999];
  const endYear = end >= `${p.gweyear}${REFERENCE_DAY}` ? p.gweyear : p.gweyear - 1;
  return [startYear, endYear];
}

function defaultName(cntry_name) {
  const openParen = cntry_name.indexOf(" (");
  return openParen >= 0 ? cntry_name.slice(0, openParen) : cntry_name;
}

// Every year strictly between startYear and endYear where either a split-phase
// boundary or a flag window edge falls - these are where we need to cut the raw
// CShapes feature into separate output features.
function cutPoints(cntry_name, startYear, endYear) {
  const cuts = new Set();
  for (const c of CORRECTIONS) {
    if (c.target !== cntry_name) continue;
    if (c.type === "split") {
      for (const phase of c.phases) {
        if (phase.until > startYear && phase.until <= endYear) cuts.add(phase.until);
      }
    } else if (c.type === "flag") {
      if (c.fromYear > startYear && c.fromYear <= endYear) cuts.add(c.fromYear);
      if (c.toYear + 1 > startYear && c.toYear + 1 <= endYear) cuts.add(c.toYear + 1);
    }
  }
  return [...cuts].sort((a, b) => a - b);
}

// Resolves name/status/note/source for one sub-interval, using its start year to
// decide which split-phase and/or flag (if any) applies. Flags win over splits over
// the untouched default, and combine where they don't overlap (e.g. a flag's note
// doesn't erase a split's name unless the flag also specifies its own name).
function resolveProperties(cntry_name, intervalStartYear) {
  let name = defaultName(cntry_name);
  let status = null;
  let note = null;
  let source = CSHAPES_CITATION;
  let geometryKey = null;

  const split = CORRECTIONS.find((c) => c.type === "split" && c.target === cntry_name);
  const phase = split?.phases.find((p) => intervalStartYear < p.until);
  if (phase) {
    name = phase.name;
    status = phase.status ?? null;
    note = split.note;
    source = phase.geometry
      ? `Geometry corrected per ${split.source} (see data/corrections-geometry.json); ${CSHAPES_CITATION} for the rest`
      : `${CSHAPES_CITATION} geometry, renamed per ${split.source}`;
    geometryKey = phase.geometry ?? null;
  }

  const flag = CORRECTIONS.find(
    (c) =>
      c.type === "flag" &&
      c.target === cntry_name &&
      intervalStartYear >= c.fromYear &&
      intervalStartYear <= c.toYear
  );
  if (flag) {
    if (flag.name) name = flag.name;
    // A flag without a status (e.g. Egypt 1979-1981, a note only) keeps the status it had;
    // assigning flag.status would make it undefined and drop the key from the output.
    if ("status" in flag) status = flag.status;
    note = flag.note;
    source = `${CSHAPES_CITATION} geometry; ${flag.source}`;
  }

  // Every feature carries status and note keys (null when there is none); the validator warns otherwise.
  return { name, status: status ?? null, note: note ?? null, source, geometryKey };
}

async function main() {
  const sourcePath = new URL("cshapes-2.0.geojson", RAW_DIR);
  const geometryPath = new URL("../data/corrections-geometry.json", import.meta.url);
  const outPath = OUT;

  const raw = JSON.parse(await readFile(sourcePath, "utf-8"));
  RAW_RECORDS = raw.features;
  const correctionsGeometry = JSON.parse(await readFile(geometryPath, "utf-8"));
  const land = JSON.parse(await readFile(new URL("../data/land-mask.json", import.meta.url), "utf-8"));
  const filtered = raw.features.filter(
    (f) => REGION_ENTITIES.includes(f.properties.cntry_name) && f.properties.gweyear >= 1900
  );

  const features = [];
  for (const f of filtered) {
    const p = f.properties;
    const cntry_name = p.cntry_name;
    const [startYear, endYear] = activeYears(p);
    if (endYear < startYear) continue;

    const cuts = cutPoints(cntry_name, startYear, endYear);
    const boundaries = [startYear, ...cuts, endYear];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const segStart = boundaries[i];
      const segEnd = i === boundaries.length - 2 ? endYear : boundaries[i + 1] - 1;
      if (segEnd < segStart) continue;
      const props = resolveProperties(cntry_name, segStart);
      features.push({
        type: "Feature",
        properties: {
          name: props.name,
          start_year: segStart,
          end_year: segEnd,
          status: props.status,
          source: props.source,
          note: props.note,
        },
        geometry: props.geometryKey ? correctionsGeometry[props.geometryKey] : f.geometry,
      });
    }
  }

  // "add" entries are territories the region filter above doesn't produce. Their geometry is
  // either a computed shape from corrections-geometry.json or, written "cshapes:<cntry_name>",
  // a CShapes record outside REGION_ENTITIES (e.g. its 1948-1967 "West Bank", which includes
  // East Jerusalem).
  const cshapesRecord = (cntry_name) => {
    const hits = raw.features.filter((f) => f.properties.cntry_name === cntry_name);
    if (hits.length !== 1) throw new Error(`expected one CShapes record "${cntry_name}", got ${hits.length}`);
    return hits[0].geometry;
  };
  // "reshape" entries: give a corrections-geometry shape a CShapes country's line as its
  // border, once, before any "add" entry uses the shape. Each listed border: cut the shape
  // by that CShapes outline (the record in force in `year`, default the latest); with
  // `grow`, also give the shape the land within `maxGapKm` between it and that outline
  // which nothing else covers; with `coastEnd`, cut it where that border meets the sea.
  const cshapesIn = (name, year) => {
    const recs = raw.features.filter((f) => f.properties.cntry_name === name);
    const rec = year == null ? recs.sort((a, b) => b.properties.gweyear - a.properties.gweyear)[0]
      : recs.find((f) => f.properties.gwsyear <= year && year <= f.properties.gweyear);
    if (!rec) throw new Error(`reshape: no CShapes "${name}" record${year != null ? ` for ${year}` : ""}`);
    return rec.geometry;
  };
  // Natural Earth 1:10m country polygons (data/raw/ne10-countries.geojson, the source of
  // several corrections-geometry shapes), loaded only if a reshape asks for them.
  let ne10 = null;
  const ne10Land = (area) => {
    ne10 ??= JSON.parse(readFileSync(new URL("ne10-countries.geojson", RAW_DIR), "utf-8"));
    return area ? ne10.features.filter((f) => turf.booleanIntersects(f, area)).map((f) => asFeature(f.geometry)) : [];
  };
  for (const r of CORRECTIONS.filter((c) => c.type === "reshape")) {
    if (!correctionsGeometry[r.geometry]) throw new Error(`reshape: no geometry "${r.geometry}"`);
    let shape = asFeature(correctionsGeometry[r.geometry]);
    const outlines = r.borders.map((b) => asFeature(cshapesIn(b.cshapes, b.year)));
    r.borders.forEach((b, i) => {
      if (b.grow) {
        const between = turf.intersect(fc(turf.buffer(shape, b.maxGapKm), turf.buffer(outlines[i], b.maxGapKm)));
        let gap = between && turf.difference(fc(between, shape));
        for (const o of outlines) gap = gap && turf.difference(fc(gap, o));
        // "Land" here must have the same coastline as the shape itself, or the coastal
        // strip where two sources' coasts differ gets added along the whole shore.
        const mask = r.landFrom === "naturalEarth10" ? ne10Land(gap) : land.features.map((l) => asFeature(l.geometry));
        const onLand = gap ? mask.filter((l) => turf.booleanIntersects(l, gap)).map((l) => turf.intersect(fc(l, gap))).filter(Boolean) : [];
        for (const piece of onLand) shape = turf.union(fc(shape, piece));
      }
    });
    r.borders.forEach((b, i) => {
      shape = turf.difference(fc(shape, outlines[i])) ?? shape;
      // The two sources' coastlines differ, so the cut can leave a strip of the shape along
      // the country's coast beyond the point where their border meets the sea: extend the
      // border's last stretch (`coastEnd`: its last two CShapes vertices) out to sea and cut.
      if (b.coastEnd) shape = cutBeyondCoastEnd(shape, outlines[i].geometry, b.coastEnd, r.keepPoint);
    });
    // The shape is one territory: keep only the piece containing keepPoint (growth can pick
    // up a stray bit of gap beyond a tripoint).
    const g = turf.getGeom(shape);
    if (g.type === "MultiPolygon") {
      const main = g.coordinates.find((rings) => turf.booleanPointInPolygon(turf.point(r.keepPoint), turf.polygon(rings)));
      if (!main) throw new Error(`reshape: no piece of ${r.geometry} contains keepPoint`);
      shape = turf.polygon(main);
    }
    // Coordinates keep full source precision - never rounded, never simplified. Only exact
    // repeats of the previous vertex (which the cuts can leave behind) are dropped;
    // collinear vertices are source vertices and are kept.
    correctionsGeometry[r.geometry] = dropRepeatedPositionsInGeometry(turf.getGeom(shape), r.geometry);
  }
  for (const c of CORRECTIONS) {
    if (c.type !== "add") continue;
    const fromCshapes = c.geometry.startsWith("cshapes:");
    const geometry = fromCshapes ? cshapesRecord(c.geometry.slice("cshapes:".length)) : correctionsGeometry[c.geometry];
    if (!geometry) throw new Error(`no geometry "${c.geometry}" for ${c.name}`);
    features.push({
      type: "Feature",
      properties: {
        name: c.name,
        start_year: c.start_year,
        end_year: c.end_year,
        status: c.status ?? null,
        source: fromCshapes
          ? `${CSHAPES_CITATION} geometry (its "${c.geometry.slice("cshapes:".length)}" record); ${c.source}`
          : `Not in CShapes; ${c.source}${c.geometry_source ? `; ${c.geometry_source}` : ""}`,
        note: c.note ?? null,
      },
      geometry,
    });
  }

  const fitted = applyCoastalGaps(applyFits(features, land), land);

  const out = {
    type: "FeatureCollection",
    source:
      `Derived from ${CSHAPES_CITATION} with corrections and additions by this project - ` +
      "see each feature's `source`/`note` properties, and scripts/boundary-corrections.js " +
      "for the full list of changes with citations.",
    features: fitted,
  };

  await writeFile(outPath, stringifyFeatureCollection(out));
  console.log(`Wrote ${fitted.length} boundary features to ${argVal("out") ?? "data/boundaries.json"}`);

  const modified = fitted.filter((f) => f.properties.note);
  console.log(`${modified.length} features carry a correction:`);
  for (const f of modified) {
    console.log(`  ${f.properties.name} (${f.properties.start_year}-${f.properties.end_year})${f.properties.status ? ` [${f.properties.status}]` : ""}`);
  }
}

// --- "fit" entries (see boundary-corrections.js) --------------------------------------
//
// For each fit, every neighbour feature that is on the map in the same years as the overlay
// is split at the overlay's year boundaries, and in the overlapping years its geometry
// becomes: clip = neighbour minus overlay; snap = that, plus the land between the two that
// no other feature covers (the sliver between the two lines; see gapBetween).
const asFeature = (geometry) => ({ type: "Feature", properties: {}, geometry });
const fc = (...fs) => turf.featureCollection(fs);
const activeIn = (f, y) => f.properties.start_year <= y && y <= f.properties.end_year;
const bboxesTouch = (a, b) => !(a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]);

// Detached pieces of a clipped shape smaller than this, lying within maxGapKm of the
// overlay, are leftovers of the two sources disagreeing, not real territory.
const TRIM_MAX_PIECE_KM2 = 100;
// "reshape" coastEnd: how far the border's last stretch is extended to sea, and the radius
// around the coastal end within which the far side is removed.
const COAST_EXTEND_KM = 3;
const COAST_CUT_RADIUS_KM = 4;

function cutBeyondCoastEnd(shape, countryGeometry, [border, coastEnd], keepPoint) {
  // Both points must be vertices of the country's CShapes outline, so the line is the
  // sourced border's own last stretch, not a line drawn by us.
  const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;
  const vertices = turf.coordAll(asFeature(countryGeometry));
  for (const p of [border, coastEnd]) if (!vertices.some((c) => near(c, p))) throw new Error(`reshape: ${p} is not a vertex of the country outline`);
  const end = coastEnd;
  const bearing = turf.bearing(turf.point(border), turf.point(end));
  const out = turf.destination(turf.point(end), COAST_EXTEND_KM, bearing).geometry.coordinates;
  const back = turf.destination(turf.point(end), COAST_CUT_RADIUS_KM, bearing + 180).geometry.coordinates;
  // Two half-planes, each a big quadrilateral on one side of the line back -> out.
  const side = (sign) => turf.polygon([[back, out,
    turf.destination(turf.point(out), COAST_CUT_RADIUS_KM, bearing + sign * 90).geometry.coordinates,
    turf.destination(turf.point(back), COAST_CUT_RADIUS_KM, bearing + sign * 90).geometry.coordinates, back]]);
  // Which side of the line back -> out is keepPoint on? (sign of the 2-D cross product)
  const cross = (out[0] - back[0]) * (keepPoint[1] - back[1]) - (out[1] - back[1]) * (keepPoint[0] - back[0]);
  const keepSide = (sign) => {
    const corner = turf.destination(turf.point(out), 1, bearing + sign * 90).geometry.coordinates;
    const c = (out[0] - back[0]) * (corner[1] - back[1]) - (out[1] - back[1]) * (corner[0] - back[0]);
    return Math.sign(c) === Math.sign(cross);
  };
  const far = keepSide(1) ? side(-1) : side(1);
  return turf.difference(turf.featureCollection([shape, far])) ?? shape;
}

// The polygon operations work in exact floating point, so a part they add can end up
// touching the rest along an edge that is collinear only to ~1e-16 degrees: the result is
// a MultiPolygon whose parts share an edge (drawn as a line inside the country), or keeps
// zero-area there-and-back spikes. Coordinates are never rounded to fix this (border
// precision rule). Instead: a vertex of one part lying within NODE_EPS_DEG of another
// part's edge is inserted into that edge (its exact coordinates; the edge moves by less
// than NODE_EPS_DEG), so the shared stretch becomes exactly shared and a union dissolves
// it; then parts under SLIVER_MAX_M2 - zero-area spikes, not territory - are dropped.
const NODE_EPS_DEG = 1e-9; // ~0.1 mm
const SLIVER_MAX_M2 = 1;
function segDistDeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  if (t <= 0 || t >= 1) return Infinity; // only the edge's interior
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}
function nodeRing(ring, points) {
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    const on = points
      .filter((p) => !(p[0] === a[0] && p[1] === a[1]) && !(p[0] === b[0] && p[1] === b[1]) && segDistDeg(p, a, b) < NODE_EPS_DEG)
      .sort((p, q) => Math.hypot(p[0] - a[0], p[1] - a[1]) - Math.hypot(q[0] - a[0], q[1] - a[1]));
    out.push(...on, b);
  }
  return out;
}
function dissolveParts(geometry, label) {
  let parts = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  if (parts.length > 1) {
    const noded = parts.map((rings, i) => {
      const others = parts.flatMap((r, j) => (j === i ? [] : r.flat()));
      return rings.map((ring) => nodeRing(ring, others));
    });
    const merged = turf.getGeom(turf.union(turf.featureCollection(noded.map((rings) => turf.polygon(rings)))));
    parts = merged.type === "MultiPolygon" ? merged.coordinates : [merged.coordinates];
  }
  const kept = parts.filter((rings) => {
    const m2 = turf.area(turf.polygon(rings));
    if (m2 < SLIVER_MAX_M2 && parts.length > 1) {
      console.log(`  ${label}: dropped a ${m2.toFixed(3)} m2 sliver ${JSON.stringify(rings)}`);
      return false;
    }
    return true;
  }).map(([outer, ...holes]) => [outer, ...holes.filter((hole) => {
    const m2 = turf.area(turf.polygon([hole]));
    if (m2 < SLIVER_MAX_M2) {
      console.log(`  ${label}: dropped a ${m2.toFixed(3)} m2 sliver hole ${JSON.stringify(hole)}`);
      return false;
    }
    return true;
  })]);
  return kept.length === 1 ? { type: "Polygon", coordinates: kept[0] } : { type: "MultiPolygon", coordinates: kept };
}

// Raw CShapes records (set in main), for `notOnCShapes`.
let RAW_RECORDS = [];
// A piece "touches the sea" if the sea (anything outside the land mask) is within this distance.
const COAST_TOUCH_KM = 2;
function touchesSea(part, land, km) {
  const around = turf.buffer(part, km);
  const box = turf.bbox(around);
  const landHere = land.features.filter((l) => bboxesTouch(turf.bbox(l), box)).map((l) => turf.intersect(fc(asFeature(l.geometry), around))).filter(Boolean);
  if (!landHere.length) return true;
  const landUnion = landHere.length > 1 ? turf.union(fc(...landHere)) : landHere[0];
  const sea = turf.difference(fc(around, landUnion));
  return Boolean(sea) && turf.area(sea) > 1;
}

// The land BETWEEN two shapes a and b: the gap that a disc of radius maxGapKm rolled
// around the outside of both cannot enter (a morphological closing of a + b, minus a and
// b), kept only where it touches both. Unlike "within maxGapKm of both", this never
// reaches past either shape's outline into open land: where the gap opens onto land
// that belongs to neither (Turkey north of the sanjak and Syria, or the later Kuwait
// beside Saudi Arabia and the neutral zone), the fill stops inside the mouth instead of
// bulging out as a 3-5 km round cap. The sea counts as a wall, so a sliver that runs
// down to the coast is still filled. Buffers are only used to decide which land is a
// gap; the edges the fill shares with a and b are their own sourced lines.
const CLOSING_STEPS = 64; // segments per quarter circle: chord error ~0.2 m at 3-5 km
const TOUCH_KM = 0.001;
function gapBetween(a, b, maxGapKm, land) {
  const near = turf.intersect(fc(turf.buffer(a, maxGapKm), turf.buffer(b, maxGapKm)));
  if (!near) return null;
  // Work in a window around the candidate area (3x the radius past it), so the closing
  // only sees nearby edges and its window edge stays far from the area that is kept.
  const [w, s, e, n] = turf.bbox(turf.buffer(near, maxGapKm * 3));
  const win = turf.bboxPolygon([w, s, e, n]);
  const clipA = turf.intersect(fc(asFeature(turf.getGeom(a)), win));
  const clipB = turf.intersect(fc(asFeature(turf.getGeom(b)), win));
  if (!clipA || !clipB) return null;
  // The sea counts as a wall: a sliver between the two shapes that reaches the coast is
  // still between them (data/land-mask.json is the land; anything else in the window is sea).
  const winBox = turf.bbox(win);
  const landHere = land.features
    .filter((l) => bboxesTouch(turf.bbox(l), winBox))
    .map((l) => turf.intersect(fc(asFeature(l.geometry), win)))
    .filter(Boolean);
  const landUnion = landHere.length > 1 ? turf.union(fc(...landHere)) : landHere[0];
  const sea = landUnion ? turf.difference(fc(win, landUnion)) : win;
  const walls = [clipA, clipB, sea].filter(Boolean);
  const grown = turf.buffer(turf.union(fc(...walls)), maxGapKm, { steps: CLOSING_STEPS });
  const closed = grown && turf.buffer(grown, -maxGapKm, { steps: CLOSING_STEPS });
  let gap = closed && turf.intersect(fc(closed, near));
  gap = gap && turf.difference(fc(gap, clipA));
  gap = gap && turf.difference(fc(gap, clipB));
  if (!gap) return null;
  const touchA = turf.buffer(clipA, TOUCH_KM);
  const touchB = turf.buffer(clipB, TOUCH_KM);
  const g = turf.getGeom(gap);
  const parts = (g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]).filter((rings) => {
    const part = turf.polygon(rings);
    return turf.booleanIntersects(part, touchA) && turf.booleanIntersects(part, touchB);
  });
  if (!parts.length) return null;
  return parts.length === 1 ? turf.polygon(parts[0]) : turf.multiPolygon(parts);
}

function fittedGeometry(neighbour, overlay, others, mode, maxGapKm, land, spec) {
  const label = `${neighbour.properties.name} ${neighbour.properties.start_year}-${neighbour.properties.end_year}`;
  return dissolveParts(fittedGeometryRaw(neighbour, overlay, others, mode, maxGapKm, land, spec), label);
}

function fittedGeometryRaw(neighbour, overlay, others, mode, maxGapKm, land, spec) {
  if (mode === "contain") {
    return turf.getGeom(turf.union(fc(neighbour, overlay)));
  }
  let geom = turf.difference(fc(neighbour, overlay));
  if (!geom) throw new Error(`fit: ${neighbour.properties.name} vanished when clipped`);
  if (mode === "trim" || spec.trim) {
    const near = turf.buffer(overlay, maxGapKm);
    // Land this neighbour holds in a narrow strip between the overlay and another named
    // shape (e.g. a Turkish strip between the sanjak and Syria) is not its own either.
    const between = spec.between && others.find((o) => o.properties.name === spec.between);
    if (between) {
      const strip = gapBetween(overlay, between, maxGapKm, land);
      if (strip) geom = turf.difference(fc(geom, strip)) ?? geom;
    }
    const parts = turf.getGeom(geom).type === "MultiPolygon" ? turf.getGeom(geom).coordinates : [turf.getGeom(geom).coordinates];
    const kept = parts.filter((rings) => {
      const part = turf.polygon(rings);
      if (turf.area(part) / 1e6 >= TRIM_MAX_PIECE_KM2 || !turf.booleanIntersects(part, near)) return true;
      // `keepInland`: only pieces stranded along the coast are dropped; a piece inland is
      // the neighbour's own land on the far side of the overlay (Kuwait's wedge west of the
      // Saudi-Kuwaiti zone) and stays.
      return Boolean(spec.keepInland) && !touchesSea(part, land, COAST_TOUCH_KM);
    });
    geom = kept.length === 1 ? turf.polygon(kept[0]) : turf.multiPolygon(kept);
  }
  if (mode === "snap") {
    let sliver = gapBetween(overlay, asFeature(turf.getGeom(geom)), maxGapKm, land);
    sliver = sliver && turf.difference(fc(sliver, neighbour));
    // `notOnCShapes`: never fill land that CShapes gives that country in any of its records
    // (Saudi Arabia never takes land CShapes draws as Kuwait, even before Kuwait is on the map).
    if (spec.notOnCShapes) {
      for (const r of RAW_RECORDS.filter((f) => f.properties.cntry_name === spec.notOnCShapes)) sliver = sliver && turf.difference(fc(sliver, asFeature(r.geometry)));
    }
    for (const o of others) sliver = sliver && turf.difference(fc(sliver, o));
    // Only land: the buffers also reach into the sea between two coastlines.
    const onLand = sliver
      ? land.features.filter((l) => turf.booleanIntersects(l, sliver)).map((l) => turf.intersect(fc(asFeature(l.geometry), sliver))).filter(Boolean)
      : [];
    for (const piece of onLand) geom = turf.union(fc(geom, piece));
  }
  // Full precision: the fitted geometry is never rounded (see the border-precision rule).
  return turf.getGeom(geom);
}

function applyFits(features, land) {
  let out = features;
  for (const fit of CORRECTIONS.filter((c) => c.type === "fit")) {
    const overlays = out.filter((f) => f.properties.name.startsWith(fit.overlay));
    if (!overlays.length) throw new Error(`fit: no overlay named "${fit.overlay}..."`);
    for (const spec of fit.neighbours) {
      const next = [];
      for (const n of out) {
        if (n.properties.name !== spec.name) {
          next.push(n);
          continue;
        }
        // Year boundaries inside this neighbour's range where the overlay (or the spec window) changes.
        const lo = n.properties.start_year;
        const hi = n.properties.end_year;
        const cuts = new Set([lo]);
        for (const o of overlays) for (const y of [o.properties.start_year, o.properties.end_year + 1]) if (y > lo && y <= hi) cuts.add(y);
        for (const y of [spec.fromYear, spec.toYear != null ? spec.toYear + 1 : null]) if (y != null && y > lo && y <= hi) cuts.add(y);
        // "snap" and "between" also depend on the OTHER shapes near the overlay (the sliver may
        // only take land nobody else covers), and `others` is read at each piece's start year.
        // So the neighbour is also cut where such a shape appears or ends: otherwise a piece
        // fitted before that shape exists keeps land the shape later covers (Saudi Arabia's
        // 1935-1969 snap kept 63.6 km2 that CShapes' Kuwait, from 1961, also covers).
        if (spec.mode === "snap" || spec.between) {
          const reach = turf.bbox(turf.buffer(fc(...overlays), fit.maxGapKm * 2));
          for (const f of out) {
            if (f === n || f.properties.name === spec.name || overlays.includes(f)) continue;
            if (!bboxesTouch(turf.bbox(f), reach)) continue;
            for (const y of [f.properties.start_year, f.properties.end_year + 1]) if (y > lo && y <= hi) cuts.add(y);
          }
        }
        const starts = [...cuts].sort((a, b) => a - b);
        starts.forEach((s, i) => {
          const e = i + 1 < starts.length ? starts[i + 1] - 1 : hi;
          const piece = { ...n, properties: { ...n.properties, start_year: s, end_year: e } };
          SPLIT_FROM.set(piece, SPLIT_FROM.get(n) ?? n);
          const inWindow = s >= (spec.fromYear ?? -Infinity) && s <= (spec.toYear ?? Infinity);
          const overlay = inWindow && overlays.find((o) => activeIn(o, s));
          if (overlay && turf.booleanIntersects(piece, turf.buffer(overlay, fit.maxGapKm))) {
            const others = out.filter((f) => f !== n && f !== overlay && activeIn(f, s) && f.properties.name !== spec.name);
            piece.geometry = fittedGeometry(piece, overlay, others, spec.mode, fit.maxGapKm, land, spec);
            piece.properties.source = `${piece.properties.source}; edge fitted to the ${fit.overlay} shape (${fit.note})`;
          }
          next.push(piece);
        });
      }
      out = mergeRuns(next);
    }
  }
  return out;
}

// --- coastal gaps -----------------------------------------------------------------------
//
// The land mask (data/land-mask.json: Natural Earth 1:10m in the region, scripts/build-land.js)
// has its own coastline, which in places runs a little seaward of the shapes' coasts (CShapes,
// hand-digitized zones), leaving thin strips of land that no shape covers. Where a "fit"
// works this is fixed by one rule: in each year, a piece of land-mask land that no shape
// covers, that touches the sea and lies wholly within a fit's area (maxGapKm around the
// fit's overlay, in the overlay's years) goes to the shape it shares the most boundary with
// - the shape directly behind it - never to a shape it does not touch. A piece that reaches
// out of the area (a long coastal strip, or a country CShapes does not draw that year) stays
// blank. Every piece the rule adds is logged. Along the rest of the coast the strips are
// left as they are: applied everywhere, the rule would change almost every coastal shape.
const TOUCH_M = 1;
function ringSegments(geom) {
  const rings = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  const out = [];
  for (const r of rings) for (let i = 1; i < r.length; i++) out.push([r[i - 1], r[i]]);
  return out;
}
// Metres from point p to segment [a, b] (local equirectangular; fine at these distances).
function segMetres(p, a, b) {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy) * 111320;
}
// Length (m) of the piece's outline that runs along the shape's outline (within TOUCH_M).
function sharedBoundaryMetres(piece, shapeSegs) {
  let total = 0;
  const near = (p) => shapeSegs.some(([c, d]) => segMetres(p, c, d) <= TOUCH_M);
  for (const [a, b] of ringSegments(turf.getGeom(piece))) {
    if (near([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) && near(a) && near(b)) total += turf.distance(a, b, { units: "kilometers" }) * 1000;
  }
  return total;
}
function applyCoastalGaps(features, land) {
  const zones = CORRECTIONS.filter((c) => c.type === "fit").flatMap((fit) =>
    features.filter((f) => f.properties.name.startsWith(fit.overlay)).map((o) => {
      const area = turf.buffer(o, fit.maxGapKm);
      // A slightly larger window, so a blank piece that reaches out of the area is seen whole.
      const win = turf.bboxPolygon(turf.bbox(turf.buffer(area, 1)));
      const landHere = land.features.filter((l) => bboxesTouch(turf.bbox(l), turf.bbox(win)));
      return { o, area, win, box: turf.bbox(win), land: landHere, coast: landHere.flatMap((l) => ringSegments(l.geometry)) };
    }));
  const years = [...new Set(features.flatMap((f) => [f.properties.start_year, f.properties.end_year + 1]))].sort((a, b) => a - b);
  const added = new Map(); // feature -> Map(segment start year -> [pieces])
  for (let i = 0; i < years.length - 1; i++) {
    const y = years[i];
    if (y > 2026) break;
    for (const z of zones.filter((z) => activeIn(z.o, y))) {
      const shapes = features.filter((f) => activeIn(f, y) && bboxesTouch(turf.bbox(f), z.box));
      const clipped = shapes.map((f) => [f, turf.intersect(fc(asFeature(f.geometry), z.win))]).filter(([, c]) => c);
      for (const l of z.land) {
        let blank = turf.intersect(fc(asFeature(l.geometry), z.win));
        for (const [, c] of clipped) blank = blank && turf.difference(fc(blank, c));
        if (!blank) continue;
        const g = turf.getGeom(blank);
        const raws = (g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]).map((rings) => turf.polygon(rings));
        for (const piece of raws) {
          if (turf.area(piece) < 1) continue;
          if (!turf.booleanWithin(piece, z.area)) continue; // reaches out of the fit's area
          if (!(sharedBoundaryMetres(piece, z.coast) > 0)) continue; // no stretch on the coast: an inland hole
          const share = clipped.map(([f, c]) => [f, sharedBoundaryMetres(piece, ringSegments(turf.getGeom(c)))]).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]);
          const at = turf.centroid(piece).geometry.coordinates.map((v) => v.toFixed(4)).join(",");
          if (!share.length) continue;
          if (share.length > 1 && share[1][1] >= share[0][1] * 0.99) {
            console.log(`  coastal gap ${y}: ${(turf.area(piece) / 1e6).toFixed(3)} km2 at ${at} left blank: ${share[0][0].properties.name} and ${share[1][0].properties.name} border it equally`);
            continue;
          }
          const owner = share[0][0];
          if (!added.has(owner)) added.set(owner, new Map());
          const list = added.get(owner).get(y) ?? [];
          // The same piece can be found from two overlapping fit areas.
          if (!list.some((q) => JSON.stringify(q.geometry) === JSON.stringify(piece.geometry))) list.push(piece);
          added.get(owner).set(y, list);
        }
      }
    }
  }
  const out = [];
  for (const f of features) {
    const byYear = added.get(f);
    if (!byYear) { out.push(f); continue; }
    const lo = f.properties.start_year, hi = f.properties.end_year;
    const cuts = years.filter((y) => y >= lo && y <= hi);
    cuts.forEach((s, i) => {
      const e = i + 1 < cuts.length ? cuts[i + 1] - 1 : hi;
      const piece = { ...f, properties: { ...f.properties, start_year: s, end_year: e } };
      SPLIT_FROM.set(piece, SPLIT_FROM.get(f) ?? f);
      const pieces = byYear.get(s) ?? [];
      if (pieces.length) {
        let geom = asFeature(f.geometry);
        for (const q of pieces) {
          // Node each side's vertices into the other's edges first (as dissolveParts does), so
          // the shared stretch is exactly shared and the union leaves no crossing there.
          const gG = turf.getGeom(geom);
          const shapeRings = gG.type === "Polygon" ? [gG.coordinates] : gG.coordinates;
          const qRings = turf.getGeom(q).coordinates;
          const shapePts = shapeRings.flat(2);
          const qPts = qRings.flat();
          const nodedShape = shapeRings.map((rings) => rings.map((r) => nodeRing(r, qPts)));
          const nodedQ = qRings.map((r) => nodeRing(r, shapePts));
          geom = turf.union(fc(nodedShape.length === 1 ? turf.polygon(nodedShape[0]) : turf.multiPolygon(nodedShape), turf.polygon(nodedQ)));
        }
        piece.geometry = dissolveParts(turf.getGeom(geom), `${f.properties.name} ${s}-${e}`);
        piece.properties.source = `${piece.properties.source}; coastal strip of the map's land mask between this shape and the sea added (no source draws that coast)`;
        for (const q of pieces) console.log(`  coastal gap ${s}-${e}: ${(turf.area(q) / 1e6).toFixed(3)} km2 at ${turf.centroid(q).geometry.coordinates.map((v) => v.toFixed(4)).join(",")} -> ${f.properties.name}`);
      }
      out.push(piece);
    });
  }
  return mergeRuns(out);
}

// Splitting at every overlay period leaves consecutive pieces that came out identical
// (Gaza's periods all share one shape); join them back into one feature. Only pieces cut
// from the same original feature are joined, so CShapes' own records stay as they are.
const SPLIT_FROM = new WeakMap(); // piece -> the feature it was cut from
function mergeRuns(features) {
  const out = [];
  for (const f of features) {
    const origin = SPLIT_FROM.get(f);
    const prev = origin && out.findLast((g) => SPLIT_FROM.get(g) === origin && g.properties.end_year + 1 === f.properties.start_year);
    const same = (a, b) => JSON.stringify({ ...a.properties, start_year: 0, end_year: 0 }) === JSON.stringify({ ...b.properties, start_year: 0, end_year: 0 }) && JSON.stringify(a.geometry) === JSON.stringify(b.geometry);
    if (prev && same(prev, f)) prev.properties = { ...prev.properties, end_year: f.properties.end_year };
    else out.push(f);
  }
  return out;
}

main();
