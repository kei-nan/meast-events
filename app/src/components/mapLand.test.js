import test from "node:test";
import assert from "node:assert/strict";
import { moduleUrl, registerRenderHooks } from "../lib/testing/render.mjs";

// mapLand.js against a fake map, with the data loaders stubbed (they delegate to
// globalThis.__land, set per test): which land loads when.
registerRenderHooks({
  "../lib/dataClient": moduleUrl(
    "export const loadFarLand = (...a) => globalThis.__land.far(...a); export const loadLandCell = (...a) => globalThis.__land.cell(...a);"
  ),
});
const { startLandLoading } = await import("./mapLand.js");

const CELLS = ["30_25", "35_25", "35_30", "40_30", "50_25"];
const fc = (n) => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: { n }, geometry: null }] });

function setup({ zoom = 3, bounds = [34, 29, 37, 33], finePointer = false, near = { cells: CELLS, cellSize: 5 } } = {}) {
  const once = {};
  const on = {};
  const updates = [];
  const requested = { far: 0, cells: [] };
  globalThis.__land = {
    far: async () => (requested.far++, fc("far")),
    cell: async (c) => (requested.cells.push(c), fc(c)),
  };
  globalThis.window = { matchMedia: (q) => ({ matches: q.includes("fine") ? finePointer : false }), requestIdleCallback: (f) => setTimeout(f) };
  // Node's own navigator has no `connection` (no Network Information API), the case under test.
  assert.equal(globalThis.navigator?.connection, undefined);
  const view = { zoom, bounds };
  const map = {
    once: (t, f) => (once[t] = f),
    on: (t, f) => ((on[t] ??= []).push(f)),
    off: (t, f) => (on[t] = (on[t] ?? []).filter((g) => g !== f)),
    getZoom: () => view.zoom,
    getBounds: () => ({ getWest: () => view.bounds[0], getSouth: () => view.bounds[1], getEast: () => view.bounds[2], getNorth: () => view.bounds[3] }),
    getCenter: () => ({ lng: 36, lat: 31 }),
    getSource: () => ({ updateData: async (u) => updates.push(u) }),
  };
  const store = {
    addLow: () => ({ add: ["low"] }),
    addDetail: (c) => ({ add: [`detail-${c}`], remove: [`light-${c}`] }),
  };
  const landRef = { current: { near, far: null } };
  let cancelled = false;
  const lateLand = startLandLoading(map, { landRef, store, isCancelled: () => cancelled });
  const idle = () => once.idle?.();
  const moveTo = (z, b) => {
    view.zoom = z;
    if (b) view.bounds = b;
    for (const f of on.moveend ?? []) f();
  };
  return { map, idle, moveTo, lateLand, landRef, requested, updates, cancel: () => (cancelled = true) };
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test("mapLand: nothing loads before the opening view has drawn; then the land beyond it", async () => {
  const t = setup();
  await settle();
  assert.deepEqual([t.requested.far, t.requested.cells], [0, []]);
  t.idle();
  await settle();
  assert.equal(t.requested.far, 1);
  assert.equal(t.landRef.current.far.features[0].properties.n, "far");
  assert.deepEqual(t.updates[0], { add: ["low"] });
});

test("mapLand: a touch screen without a link estimate loads no coast cells until zoomed in past 5, then those in view", async () => {
  const t = setup({ zoom: 3, finePointer: false });
  t.idle();
  await settle();
  assert.deepEqual(t.requested.cells, [], "none at zoom 3, and no background fill");
  t.moveTo(6, [34, 29, 37, 33]);
  await settle();
  // in view plus a quarter of the view around it: 33.25-37.75 E, 28-34 N
  assert.deepEqual(t.requested.cells.sort(), ["30_25", "35_25", "35_30"]);
  assert.ok(t.updates.some((u) => u.add?.includes("detail-35_30") && u.remove?.includes("light-35_30")), "detail swapped in for the light piece");
  t.moveTo(6.5);
  await settle();
  assert.equal(t.requested.cells.length, 3, "a cell is fetched once");
});

test("mapLand: a fine pointer fills every cell in the background, nearest first", async () => {
  const t = setup({ zoom: 3, finePointer: true });
  t.idle();
  await settle();
  await settle();
  assert.deepEqual([...t.requested.cells].sort(), [...CELLS].sort());
  assert.equal(t.requested.cells[0], "35_30", "the cell holding the centre comes first");
});

test("mapLand: land.json arriving late (Retry) starts the cells only once the map has drawn", async () => {
  const t = setup({ zoom: 6, finePointer: false, near: null });
  t.lateLand(); // before "idle": nothing yet
  await settle();
  assert.deepEqual(t.requested.cells, []);
  t.idle(); // no cell list yet: nothing to fetch
  await settle();
  assert.deepEqual(t.requested.cells, []);
  t.landRef.current.near = { cells: CELLS, cellSize: 5 };
  t.lateLand();
  await settle();
  assert.deepEqual(t.requested.cells.sort(), ["30_25", "35_25", "35_30"]);
});

test("mapLand: land.json in before the map has drawn waits for it", async () => {
  const t = setup({ zoom: 6, finePointer: true });
  t.lateLand(); // e.g. a Retry that lands before the first "idle"
  await settle();
  assert.deepEqual(t.requested.cells, []);
  t.idle();
  await settle();
  assert.ok(t.requested.cells.length > 0, "then the cells start");
});

test("mapLand: after unmount nothing more is applied", async () => {
  const t = setup({ zoom: 6 });
  t.cancel();
  t.idle();
  await settle();
  assert.equal(t.requested.far, 0);
  assert.deepEqual(t.updates, []);
});
