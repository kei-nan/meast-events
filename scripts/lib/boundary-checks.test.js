import test from "node:test";
import assert from "node:assert/strict";
import {
  checkBoundaries,
  checkNameContinuity,
  checkProperties,
  findOverlaps,
  ringCrossings,
  findSelfIntersections,
  checkSelfIntersections,
  ACCEPTED_RING_CROSSINGS,
  decimals,
  geometryFingerprint,
  checkGeometryBaseline,
  coordinatesHash,
  baselineYears,
} from "./boundary-checks.js";

// The overlap tests need @turf/turf (repo-root devDependency). CI's "Validate boundaries" step
// runs this file after `npm ci`; the generic scripts/lib test step (and the refresh workflow)
// run before it, so there the geometry tests are skipped rather than failing on the import.
const turf = await import("@turf/turf").catch(() => null);
const needsTurf = { skip: !turf && "@turf/turf not installed (run npm ci at the repo root)" };

// A square of `d` degrees with its south-west corner at (lon, lat).
const square = (lon, lat, d = 1) => ({
  type: "Polygon",
  coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]],
});
const feature = (props, geometry = square(40, 30)) => ({
  type: "Feature",
  properties: { name: "A", start_year: 1900, end_year: 1950, status: null, source: "test", note: null, ...props },
  geometry,
});
const fc = (...features) => ({ type: "FeatureCollection", features });

test("checkProperties: a missing status key is a warning, missing name/years/source an error", () => {
  const { status: _status, ...noStatus } = feature().properties;
  const r = checkProperties([{ ...feature(), properties: noStatus }]);
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings[0], /no "status" key/);

  const bad = checkProperties([feature({ name: "" }), feature({ start_year: 1960 }), { ...feature(), properties: { name: "B", start_year: 1, end_year: 2 } }]);
  assert.ok(bad.errors.some((e) => /name must be/.test(e)));
  assert.ok(bad.errors.some((e) => /start_year after end_year/.test(e)));
  assert.ok(bad.errors.some((e) => /missing "source"/.test(e)));
});

test("checkProperties: a shape not from a CShapes record must name its geometry source", () => {
  const ok = [
    "Not in CShapes; https://en.wikipedia.org/wiki/X; Outline from Natural Earth 1:10m countries (public domain)",
    "Not in CShapes; https://en.wikipedia.org/wiki/X; Island outlines from Natural Earth 10m minor islands (public domain)",
    "Not a CShapes record; https://en.wikipedia.org/wiki/X; Outline derived from CShapes 2.0 (Schvitz et al., ETH Zurich, CC BY-NC-SA 4.0): a difference",
    "CShapes 2.0 (Schvitz et al., ETH Zurich, CC BY-NC-SA 4.0)",
  ];
  assert.deepEqual(checkProperties(ok.map((source) => feature({ source }))).errors, []);
  const noGeometry = checkProperties([feature({ source: "Not in CShapes; https://en.wikipedia.org/wiki/X" })]);
  assert.match(noGeometry.errors[0], /names no geometry source/);
  const noCredit = checkProperties([feature({ source: "Not a CShapes record; https://en.wikipedia.org/wiki/X; Outline from Natural Earth" })]);
  assert.match(noCredit.errors[0], /does not credit CShapes 2\.0/);
});

test("checkProperties: a corrected CShapes edge and land-mask land name their source", () => {
  const ok = [
    "Geometry corrected per https://x (see data/corrections-geometry.json): its border with Y is from Natural Earth (public domain); CShapes 2.0 for the rest",
    "CShapes 2.0; coastal strip of the map's land mask (Natural Earth 1:10m, public domain) between this shape and the sea added",
  ];
  assert.deepEqual(checkProperties(ok.map((source) => feature({ source }))).errors, []);
  const corrected = checkProperties([feature({ source: "Geometry corrected per https://x (see data/corrections-geometry.json); CShapes 2.0 for the rest" })]);
  assert.match(corrected.errors[0], /names no source for the corrected edge/);
  const mask = checkProperties([feature({ source: "CShapes 2.0; coastal strip of the map's land mask between this shape and the sea added" })]);
  assert.match(mask.errors[0], /does not name Natural Earth/);
});

