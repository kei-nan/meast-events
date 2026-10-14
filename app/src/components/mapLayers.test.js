import test from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_COLORS,
  CATEGORY_COLOR_EXPRESSION,
  EMPTY_FC,
  areaGeoJSON,
  circleBbox,
  eventFeature,
  eventSignature,
  eventsToGeoJSON,
  formatKm,
  makeCircleArea,
  makeRectArea,
  oppositeCorner,
  pointFeature,
} from "./mapLayers.js";
import { haversineKm, inArea, makeCircleArea as geoMakeCircleArea } from "../lib/geo.js";

const ev = (id, extra = {}) => ({
  id,
  category: "war",
  title: `T ${id}`,
  date_start: "1948-05-15",
  coordinates: { lon: 35, lat: 31 },
  location_quality: "precise",
  ...extra,
});

test("eventSignature: only the search flags", () => {
  assert.equal(eventSignature(ev("a"), null), "-");
  assert.equal(eventSignature(ev("a"), new Set(["a"])), "s1");
  assert.equal(eventSignature(ev("a"), new Set(["b"])), "s0");
  // It must change exactly when eventFeature's m/s properties do.
  for (const ids of [null, new Set(["a"]), new Set()]) {
    const sig = eventSignature(ev("a"), ids);
    const { m, s } = eventFeature(ev("a"), ids).properties;
    assert.equal(sig, s ? `s${m}` : "-");
  }
});

test("eventFeature properties and [lon, lat] order", () => {
  const f = eventFeature(ev("a", { date_end: "1949-03-10", location_quality: "approximate" }), null);
  assert.deepEqual(f, {
    type: "Feature",
    properties: { id: "a", category: "war", title: "T a", y: "1948–1949", m: 1, s: 0, a: 1 },
    geometry: { type: "Point", coordinates: [35, 31] },
  });
  assert.deepEqual(eventFeature(ev("a"), new Set()).properties.m, 0);
});

test("eventsToGeoJSON skips events without coordinates, keeps order", () => {
  const fc = eventsToGeoJSON([ev("a"), ev("b", { coordinates: null }), ev("c")], new Set(["c"]));
  assert.equal(fc.type, "FeatureCollection");
  assert.deepEqual(
    fc.features.map((f) => [f.properties.id, f.properties.m, f.properties.s]),
    [
      ["a", 0, 1],
      ["c", 1, 1],
    ]
  );
  assert.deepEqual(eventsToGeoJSON([], null).features, []);
});

test("pointFeature", () => {
  assert.equal(pointFeature(null), EMPTY_FC);
  assert.equal(pointFeature(ev("a", { coordinates: null })), EMPTY_FC);
  assert.deepEqual(pointFeature(ev("a")).features[0].properties, { id: "a", category: "war", a: 0 });
});

test("every category has a colour in the paint expression; unknown falls back", () => {
  const [op, , ...rest] = CATEGORY_COLOR_EXPRESSION;
  assert.equal(op, "match");
  assert.equal(rest.length, Object.keys(CATEGORY_COLORS).length * 2 + 1);
  assert.equal(new Set(Object.values(CATEGORY_COLORS)).size, Object.keys(CATEGORY_COLORS).length);
  assert.match(rest.at(-1), /^#[0-9a-f]{6}$/);
});

test("areaGeoJSON: none, rect and circle", () => {
  assert.deepEqual(areaGeoJSON(null), { shape: EMPTY_FC, handles: EMPTY_FC, label: EMPTY_FC });

  const rect = areaGeoJSON(makeRectArea([40, 35], [30, 25]));
  assert.deepEqual(rect.shape.features[0].geometry.coordinates[0], [
    [30, 25],
    [40, 25],
    [40, 35],
    [30, 35],
    [30, 25],
  ]);
  assert.deepEqual(rect.handles.features.map((f) => f.properties.kind), ["sw", "se", "ne", "nw"]);
  assert.equal(rect.label, EMPTY_FC);
  assert.equal(areaGeoJSON(makeRectArea([30, 25], [40, 35]), false).handles, EMPTY_FC);

  const center = [35, 31];
  const circle = areaGeoJSON(makeCircleArea(center, 250));
  const ring = circle.shape.features[0].geometry.coordinates[0];
  assert.equal(ring.length, 73);
  assert.deepEqual(ring[0], ring.at(-1));
  for (const [lon, lat] of ring) assert.ok(Math.abs(haversineKm(center[0], center[1], lon, lat) - 250) < 1e-6);
  assert.deepEqual(circle.handles.features.map((f) => f.properties.kind), ["radius", "center"]);
  assert.deepEqual(circle.handles.features[1].geometry.coordinates, center);
  assert.equal(circle.label.features[0].properties.text, "r = 250 km");
});

test("formatKm and oppositeCorner", () => {
  assert.equal(formatKm(99.94), "99.9 km");
  assert.equal(formatKm(100), "100 km");
  assert.equal(formatKm(1234.5), "1235 km");
  const b = [30, 25, 40, 35];
  assert.deepEqual(oppositeCorner(b, "sw"), [40, 35]);
  assert.deepEqual(oppositeCorner(b, "ne"), [30, 25]);
  assert.deepEqual(oppositeCorner(b, "se"), [30, 35]);
  assert.deepEqual(oppositeCorner(b, "nw"), [40, 25]);
});

test("circleBbox matches lib/geo.js", () => {
  for (const [c, r] of [
    [[35, 31], 250],
    [[51, 25], 1200],
    [[-5, 36], 40],
    [[35, 31], 7000],
    [[115, 20], 3000],
  ]) {
    const a = circleBbox(c, r);
    const b = geoMakeCircleArea(c, r).bbox;
    a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${c} ${r}: ${a} vs ${b}`));
  }
});

// MapView draws circles with this makeCircleArea and urlState restores them
// with geo.makeCircleArea; lib/ranking.js prefilters on area.bbox, so both must
// give the same box, also for a circle that reaches past the North Pole.
test("a circle over the pole keeps every point inside it", () => {
  const drawn = makeCircleArea([40, 70], 4000);
  const fromUrl = geoMakeCircleArea([40, 70], 4000);
  const dueNorth = { lon: 40, lat: 75 }; // 556 km from the centre
  assert.ok(haversineKm(40, 70, dueNorth.lon, dueNorth.lat) < 600);
  assert.equal(inArea(dueNorth, fromUrl), true);
  assert.equal(inArea(dueNorth, drawn), true);
  assert.deepEqual(drawn.bbox, fromUrl.bbox);
});
