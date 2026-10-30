import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BOUNDS,
  DEFAULT_PADDING,
  NARROW_BOUNDS,
  NARROW_MAP_PX,
  defaultBounds,
  defaultCamera,
  mercatorX,
  mercatorY,
  openingPadding,
} from "./mapBase.js";
import { FALLBACK_PLACES } from "./fallbackPoint.js";
import { MAP_EXTENT } from "./mapExtent.js";

const toScreen = (cam, [lon, lat]) => [mercatorX(lon) * cam.worldSize - cam.x0, mercatorY(lat) * cam.worldSize - cam.y0];

test("Web Mercator matches known values", () => {
  assert.equal(mercatorX(0), 0.5);
  assert.equal(mercatorY(0), 0.5);
  assert.ok(Math.abs(mercatorY(85.0511287798) - 0) < 1e-9);
});

// Viewports from a small phone to 21:9 (lib/mapExtent.js NEAR_LAND_EXTENT).
const SIZES = [[320, 568], [390, 844], [768, 1024], [1060, 740], [1920, 1080], [3440, 1440], [568, 200]];

test("defaultCamera fits defaultBounds(width) inside the padding, touching it on one axis", () => {
  for (const [w, h] of SIZES) {
    const cam = defaultCamera(w, h);
    const bounds = defaultBounds(w);
    const [x0, y1] = toScreen(cam, bounds[0]);
    const [x1, y0] = toScreen(cam, bounds[1]);
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

test("defaultBounds: the tracked countries on a narrow map, the wider region otherwise", () => {
  assert.equal(defaultBounds(390), NARROW_BOUNDS);
  assert.equal(defaultBounds(NARROW_MAP_PX - 1), NARROW_BOUNDS);
  assert.equal(defaultBounds(NARROW_MAP_PX), DEFAULT_BOUNDS);
  assert.equal(defaultBounds(1440), DEFAULT_BOUNDS);
  assert.equal(defaultBounds(0), DEFAULT_BOUNDS); // not measured yet
});

// Each tracked country's reference point (scripts/lib/geo.js COUNTRY_CAPITALS,
// kept equal to FALLBACK_PLACES), and its far corners, are inside the narrow view.
test("NARROW_BOUNDS holds every tracked country", async () => {
  const { COUNTRY_CAPITALS } = await import("../../../scripts/lib/geo.js");
  const [[w, s], [e, n]] = NARROW_BOUNDS;
  const inside = ([lon, lat]) => lon >= w && lon <= e && lat >= s && lat <= n;
  for (const country of Object.keys(FALLBACK_PLACES)) {
    const c = COUNTRY_CAPITALS[country];
    assert.ok(c, country);
    const pt = Array.isArray(c) ? c : [c.lon, c.lat];
    assert.ok(inside(pt), `${country} ${pt}`);
  }
  // Egypt's western border, Iran's eastern tip, Yemen's south coast, Turkey's north coast.
  for (const pt of [[25, 26], [63.3, 27], [45, 12.6], [35, 42.1]]) assert.ok(inside(pt), String(pt));
});

test("the narrow view fills a phone's width far more than the wide one did", () => {
  const span = (cam, [[w], [e]]) => (mercatorX(e) - mercatorX(w)) * cam.worldSize;
  const narrow = defaultCamera(390, 680);
  const wide = defaultCamera(390, 680, { bounds: DEFAULT_BOUNDS });
  const region = [[25, 12], [63.3, 42.1]];
  assert.ok(span(narrow, region) > 1.5 * span(wide, region));
  assert.ok(span(narrow, region) <= 390 - 2 * DEFAULT_PADDING);
});

test("openingPadding: between the phone controls and the sheet, else all round", () => {
  assert.equal(openingPadding(855, 0), DEFAULT_PADDING); // wider screens: no sheet over the map
  assert.deepEqual(openingPadding(679, 99), { top: DEFAULT_PADDING, right: DEFAULT_PADDING, bottom: 119, left: DEFAULT_PADDING });
  // 200% zoom (640x400): a 280px map, the 99px sheet: the region above it.
  assert.deepEqual(openingPadding(280, 99), { top: DEFAULT_PADDING, right: DEFAULT_PADDING, bottom: 119, left: DEFAULT_PADDING });
  // 400% zoom: 136px of map, a 55px bar: too little above it.
  assert.equal(openingPadding(136, 55), DEFAULT_PADDING);
});

test("defaultCamera with uneven padding puts the bounds in the middle of what it leaves", () => {
  // 640x400 at 200% zoom: a 280px map, the lowered sheet over its bottom 99px.
  const [w, h] = [640, 280];
  const padding = openingPadding(h, 99);
  const cam = defaultCamera(w, h, { padding });
  const bounds = defaultBounds(w);
  const [x0, y1] = toScreen(cam, bounds[0]);
  const [x1, y0] = toScreen(cam, bounds[1]);
  const eps = 1e-6;
  assert.ok(y0 >= padding.top - eps && y1 <= h - padding.bottom + eps, `y ${y0}..${y1}`);
  assert.ok(x0 >= padding.left - eps && x1 <= w - padding.right + eps, `x ${x0}..${x1}`);
  // (Not quite centred across: maxBounds stops the view at 120°E, MapLibre's constrain step.)
  assert.ok(Math.abs(y0 - padding.top) < 1e-6 || Math.abs(x0 - padding.left) < 1e-6, "fitted");
});