test("checkProperties: unknown status values and bad geometry", () => {
  const r = checkProperties([feature({ status: "made-up" }), feature({ status: "mandate" }), { ...feature(), geometry: { type: "Point", coordinates: [1, 2] } }]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /made-up/);
  assert.match(r.errors[0], /geometry/);
});

test("checkNameContinuity: gaps are warnings, overlapping year ranges of one name are errors", () => {
  const gap = checkNameContinuity([feature({ end_year: 1989 }), feature({ start_year: 1992, end_year: 9999 })]);
  assert.deepEqual(gap.errors, []);
  assert.match(gap.warnings[0], /A: no shape for 1990-1991/);
  const touching = checkNameContinuity([feature({ end_year: 1989 }), feature({ start_year: 1990, end_year: 9999 })]);
  assert.deepEqual(touching, { errors: [], warnings: [] });
  const twice = checkNameContinuity([feature({ end_year: 1990 }), feature({ start_year: 1990, end_year: 9999 })]);
  assert.match(twice.errors[0], /overlap in years/);
});

test("findOverlaps: same-year overlaps found, other years and slivers ignored, -included overlays allowed", needsTurf, () => {
  const big = feature({ name: "Big", end_year: 9999 }, square(40, 30, 2));
  const halfOver = feature({ name: "Neighbour", start_year: 1940 }, square(41, 30, 2));
  const laterOnly = feature({ name: "Later", start_year: 1951, end_year: 1960 }, square(40, 30, 2));
  const sliver = feature({ name: "Sliver" }, square(41.99999, 30, 1));
  const { overlaps } = findOverlaps([big, halfOver, laterOnly], { turf });
  assert.equal(overlaps.length, 2); // Big x Neighbour (1940-1950), Big x Later (1951-1960); Neighbour x Later never share a year
  assert.ok(overlaps.every((o) => !o.intentional));
  assert.ok(overlaps.some((o) => o.years === "1940-1950" && o.km2 > 1000));
  const s = findOverlaps([big, sliver], { turf });
  assert.deepEqual([s.overlaps.length, s.slivers], [0, 1]);

  const container = feature({ name: "Israel", status: "occupied-territory-included", end_year: 9999 }, square(40, 30, 2));
  const flagged = feature({ name: "West Bank", status: "occupied-administered" }, square(40.5, 30.5, 0.5));
  const unflagged = feature({ name: "Plain", status: null }, square(40.5, 30.5, 0.5));
  const o = findOverlaps([container, flagged, unflagged], { turf }).overlaps;
  const pair = (n) => o.find((x) => x.a.startsWith("Israel") && x.b.startsWith(n));
  assert.equal(pair("West Bank").intentional, true);
  assert.equal(pair("Plain").intentional, false);
});

test("checkBoundaries: without turf only the structure is checked", () => {
  assert.match(checkBoundaries({ type: "Feature" }).errors[0], /FeatureCollection/);
  const r = checkBoundaries(fc(feature({ name: "X" }), feature({ name: "Y" })));
  assert.deepEqual([r.errors, r.warnings, r.overlaps], [[], [], null]);
  assert.throws(() => findOverlaps([]), /needs the @turf\/turf module/);
});

test("checkBoundaries: unexpected overlaps become warnings, structure errors skip geometry", needsTurf, () => {
  const r = checkBoundaries(fc(feature({ name: "X" }), feature({ name: "Y" })), { turf });
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings[0], /^overlap .* km2 in 1900-1950: X 1900-1950 x Y 1900-1950$/);
  assert.equal(checkBoundaries(fc(feature({ name: "" })), { turf }).overlaps, null);
});

