import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BOUNDS, DEFAULT_PADDING, defaultCamera, mercatorX, mercatorY } from "./mapBase.js";
import { MAP_EXTENT } from "./mapExtent.js";

const toScreen = (cam, [lon, lat]) => [mercatorX(lon) * cam.worldSize - cam.x0, mercatorY(lat) * cam.worldSize - cam.y0];

test("Web Mercator matches known values", () => {
  assert.equal(mercatorX(0), 0.5);
  assert.equal(mercatorY(0), 0.5);
  assert.ok(Math.abs(mercatorY(85.0511287798) - 0) < 1e-9);
});

// Viewports from a small phone to 21:9 (lib/mapExtent.js NEAR_LAND_EXTENT).
const SIZES = [[320, 568], [390, 844], [768, 1024], [1060, 740], [1920, 1080], [3440, 1440], [568, 200]];

test("defaultCamera fits DEFAULT_BOUNDS inside the padding, touching it on one axis", () => {
  for (const [w, h] of SIZES) {
    const cam = defaultCamera(w, h);
    const [x0, y1] = toScreen(cam, DEFAULT_BOUNDS[0]);
    const [x1, y0] = toScreen(cam, DEFAULT_BOUNDS[1]);
    const eps = 1e-6;
    assert.ok(x0 >= DEFAULT_PADDING - eps && x1 <= w - DEFAULT_PADDING + eps, `${w}x${h} x ${x0}..${x1}`);
    assert.ok(y0 >= DEFAULT_PADDING - eps && y1 <= h - DEFAULT_PADDING + eps, `${w}x${h} y ${y0}..${y1}`);
    const tight = Math.abs(x0 - DEFAULT_PADDING) < 1e-6 || Math.abs(y0 - DEFAULT_PADDING) < 1e-6;
    assert.ok(tight, `${w}x${h} not fitted`);
  }
});

test("defaultCamera keeps the view inside MAP_EXTENT (MapLibre's maxBounds)", () => {
  const [minLon, minLat, maxLon, maxLat] = MAP_EXTENT;
  for (const [w, h] of [...SIZES, [400, 4000], [4000, 300]]) {
    const cam = defaultCamera(w, h);
    const [left, bottom] = toScreen(cam, [minLon, minLat]);
    const [right, top] = toScreen(cam, [maxLon, maxLat]);
    const eps = 1e-6;
    assert.ok(left <= eps && right >= w - eps && top <= eps && bottom >= h - eps, `${w}x${h}`);
  }
});
