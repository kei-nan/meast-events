import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boundariesForYear, boundaryLabelsForYear, labelAnchor, overlayGeometries, ringAreaAndCentroid } from "./boundaryLabels.js";
import { isIncludedStatus } from "../components/mapBorders.js";
import { deferredBoundaryGroups } from "../../scripts/split-data.mjs";

const square = (x, y, size) => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];
const feature = (name, start_year, end_year, geometry) => ({ type: "Feature", properties: { name, start_year, end_year }, geometry });

test("ringAreaAndCentroid: square area and centre, either winding", () => {
  const ring = square(10, 20, 4);
  assert.deepEqual(ringAreaAndCentroid(ring), { area: 16, centroid: [12, 22] });
  assert.deepEqual(ringAreaAndCentroid([...ring].reverse()), { area: 16, centroid: [12, 22] });
});

test("ringAreaAndCentroid: a collinear ring falls back to the average point", () => {
  const { area, centroid } = ringAreaAndCentroid([[0, 0], [1, 1], [2, 2], [0, 0]]);
  assert.equal(area, 0);
  assert.deepEqual(centroid, [0.75, 0.75]);
});

test("labelAnchor: a MultiPolygon is labelled at its largest part", () => {
  const geometry = { type: "MultiPolygon", coordinates: [[square(0, 0, 1)], [square(10, 10, 3)]] };
  assert.deepEqual(labelAnchor(geometry), { area: 9, centroid: [11.5, 11.5], room: 1.5 });
  assert.equal(labelAnchor({ type: "Polygon", coordinates: [[[0, 0], [1, 1]]] }), null);
});

test("boundariesForYear: start and end years are inclusive", () => {
  const f = feature("A", 1920, 1930, { type: "Polygon", coordinates: [square(0, 0, 1)] });
  for (const [year, n] of [[1919, 0], [1920, 1], [1930, 1], [1931, 0]]) {
    assert.equal(boundariesForYear(year, [f]).features.length, n, `year ${year}`);
  }
});

test("boundaryLabelsForYear: one point per active territory, degenerate shapes dropped", () => {
  const features = [
    feature("Big", 1900, 2000, { type: "MultiPolygon", coordinates: [[square(0, 0, 20)], [square(50, 50, 1)]] }),
    feature("Gone", 1900, 1910, { type: "Polygon", coordinates: [square(0, 0, 1)] }),
    feature("Broken", 1900, 2000, { type: "Polygon", coordinates: [[]] }),
  ];
  const labels = boundaryLabelsForYear(1950, features).features;
  assert.equal(labels.length, 1);
  assert.deepEqual(labels[0].geometry, { type: "Point", coordinates: [10, 10] });
  assert.equal(labels[0].properties.name, "Big");
  assert.equal(labels[0].properties.big, 1); // sqrt(400) / 20, capped at 1
  assert.equal(labels[0].properties.room, 10); // the 20-degree square's centre, 10 to each edge
});

test("labelAnchor: room is the smaller reach above or below the anchor, on the largest part", () => {
  // A triangle: centroid at a third of its height, so less room below than above.
  const tri = [[0, 0], [6, 0], [3, 9], [0, 0]];
  const a = labelAnchor({ type: "MultiPolygon", coordinates: [[tri], [square(50, 50, 30)]] });
  assert.equal(a.room, 15); // the 30-degree square wins on area
  assert.equal(labelAnchor({ type: "Polygon", coordinates: [tri] }).room, 3);
});

test("isDashedStatus: an '...-included' status keeps the outline solid", async () => {
  const { isDashedStatus } = await import("../components/mapBorders.js");
  assert.equal(isDashedStatus(null), false);
  assert.equal(isDashedStatus("occupied-administered"), true);
  assert.equal(isDashedStatus("mandate"), true);
  assert.equal(isDashedStatus("occupied-territory-included"), false);
  assert.equal(isDashedStatus("shared-sovereignty-included"), false);
});

// ---- Anchors on the shape itself ------------------------------------------

// Even-odd point-in-polygon, written separately from the module's own.
function pointInGeometry([x, y], geometry) {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  let inside = false;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
  }
  return inside;
}

test("labelAnchor: a centroid off the shape (a U) moves onto it", () => {
  const u = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10], [0, 0]];
  const { centroid } = ringAreaAndCentroid(u);
  assert.equal(pointInGeometry(centroid, { type: "Polygon", coordinates: [u] }), false); // in the notch
  const a = labelAnchor({ type: "Polygon", coordinates: [u] });
  assert.ok(pointInGeometry(a.centroid, { type: "Polygon", coordinates: [u] }), `${a.centroid}`);
  assert.equal(a.area, 72); // area and so size and priority are unchanged
});

test("labelAnchor: a centroid in a hole moves off the hole", () => {
  const geometry = { type: "Polygon", coordinates: [square(0, 0, 10), square(3, 3, 4)] };
  const a = labelAnchor(geometry);
  assert.ok(pointInGeometry(a.centroid, geometry), `${a.centroid}`);
  // Room is then the reach straight up and down to an edge, the hole's included.
  const [x, y] = a.centroid;
  const reach = x > 3 && x < 7 ? Math.min(y < 3 ? 3 - y : y - 7, y < 3 ? y : 10 - y) : Math.min(y, 10 - y);
  assert.ok(Math.abs(a.room - reach) < 1e-9, `room ${a.room}, reach ${reach}`);
});

