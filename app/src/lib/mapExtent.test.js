import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAP_EXTENT } from "./mapExtent.js";

const [minLon, minLat, maxLon, maxLat] = MAP_EXTENT;
const inside = ({ lon, lat }) => lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;

test("MAP_EXTENT is a valid [minLon, minLat, maxLon, maxLat] box", () => {
  assert.equal(MAP_EXTENT.length, 4);
  assert.ok(MAP_EXTENT.every(Number.isFinite));
  assert.ok(minLon < maxLon && minLat < maxLat, "min before max");
  assert.ok(minLon >= -180 && maxLon <= 180, "longitudes in range");
  assert.ok(minLat >= -90 && maxLat <= 90, "latitudes in range");
});

test("MAP_EXTENT holds the region and the far-away signing places named in its comment", () => {
  assert.ok(inside({ lon: 35.2, lat: 31.8 }), "Jerusalem");
  assert.ok(inside({ lon: 51.4, lat: 35.7 }), "Tehran");
  assert.ok(inside({ lon: -77.04, lat: 38.9 }), "Washington, D.C. (2020 normalization agreements)");
});

// split-data.mjs fails the build on an event outside the extent (a marker there
// could never be panned to); this catches it in the unit tests already.
test("every curated event with coordinates lies inside MAP_EXTENT", () => {
  const events = JSON.parse(readFileSync(new URL("../../../data/events.json", import.meta.url), "utf8"));
  const located = events.filter((e) => e.coordinates);
  assert.ok(located.length > 0);
  assert.deepEqual(located.filter((e) => !inside(e.coordinates)).map((e) => e.id), []);
});
