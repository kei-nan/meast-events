// scripts/lib/geo.js latLonDistanceKm: the app's haversineKm with the pipeline's 6371 km radius.
import test from "node:test";
import assert from "node:assert/strict";
import { latLonDistanceKm, PIPELINE_EARTH_RADIUS_KM } from "./geo.js";
import { haversineKm, EARTH_RADIUS_KM } from "../../app/src/lib/geo.js";

test("latLonDistanceKm: { lat, lon } objects, the app's formula at the pipeline's 6371 km radius", () => {
  const jerusalem = { lat: 31.7683, lon: 35.2137 };
  const amman = { lat: 31.9454, lon: 35.9284 };
  assert.equal(PIPELINE_EARTH_RADIUS_KM, 6371);
  assert.equal(latLonDistanceKm(jerusalem, jerusalem), 0);
  assert.equal(latLonDistanceKm(jerusalem, amman), haversineKm(35.2137, 31.7683, 35.9284, 31.9454, 6371));
  assert.equal(latLonDistanceKm(jerusalem, amman), latLonDistanceKm(amman, jerusalem));
  // One degree of latitude at 6371 km: 2 * pi * 6371 / 360.
  assert.ok(Math.abs(latLonDistanceKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - (Math.PI * 6371) / 180) < 1e-9);
  // The app's default radius is the mean Earth radius; the ratio of the two is the ratio of the radii.
  const app = haversineKm(35.2137, 31.7683, 35.9284, 31.9454);
  assert.ok(Math.abs(app / latLonDistanceKm(jerusalem, amman) - EARTH_RADIUS_KM / 6371) < 1e-12);
});
