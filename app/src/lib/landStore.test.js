import test from "node:test";
import assert from "node:assert/strict";
import { cellsInBounds, createLandStore, wantsBackgroundDetail } from "./landStore.js";

const piece = (cell, tag) => ({ type: "Feature", properties: cell ? { cell, tag } : { tag }, geometry: null });
const fc = (...features) => ({ type: "FeatureCollection", features });
const tags = (store) => store.data().features.map((f) => f.properties.tag).sort();

test("light land goes in whole, every feature with a unique id", () => {
  const store = createLandStore();
  const { add } = store.addLow(fc(piece(null, "europe"), piece("35_30", "levant-a"), piece("35_30", "levant-b")));
  assert.equal(add.length, 3);
  assert.equal(new Set(add.map((f) => f.id)).size, 3);
  assert.deepEqual(tags(store), ["europe", "levant-a", "levant-b"]);
});

test("a cell's detail replaces exactly that cell's light pieces", () => {
  const store = createLandStore();
  const { add: light } = store.addLow(fc(piece("35_30", "levant-light"), piece("45_25", "gulf-light"), piece(null, "europe")));
  const { add, remove } = store.addDetail("35_30", fc(piece("35_30", "levant-10m-1"), piece("35_30", "levant-10m-2")));
  assert.deepEqual(remove, [light[0].id]);
  assert.equal(add.length, 2);
  assert.ok(add.every((f) => !light.some((l) => l.id === f.id)), "detail ids never reuse light ids");
  assert.deepEqual(tags(store), ["europe", "gulf-light", "levant-10m-1", "levant-10m-2"]);
  assert.ok(store.isDetailed("35_30"));
  assert.ok(!store.isDetailed("45_25"));
});

test("a cell is detailed once; a repeat is a no-op", () => {
  const store = createLandStore();
  store.addLow(fc(piece("35_30", "light")));
  store.addDetail("35_30", fc(piece("35_30", "10m")));
  assert.deepEqual(store.addDetail("35_30", fc(piece("35_30", "10m-again"))), { add: [], remove: [] });
  assert.deepEqual(tags(store), ["10m"]);
});

test("light pieces arriving after their cell's detail are skipped (never both)", () => {
  const store = createLandStore();
  store.addDetail("60_35", fc(piece("60_35", "10m")));
  const { add } = store.addLow(fc(piece("60_35", "late-light"), piece(null, "far")));
  assert.deepEqual(add.map((f) => f.properties.tag), ["far"]);
  assert.deepEqual(tags(store), ["10m", "far"]);
});

test("a cell with no land in its detail file still drops its light pieces", () => {
  const store = createLandStore();
  store.addLow(fc(piece("30_35", "light-only")));
  const { add, remove } = store.addDetail("30_35", fc());
  assert.equal(add.length, 0);
  assert.equal(remove.length, 1);
  assert.deepEqual(tags(store), []);
});

test("cellsInBounds: overlap on the grid, edges that only touch excluded", () => {
  const cells = ["30_30", "35_30", "40_30", "35_35"];
  assert.deepEqual(cellsInBounds(cells, 5, [34, 31, 36, 34]), ["30_30", "35_30"]);
  assert.deepEqual(cellsInBounds(cells, 5, [35, 30, 40, 35]), ["35_30"]);
  assert.deepEqual(cellsInBounds(cells, 5, [0, 0, 10, 10]), []);
});

test("wantsBackgroundDetail: off for save-data and 2G, on otherwise or when unknown", () => {
  assert.equal(wantsBackgroundDetail(undefined), true);
  assert.equal(wantsBackgroundDetail({ effectiveType: "4g" }), true);
  assert.equal(wantsBackgroundDetail({ effectiveType: "3g", saveData: false }), true);
  assert.equal(wantsBackgroundDetail({ effectiveType: "4g", saveData: true }), false);
  assert.equal(wantsBackgroundDetail({ effectiveType: "2g" }), false);
  assert.equal(wantsBackgroundDetail({ effectiveType: "slow-2g" }), false);
});