test("ringCrossings: a bow tie crosses once; touching vertices and plain rings do not count", () => {
  // Bow tie: 0,0 -> 2,2 -> 2,0 -> 0,2 -> 0,0 crosses itself at (1, 1).
  const bowtie = [[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]];
  assert.deepEqual(ringCrossings(bowtie), [{ segments: [0, 2], at: [1, 1] }]);
  assert.deepEqual(ringCrossings(square(40, 30).coordinates[0]), []);
  // A ring that touches itself at a vertex (two lobes meeting at 1,1) is not a proper crossing.
  const touching = [[0, 0], [1, 1], [2, 0], [2, 2], [1, 1], [0, 2], [0, 0]];
  assert.deepEqual(ringCrossings(touching), []);
  // A spike that runs back along itself (collinear overlap) is not counted either.
  assert.deepEqual(ringCrossings([[0, 0], [2, 0], [1, 0], [1, 1], [0, 0]]), []);
});

test("findSelfIntersections / checkBoundaries: a crossing is an error, one per feature, listing ring, segments and place", () => {
  const holed = {
    type: "Polygon",
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[2, 2], [4, 4], [4, 2], [2, 4], [2, 2]], // a bow-tie hole
    ],
  };
  const r = findSelfIntersections([feature({ name: "Ok" }), feature({ name: "Bad" }, holed)]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].crossings, [{ polygon: 0, ring: 1, segments: [0, 2], at: [3, 3] }]);
  const res = checkBoundaries(fc(feature({ name: "Bad" }, holed)));
  assert.deepEqual(res.errors, ["self-intersection: Bad 1900-1950: 1 ring crossing(s): polygon 0 ring 1 (hole) segments 0/2 near (3, 3)"]);
  assert.deepEqual(res.warnings, []);
});

test("checkSelfIntersections: an accepted source crossing is a warning; a stale accepted entry is reported", () => {
  const bowtie = { type: "Polygon", coordinates: [[[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]]] };
  const accepted = [{ name: "Src", start_year: 1900, end_year: 1950, at: [1, 1], why: "in the source" }];
  const ok = checkSelfIntersections([feature({ name: "Src" }, bowtie)], accepted);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, ["accepted source self-intersection: Src 1900-1950: 1 ring crossing(s): polygon 0 ring 0 (outer) segments 0/2 near (1, 1)"]);
  // The same crossing in another feature is not covered by the entry.
  const other = checkSelfIntersections([feature({ name: "Ours" }, bowtie)], accepted);
  assert.equal(other.errors.length, 1);
  assert.deepEqual(other.warnings, ["accepted ring crossing no longer found: Src 1900-1950 near (1, 1); remove it from ACCEPTED_RING_CROSSINGS"]);
  // checkBoundaries passes the list through.
  assert.deepEqual(checkBoundaries(fc(feature({ name: "Src" }, bowtie)), { acceptedCrossings: accepted }).errors, []);
  // The committed list: every entry needs name, years, a reason and a 6-decimal place.
  for (const a of ACCEPTED_RING_CROSSINGS) {
    assert.ok(a.name && Number.isInteger(a.start_year) && Number.isInteger(a.end_year) && a.why, JSON.stringify(a));
    assert.deepEqual(a.at, a.at.map((v) => Math.round(v * 1e6) / 1e6));
  }
});

// A 6-decimal ring like the real data: 12 vertices around (35.5, 31.5), closed.
const detailed = () => {
  const ring = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI;
    ring.push([Number((35.5 + Math.cos(a) * 0.3 + 1e-6).toFixed(6)), Number((31.5 + Math.sin(a) * 0.3 + 1e-6).toFixed(6))]);
  }
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
};

test("decimals: counts the decimal places a coordinate is written with", () => {
  assert.equal(decimals(35), 0);
  assert.equal(decimals(31.5), 1);
  assert.equal(decimals(35.123456), 6);
  assert.equal(decimals(35.12345678901), 11);
  assert.equal(decimals(1e-7), 7);
});

