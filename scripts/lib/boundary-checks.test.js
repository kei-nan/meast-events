import test from "node:test";
import assert from "node:assert/strict";
import { checkBoundaries, checkNameContinuity, checkProperties, findOverlaps } from "./boundary-checks.js";

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
  const { status, ...noStatus } = feature().properties;
  const r = checkProperties([{ ...feature(), properties: noStatus }]);
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings[0], /no "status" key/);

  const bad = checkProperties([feature({ name: "" }), feature({ start_year: 1960 }), { ...feature(), properties: { name: "B", start_year: 1, end_year: 2 } }]);
  assert.ok(bad.errors.some((e) => /name must be/.test(e)));
  assert.ok(bad.errors.some((e) => /start_year after end_year/.test(e)));
  assert.ok(bad.errors.some((e) => /missing "source"/.test(e)));
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
