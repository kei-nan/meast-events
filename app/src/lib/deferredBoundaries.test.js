import test from "node:test";
import assert from "node:assert/strict";
import {
  deferredRefsInView,
  drawableBoundaries,
  listedBoundaries,
  placeholderMembers,
  withGeometry,
} from "./deferredBoundaries.js";

const poly = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
const props = (name) => ({ name, start_year: 2000, end_year: 9999 });
const loaded = { type: "Feature", properties: props("Jordan"), geometry: poly };
const pending = (name, ref) => ({
  type: "Feature",
  properties: props(name),
  geometry: null,
  geometry_ref: ref,
  bbox: [34.9, 31.3, 35.6, 32.6],
  minzoom: 7,
});
const areaA = pending("Area A", "aaa");
const areaB = pending("Area B", "bbb");
const placeholder = {
  type: "Feature",
  properties: { ...props("West Bank"), placeholder_for: ["Area A", "Area B"] },
  geometry: poly,
};
const chunk = [loaded, areaA, areaB, placeholder];

test("drawableBoundaries: pending members hidden, placeholder drawn while any is pending", () => {
  assert.deepEqual(drawableBoundaries(chunk), [loaded, placeholder]);
  const oneIn = withGeometry(chunk, "aaa", poly);
  assert.deepEqual(drawableBoundaries(oneIn).map((f) => f.properties.name), ["Jordan", "Area A", "West Bank"]);
  const allIn = withGeometry(oneIn, "bbb", poly);
  assert.deepEqual(drawableBoundaries(allIn).map((f) => f.properties.name), ["Jordan", "Area A", "Area B"]);
});

test("drawableBoundaries and withGeometry keep untouched feature objects", () => {
  const next = withGeometry(chunk, "aaa", poly);
  assert.equal(next[0], loaded);
  assert.equal(next[2], areaB);
  assert.equal(next[1].geometry, poly);
  assert.equal(next[1].geometry_ref, undefined);
  assert.equal(next[1].minzoom, undefined);
  assert.equal(withGeometry(next, "aaa", poly), next, "nothing pending under that ref: same array");
});

test("listedBoundaries and placeholderMembers: the real features, never the placeholder", () => {
  assert.deepEqual(listedBoundaries(chunk), [loaded, areaA, areaB]);
  assert.deepEqual(placeholderMembers(placeholder, chunk), [areaA, areaB]);
});

test("deferredRefsInView: only at minzoom, over the bbox, in the feature's years", () => {
  const westBank = [34.5, 31, 36, 33];
  assert.deepEqual(deferredRefsInView(chunk, 2020, 6.9, westBank), []);
  assert.deepEqual(deferredRefsInView(chunk, 2020, 7, westBank), ["aaa", "bbb"]);
  assert.deepEqual(deferredRefsInView(chunk, 2020, 9, [40, 31, 45, 33]), [], "zoomed in elsewhere");
  assert.deepEqual(deferredRefsInView(chunk, 1999, 9, westBank), [], "not active that year");
  assert.deepEqual(deferredRefsInView(withGeometry(chunk, "aaa", poly), 2020, 9, westBank), ["bbb"]);
});
