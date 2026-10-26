import test from "node:test";
import assert from "node:assert/strict";
import { dropRepeatedPositions, dropRepeatedPositionsInGeometry } from "./ring-positions.js";

test("collinear vertices survive (turf.cleanCoords would drop [1,0])", () => {
  const ring = [[0, 0], [1, 0], [2, 0], [2, 1], [0, 0]];
  assert.deepEqual(dropRepeatedPositions(ring), ring);
});

test("only consecutive repeats are dropped", () => {
  const ring = [[0, 0], [1, 0], [1, 0], [2, 0], [2, 1], [2, 1], [2, 1], [0, 0]];
  assert.deepEqual(dropRepeatedPositions(ring), [[0, 0], [1, 0], [2, 0], [2, 1], [0, 0]]);
});

test("a non-consecutive revisit of a position is kept", () => {
  const ring = [[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 1], [0, 0]];
  assert.deepEqual(dropRepeatedPositions(ring), ring);
});

test("ring closure is kept, including when the closing position is repeated", () => {
  assert.deepEqual(dropRepeatedPositions([[0, 0], [1, 0], [1, 1], [0, 0], [0, 0]]), [[0, 0], [1, 0], [1, 1], [0, 0]]);
  assert.deepEqual(dropRepeatedPositions([[0, 0], [1, 0], [1, 1]]), [[0, 0], [1, 0], [1, 1], [0, 0]]);
});

test("a ring left with fewer than 4 positions collapses to null", () => {
  assert.equal(dropRepeatedPositions([[0, 0], [1, 0], [1, 0], [0, 0]]), null);
  assert.equal(dropRepeatedPositions([[0, 0], [0, 0], [0, 0], [0, 0]]), null);
});

test("geometry helper cleans every ring and keeps collinear vertices", () => {
  const poly = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [2, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] };
  assert.deepEqual(dropRepeatedPositionsInGeometry(poly).coordinates[0], [[0, 0], [1, 0], [2, 0], [2, 2], [0, 2], [0, 0]]);
  const multi = { type: "MultiPolygon", coordinates: [poly.coordinates, poly.coordinates] };
  assert.equal(dropRepeatedPositionsInGeometry(multi).coordinates.length, 2);
  assert.throws(() => dropRepeatedPositionsInGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [0, 0], [0, 0]]] }));
});
