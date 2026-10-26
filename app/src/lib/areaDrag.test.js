import test from "node:test";
import assert from "node:assert/strict";
import { MIN_RADIUS_KM, distanceKm, dragArea, handleBox, pickHandle } from "./areaDrag.js";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test("rect draw: the bbox spans start and pointer, whichever way it is dragged", () => {
  assert.deepEqual(dragArea({ kind: "rect", start: [35, 33] }, [30, 31]), { type: "rect", bbox: [30, 31, 35, 33] });
  assert.deepEqual(dragArea({ kind: "rect", start: [30, 31] }, [35, 33]), { type: "rect", bbox: [30, 31, 35, 33] });
});

test("rect corner edit: the opposite corner stays put", () => {
  const area0 = { type: "rect", bbox: [30, 31, 35, 33] };
  // Dragging the south-west corner keeps the north-east one.
  assert.deepEqual(dragArea({ kind: "sw", area0 }, [29, 30]).bbox, [29, 30, 35, 33]);
  assert.deepEqual(dragArea({ kind: "ne", area0 }, [36, 34]).bbox, [30, 31, 36, 34]);
  assert.deepEqual(dragArea({ kind: "se", area0 }, [36, 30]).bbox, [30, 30, 36, 33]);
  assert.deepEqual(dragArea({ kind: "nw", area0 }, [29, 34]).bbox, [29, 31, 35, 34]);
  // Past the opposite corner, the rectangle flips rather than turning inside out.
  assert.deepEqual(dragArea({ kind: "sw", area0 }, [36, 34]).bbox, [35, 33, 36, 34]);
});

test("circle draw: centre at the press, radius out to the pointer", () => {
  const a = dragArea({ kind: "circle", start: [35, 32] }, [36, 32]);
  assert.equal(a.type, "circle");
  assert.deepEqual(a.center, [35, 32]);
  assert.ok(near(a.radiusKm, distanceKm([35, 32], [36, 32])));
  assert.ok(a.radiusKm > 90 && a.radiusKm < 100);
  assert.equal(a.bbox.length, 4);
});

test("radius handle: resizes around the same centre, never below 0.1 km", () => {
  const area0 = { type: "circle", center: [35, 32], radiusKm: 50 };
  const grown = dragArea({ kind: "radius", area0 }, [37, 32]);
  assert.deepEqual(grown.center, [35, 32]);
  assert.ok(near(grown.radiusKm, distanceKm([35, 32], [37, 32])));
  // Dragged onto the centre itself: the floor.
  assert.equal(dragArea({ kind: "radius", area0 }, [35, 32]).radiusKm, MIN_RADIUS_KM);
  assert.equal(MIN_RADIUS_KM, 0.1);
});

test("centre handle: moves the circle, the radius unchanged", () => {
  const area0 = { type: "circle", center: [35, 32], radiusKm: 50 };
  const moved = dragArea({ kind: "center", area0 }, [40, 30]);
  assert.deepEqual(moved.center, [40, 30]);
  assert.equal(moved.radiusKm, 50);
});

test("handleBox: r px each way around the point", () => {
  assert.deepEqual(handleBox([100, 50], 10), [
    [90, 40],
    [110, 60],
  ]);
});

test("pickHandle: none, one, and the radius handle over the centre", () => {
  const h = (kind) => ({ properties: { kind } });
  assert.equal(pickHandle([]), null);
  assert.equal(pickHandle(null), null);
  assert.equal(pickHandle([h("center")]), "center");
  assert.equal(pickHandle([h("center"), h("radius")]), "radius");
  assert.equal(pickHandle([h("radius"), h("center")]), "radius");
  assert.equal(pickHandle([h("ne")]), "ne");
});