test("labelAnchor: the anchor avoids the shapes drawn over it, room measured to their edges", () => {
  const geometry = { type: "Polygon", coordinates: [square(0, 0, 10)] };
  const over = [{ type: "Polygon", coordinates: [[[3, 0], [10, 0], [10, 10], [3, 10], [3, 0]]] }];
  const a = labelAnchor(geometry, over);
  assert.ok(a.centroid[0] > 0 && a.centroid[0] < 3, `${a.centroid}`);
  assert.ok(Math.abs(a.centroid[0] - 1.5) < 0.05, "the middle of the free strip");
  assert.ok(Math.abs(a.room - Math.min(a.centroid[1], 10 - a.centroid[1])) < 1e-9);
  assert.equal(a.area, 100);
  // An overlay away from the centroid leaves it where it was.
  assert.deepEqual(labelAnchor(geometry, [{ type: "Polygon", coordinates: [square(8, 8, 1)] }]), {
    area: 100,
    centroid: [5, 5],
    room: 5,
  });
  // Nothing left uncovered: the centroid stays rather than an invented point.
  assert.deepEqual(labelAnchor(geometry, [{ type: "Polygon", coordinates: [square(-1, -1, 12)] }]).centroid, [5, 5]);
});

test("overlayGeometries/boundaryLabelsForYear: an '...-included' shape's name goes off the shapes drawn over it", () => {
  const included = { ...feature("Big", 1900, 2000, { type: "Polygon", coordinates: [square(0, 0, 10)] }) };
  included.properties.status = "occupied-territory-included";
  const over = feature("Over", 1900, 2000, { type: "Polygon", coordinates: [[[4, 0], [10, 0], [10, 10], [4, 10], [4, 0]]] });
  const plain = feature("Plain", 1900, 2000, { type: "Polygon", coordinates: [square(2, 2, 6)] });
  assert.deepEqual(overlayGeometries(included, [included, over]), [over.geometry]);
  assert.deepEqual(overlayGeometries(over, [included, over]), []); // only an "...-included" shape has shapes over it
  assert.deepEqual(overlayGeometries(plain, [plain, over]), []);
  const labels = boundaryLabelsForYear(1950, [included, over]).features;
  const at = Object.fromEntries(labels.map((l) => [l.properties.name, l.geometry.coordinates]));
  assert.ok(at.Big[0] < 4, `Big at ${at.Big}`);
  assert.deepEqual(at.Over, [7, 5]);
  // Asked again (every year change), the same answer.
  assert.deepEqual(boundaryLabelsForYear(1951, [included, over]).features, labels);
});

// Every territory label of every year in data/boundaries.json lies on its own
// shape (holes excluded) and not on another shape drawn that year - except
// where the label's own shape is drawn over an "...-included" one (the West
// Bank, Gaza and the Golan over Israel from 1967): there lying inside the
// shape underneath is what being drawn over it means. Checked twice from 2000:
// with OCHA's Areas A, B and C, and with the "West Bank" outline the map draws
// in their place below their zoom (DEFERRED_GROUPS in scripts/split-data.mjs).
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");
const boundaries = JSON.parse(readFileSync(path.join(DATA_DIR, "boundaries.json"), "utf8")).features;

test("data: every label anchor, 1900-2026, is on its own shape and under no shape drawn over it", () => {
  const { members, placeholders } = deferredBoundaryGroups(boundaries);
  const variants = {
    "zoomed in": boundaries,
    "below the deferred zoom": [...boundaries.filter((f) => !members.has(f)), ...placeholders],
  };
  const problems = [];
  let checked = 0;
  for (const [variant, features] of Object.entries(variants)) {
    for (let year = 1900; year <= 2026; year++) {
      const active = boundariesForYear(year, features).features;
      for (const label of boundaryLabelsForYear(year, active).features) {
        const own = active.find((f) => f.properties.name === label.properties.name);
        const pt = label.geometry.coordinates;
        checked++;
        if (!pointInGeometry(pt, own.geometry)) problems.push(`${variant} ${year} ${own.properties.name}: off its own shape at ${pt}`);
        for (const other of active) {
          if (other === own || !pointInGeometry(pt, other.geometry)) continue;
          const drawnOverOther = isIncludedStatus(other.properties.status) && !isIncludedStatus(own.properties.status);
          if (!drawnOverOther) problems.push(`${variant} ${year} ${own.properties.name}: on ${other.properties.name} at ${pt}`);
        }
      }
    }
  }
  assert.ok(checked > 4000, `checked ${checked}`);
  assert.deepEqual(problems, []);
});

test("data: Israel's name is off the West Bank, Gaza and the Golan in every year", () => {
  for (const year of [1950, 1967, 1985, 2000, 2010, 2024, 2026]) {
    const active = boundariesForYear(year, boundaries).features;
    const israel = boundaryLabelsForYear(year, active).features.find((l) => l.properties.name === "Israel");
    const on = active.filter((f) => f.properties.name !== "Israel" && pointInGeometry(israel.geometry.coordinates, f.geometry));
    assert.deepEqual(on.map((f) => f.properties.name), [], `${year}`);
  }
});
