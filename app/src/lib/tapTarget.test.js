import test from "node:test";
import assert from "node:assert/strict";
import { pickMarker } from "./tapTarget.js";

// Identity projection: coordinates are pixels.
const toPixel = ([x, y]) => ({ x, y });
const marker = (id, layer, x, y) => ({ id, layer: { id: layer }, geometry: { coordinates: [x, y] } });

test("no hits: nothing picked", () => {
  assert.equal(pickMarker([], { x: 0, y: 0 }, toPixel), null);
});

test("the marker nearest the press wins, whatever the draw order", () => {
  const far = marker("far", "unclustered-point", 10, 0);
  const near = marker("near", "clusters", 3, 4);
  assert.equal(pickMarker([far, near], { x: 0, y: 0 }, toPixel).id, "near");
  assert.equal(pickMarker([near, far], { x: 0, y: 0 }, toPixel).id, "near");
});

test("on a tie a regular dot beats the selected marker drawn over it", () => {
  const selected = marker("sel", "selected-point", 5, 5);
  const dot = marker("dot", "unclustered-point", 5, 5);
  assert.equal(pickMarker([selected, dot], { x: 0, y: 0 }, toPixel).id, "dot");
  assert.equal(pickMarker([dot, selected], { x: 0, y: 0 }, toPixel).id, "dot");
});

test("the selected marker is picked when it is the nearest", () => {
  const selected = marker("sel", "selected-point", 1, 1);
  const dot = marker("dot", "unclustered-point", 8, 8);
  assert.equal(pickMarker([dot, selected], { x: 0, y: 0 }, toPixel).id, "sel");
});
