import test from "node:test";
import assert from "node:assert/strict";
import { boundariesForYear, boundaryLabelsForYear, labelAnchor, ringAreaAndCentroid } from "./boundaryLabels.js";

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
  assert.deepEqual(labelAnchor(geometry), { area: 9, centroid: [11.5, 11.5] });
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
});