test("checkGeometryBaseline: unchanged geometry passes; simplified, coarsened or missing features fail", () => {
  const original = [feature({ name: "Israel", start_year: 1967, end_year: 1978 }, detailed())];
  const baseline = geometryFingerprint(original);
  assert.deepEqual(baseline, {
    "Israel 1967-1978": { vertices: 13, fine: 26, sha256: coordinatesHash(detailed()) },
  });
  assert.match(baseline["Israel 1967-1978"].sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(checkGeometryBaseline(original, baseline), []);
  // Rounding 11-15 decimals down to 6 is allowed; it does not lose a 6-decimal value.
  assert.equal(geometryFingerprint([feature({}, { type: "Polygon", coordinates: [[[35.123456789012, 31.1], [35.123457, 31.2]]] })])["A 1900-1950"].fine, 2);

  // Simplified: every other vertex removed (ring still closed).
  const ring = detailed().coordinates[0];
  const thinned = ring.filter((_, i) => i % 2 === 0);
  const simplified = [feature({ name: "Israel", start_year: 1967, end_year: 1978 }, { type: "Polygon", coordinates: [thinned] })];
  assert.match(checkGeometryBaseline(simplified, baseline)[0], /^Israel 1967-1978: 13 -> 7 vertices \(simplified\?\)$/);

  // Coarsened: same vertices, coordinates rounded to 4 decimals.
  const rounded = ring.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]);
  const coarse = [feature({ name: "Israel", start_year: 1967, end_year: 1978 }, { type: "Polygon", coordinates: [rounded] })];
  assert.match(checkGeometryBaseline(coarse, baseline)[0], /coordinate values with >= 6 decimals 26 -> 0 \(coarsened\?\)/);

  // MultiPolygon parts count too; a feature gone from the file fails.
  const multi = [feature({ name: "Israel", start_year: 1967, end_year: 1978 }, { type: "MultiPolygon", coordinates: [detailed().coordinates] })];
  assert.deepEqual(geometryFingerprint(multi)["Israel 1967-1978"].vertices, 13);
  assert.deepEqual(checkGeometryBaseline(multi, geometryFingerprint(multi)), []);
  assert.match(checkGeometryBaseline([], baseline)[0], /no longer in the file/);

  // checkBoundaries reports it as an error when given the baseline.
  assert.match(checkBoundaries(fc(...coarse), { geometryBaseline: baseline }).errors[0], /coarsened/);
});

