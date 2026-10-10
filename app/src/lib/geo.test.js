import test from "node:test";
import assert from "node:assert/strict";
import {
  circleBbox,
  destination,
  eventCoords,
  haversineKm,
  inArea,
  makeCircleArea,
  makeRectArea,
  normalizeBounds,
} from "./geo.js";

test("haversine: known distances", () => {
  assert.equal(haversineKm(10, 20, 10, 20), 0);
  // Jerusalem -> Amman is roughly 70-75 km
  const d = haversineKm(35.2137, 31.7683, 35.9106, 31.9454);
  assert.ok(d > 65 && d < 80, String(d));
  // one degree of latitude ~111.2 km
  assert.ok(Math.abs(haversineKm(0, 0, 0, 1) - 111.2) < 0.5);
});

test("destination: lands the given distance away along the bearing", () => {
  const start = [35.2137, 31.7683];
  for (const bearing of [0, 45, 90, 180, 270]) {
    const [lon, lat] = destination(start, bearing, 100);
    assert.ok(Math.abs(haversineKm(start[0], start[1], lon, lat) - 100) < 1e-6, String(bearing));
  }
  // due north keeps the longitude; due east and west mirror each other
  assert.ok(Math.abs(destination(start, 0, 100)[0] - start[0]) < 1e-9);
  assert.ok(destination(start, 0, 100)[1] > start[1]);
  const east = destination(start, 90, 50);
  const west = destination(start, 270, 50);
  assert.ok(Math.abs(east[0] - start[0] - (start[0] - west[0])) < 1e-9);
  const same = destination(start, 123, 0);
  assert.ok(Math.abs(same[0] - start[0]) < 1e-9 && Math.abs(same[1] - start[1]) < 1e-9);
});

test("circleBbox contains the circle and is clamped", () => {
  const [w, s, e, n] = circleBbox([35, 32], 100);
  assert.ok(w < 35 && e > 35 && s < 32 && n > 32);
  assert.ok(Math.abs(n - s - 2 * (100 / 111.19)) < 0.05);
  // the bbox edge due east is at least the radius away
  assert.ok(haversineKm(35, 32, e, 32) >= 99);
  // near the antimeridian / pole it widens to the full longitude span
  assert.deepEqual(circleBbox([179.5, 0], 200).filter((_, i) => i % 2 === 0), [-180, 180]);
  assert.deepEqual(circleBbox([0, 89], 500).filter((_, i) => i % 2 === 0), [-180, 180]);
  assert.equal(circleBbox([0, 89], 500)[3], 90);
});

test("inArea: rect and circle trimming", () => {
  const rect = makeRectArea([30, 30, 40, 40]);
  assert.ok(inArea({ lon: 35, lat: 35 }, rect));
  assert.ok(!inArea({ lon: 41, lat: 35 }, rect));
  const circle = makeCircleArea([35, 32], 100);
  assert.ok(inArea({ lon: 35, lat: 32.5 }, circle));
  // inside the bbox corner but outside the circle
  const [w, s] = circle.bbox;
  assert.ok(!inArea({ lon: w + 0.001, lat: s + 0.001 }, circle));
  assert.ok(inArea({ lon: 0, lat: 0 }, null));
});

test("eventCoords rejects missing/invalid", () => {
  assert.equal(eventCoords({}), null);
  assert.equal(eventCoords({ coordinates: null }), null);
  assert.equal(eventCoords({ coordinates: { lon: null, lat: 3 } }), null);
  assert.equal(eventCoords({ coordinates: { lon: "x", lat: 3 } }), null);
  assert.deepEqual(eventCoords({ coordinates: { lon: 0, lat: 0 } }), { lon: 0, lat: 0 });
});

test("normalizeBounds", () => {
  assert.deepEqual(normalizeBounds([1, 2, 3, 4]), [1, 2, 3, 4]);
  assert.deepEqual(normalizeBounds({ toArray: () => [[1, 2], [3, 4]] }), [1, 2, 3, 4]);
  assert.equal(normalizeBounds(null), null);
  assert.equal(normalizeBounds([1, 2, NaN, 4]), null);
});