test("checkGeometryBaseline: a moved, added or reordered vertex fails on the coordinates hash, naming the feature", () => {
  const kuwait = (geometry) => [feature({ name: "Kuwait", start_year: 1992, end_year: 9999 }, geometry)];
  const baseline = geometryFingerprint(kuwait(detailed()));

  // Identical data (a fresh copy, as a re-read of the file gives) passes.
  assert.deepEqual(checkGeometryBaseline(kuwait(structuredClone(detailed())), baseline), []);

  // One vertex moved about 7 km east (0.07 degrees of longitude), still 6 decimals: the vertex
  // and fine-decimal counts are unchanged, so only the hash catches it.
  const moved = detailed();
  moved.coordinates[0][3] = [Number((moved.coordinates[0][3][0] + 0.07).toFixed(6)), moved.coordinates[0][3][1]];
  assert.deepEqual(
    { vertices: geometryFingerprint(kuwait(moved))["Kuwait 1992-present"].vertices, fine: geometryFingerprint(kuwait(moved))["Kuwait 1992-present"].fine },
    { vertices: 13, fine: 26 }
  );
  const errors = checkGeometryBaseline(kuwait(moved), baseline);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^Kuwait 1992-present: coordinates changed \(same 13 vertices; sha256 [0-9a-f]{12} -> [0-9a-f]{12}\)/);
  assert.match(errors[0], /accept it with node scripts\/validate-boundaries\.js --write-geometry-baseline$/);
  // A moved vertex is also an error through checkBoundaries.
  assert.match(checkBoundaries(fc(...kuwait(moved)), { geometryBaseline: baseline }).errors[0], /coordinates changed/);

  // A vertex added (more vertices, finer is not enough on its own any more) fails too.
  const added = detailed();
  added.coordinates[0].splice(1, 0, [35.812345, 31.512345]);
  assert.match(checkGeometryBaseline(kuwait(added), baseline)[0], /coordinates changed \(13 -> 14 vertices;/);

  // A ring started at another vertex (same positions, different order) fails.
  const ring = detailed().coordinates[0].slice(0, -1);
  const rotated = [...ring.slice(1), ring[0], ring[1]];
  assert.match(checkGeometryBaseline(kuwait({ type: "Polygon", coordinates: [rotated] }), baseline)[0], /coordinates changed/);

  // A shape not in the baseline fails until the baseline is rewritten.
  const extra = [...kuwait(detailed()), feature({ name: "Bahrain", start_year: 1971, end_year: 9999 })];
  assert.deepEqual(checkGeometryBaseline(extra, baseline), [
    "Bahrain 1971-present: not in the geometry baseline (a new shape); if it is approved, accept it with node scripts/validate-boundaries.js --write-geometry-baseline",
  ]);

  // Rewriting the baseline on purpose (what --write-geometry-baseline does) accepts the change.
  const rewritten = geometryFingerprint(kuwait(moved));
  assert.notEqual(rewritten["Kuwait 1992-present"].sha256, baseline["Kuwait 1992-present"].sha256);
  assert.deepEqual(checkGeometryBaseline(kuwait(moved), rewritten), []);
  assert.deepEqual(checkGeometryBaseline(extra, geometryFingerprint(extra)), []);
  // ...and the original geometry then fails against the rewritten baseline.
  assert.match(checkGeometryBaseline(kuwait(detailed()), rewritten)[0], /coordinates changed/);
});

test("coordinatesHash: the sha256 of the coordinates text as the boundaries file writes it", async () => {
  const { createHash } = await import("node:crypto");
  const { stringifyFeatureCollection } = await import("./json-lines.js");
  const f = feature({}, { type: "Polygon", coordinates: [[[35.123456, 31.000001], [35.5, 31.25], [1e-7, 31], [35.123456, 31.000001]]] });
  const line = stringifyFeatureCollection(fc(f)).split("\n")[1];
  const text = line.slice(line.indexOf('"coordinates":') + '"coordinates":'.length, -2);
  assert.equal(coordinatesHash(JSON.parse(line).geometry), createHash("sha256").update(text).digest("hex"));
});

test("baselineYears: at least one year inside every distinct period, few years, stable over time", () => {
  const f = (start_year, end_year) => feature({ name: `N${start_year}-${end_year}`, start_year, end_year });
  const features = [f(1900, 1966), f(1967, 1978), f(1979, 1999), f(1995, 1999), f(1970, 1981), f(2007, 2022), f(2023, 2025), f(2026, 9999), f(1950, 9999)];
  const years = baselineYears(features);
  for (const { properties: p } of features) assert.ok(years.some((y) => p.start_year <= y && y <= p.end_year), `${p.start_year}-${p.end_year}`);
  assert.deepEqual(years, [1966, 1978, 1999, 2022, 2025, 2026]);
});

test("baselineYears: the committed boundaries put every feature into a year of the committed baseline", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf-8"));
  const { features } = await read("../../data/boundaries.json");
  const years = Object.keys((await read("../../data/border-check-baseline.json")).years).map(Number);
  for (const y of baselineYears(features)) assert.ok(years.includes(y), `${y} missing: node scripts/verify-borders.js --write-baseline`);
  for (const { properties: p } of features) {
    assert.ok(years.some((y) => p.start_year <= y && y <= p.end_year), `${p.name} ${p.start_year}-${p.end_year} is in no baseline year`);
  }
});
