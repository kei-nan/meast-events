import test from "node:test";
import assert from "node:assert/strict";
import { registerRenderHooks } from "../lib/testing/render.mjs";

// mapClicks.js against a fake map: what a click or tap does. Imported through
// the test hooks (its imports are extensionless, as Vite allows).
registerRenderHooks();
const { installMapClicks } = await import("./mapClicks.js");
const { CLUSTER_MAX_ZOOM } = await import("./mapInstallLayers.js");

// A map whose features are placed at pixel (lon*10, lat*10).
function fakeMap({ markers = [], borders = [], zoom = 4, expansion = 6, leaves = [] } = {}) {
  const handlers = {};
  const calls = { easeTo: [], flash: [] };
  const inBox = (f, [[x0, y0], [x1, y1]]) => {
    const [x, y] = f.geometry.coordinates.map((c) => c * 10);
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  };
  const at = (f, p) => f.geometry.coordinates[0] * 10 === p.x && f.geometry.coordinates[1] * 10 === p.y;
  const map = {
    on: (type, fn) => ((handlers[type] ??= []).push(fn), map),
    fire: (type, e) => Promise.all((handlers[type] ?? []).map((fn) => fn(e))),
    project: (c) => ({ x: c[0] * 10, y: c[1] * 10 }),
    getZoom: () => zoom,
    easeTo: (o, eventData) => calls.easeTo.push({ ...o, eventData }),
    queryRenderedFeatures: (q, { layers }) => {
      if (layers.includes("boundaries-fill")) return borders;
      const pool = markers.filter((f) => layers.includes(f.layer.id));
      return Array.isArray(q) && Array.isArray(q[0]) ? pool.filter((f) => inBox(f, q)) : pool.filter((f) => at(f, q));
    },
    getSource: (name) =>
      name === "events"
        ? { getClusterExpansionZoom: async () => expansion, getClusterLeaves: async () => leaves }
        : { setData: (d) => name === "cluster-flash" && calls.flash.push(d) },
  };
  return { map, calls };
}
const dot = (id, lon, lat) => ({ layer: { id: "unclustered-point" }, geometry: { coordinates: [lon, lat] }, properties: { id, title: id } });
const cluster = (id, count, lon, lat) => ({
  layer: { id: "clusters" },
  geometry: { coordinates: [lon, lat] },
  properties: { cluster_id: id, point_count: count },
});
const border = (name) => ({ properties: { name, status: "recognized" } });

function install(map, { clickable = () => true, coarse = false, cache = new Map() } = {}) {
  globalThis.window = { matchMedia: (q) => ({ matches: q.includes("coarse") ? coarse : false }) };
  globalThis.document = { activeElement: null, body: {} };
  const got = { selected: [], stack: [], popup: [] };
  installMapClicks(map, {
    isCancelled: () => false,
    clickable,
    propsRef: { current: { onSelectEvent: (id) => got.selected.push(id) } },
    boundaryCacheRef: { current: cache },
    yearRef: { current: 1950 },
    setStackList: (s) => got.stack.push(s),
    setBorderPopup: (p) => got.popup.push(p),
    stackOpenerRef: { current: null },
    popupOpenerRef: { current: null },
  });
  return got;
}
const click = (map, x, y) => map.fire("click", { point: { x, y }, lngLat: { lng: x / 10, lat: y / 10 } });

test("mapClicks: a lone dot opens its event", async () => {
  const { map } = fakeMap({ markers: [dot("suez-crisis", 32, 30)] });
  const got = install(map);
  await click(map, 320, 300);
  assert.deepEqual(got.selected, ["suez-crisis"]);
  assert.deepEqual(got.stack, []);
});

test("mapClicks: a dot with other events on the same spot lists them all", async () => {
  const { map } = fakeMap({ markers: [dot("a", 35, 31), dot("b", 35, 31)] });
  const got = install(map);
  await click(map, 350, 310);
  assert.deepEqual(got.selected, []);
  assert.equal(got.popup.at(-1), null, "a border popup closes");
  assert.deepEqual(got.stack.at(-1).items.map((i) => i.id).sort(), ["a", "b"]);
  assert.equal(got.stack.at(-1).total, 2);
});

test("mapClicks: a cluster zooms in to where it splits, with a flash", async () => {
  const { map, calls } = fakeMap({ markers: [cluster(7, 40, 44, 33)], zoom: 4, expansion: 7 });
  const got = install(map);
  await click(map, 440, 330);
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(calls.easeTo.map((o) => [o.center, o.zoom]), [[[44, 33], 7]]);
  assert.equal(calls.easeTo[0].eventData?.userMove, true, "a user's move: it goes into the link (mapCamera.js)");
  assert.equal(calls.flash.length, 1, "the cluster flashes");
  assert.deepEqual(got.stack, []);
});

test("mapClicks: a cluster no zoom can split lists its events instead", async () => {
  const leaves = [dot("x", 44, 33), dot("y", 44, 33), dot("z", 44, 33)];
  const { map, calls } = fakeMap({ markers: [cluster(9, 3, 44, 33)], expansion: CLUSTER_MAX_ZOOM + 2, leaves });
  const got = install(map);
  await click(map, 440, 330);
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(calls.easeTo, []);
  assert.deepEqual(got.stack.at(-1).items.map((i) => i.id).sort(), ["x", "y", "z"]);
});

test("mapClicks: a cluster answer that comes after the events changed is dropped", async () => {
  const { map, calls } = fakeMap({ markers: [cluster(7, 40, 44, 33)], expansion: 7 });
  install(map);
  const clicked = click(map, 440, 330);
  map.fire("data", { sourceId: "events", sourceDataType: "content" }); // a Play step, mid-lookup
  await clicked;
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(calls.easeTo, []);
});

test("mapClicks: no marker - a border's details; nothing there - the details close", async () => {
  const { map } = fakeMap({ borders: [border("Kingdom of Iraq")] });
  const got = install(map);
  await click(map, 100, 100);
  assert.equal(got.stack.at(-1), null, "the events list closes");
  assert.deepEqual(got.popup.at(-1).items.map((b) => b.name), ["Kingdom of Iraq"]);
  assert.deepEqual(got.popup.at(-1).lngLat, [10, 10]);

  const { map: empty } = fakeMap();
  const none = install(empty);
  await click(empty, 100, 100);
  assert.equal(none.popup.at(-1), null);
});

test("mapClicks: touch - a tap just beside a dot picks it; a mouse click there does not", async () => {
  const markers = [dot("near", 35, 31)];
  const touch = fakeMap({ markers, borders: [border("Mandatory Palestine")] });
  const t = install(touch.map, { coarse: true });
  await click(touch.map, 360, 316); // 10 px right, 6 px down of the dot
  assert.deepEqual(t.selected, ["near"]);

  const mouse = fakeMap({ markers, borders: [border("Mandatory Palestine")] });
  const m = install(mouse.map, { coarse: false });
  await click(mouse.map, 360, 316);
  assert.deepEqual(m.selected, []);
  assert.equal(m.popup.at(-1).items[0].name, "Mandatory Palestine", "the border under it opens");
});

test("mapClicks: nothing happens while drawing an area or releasing a drag", async () => {
  const { map } = fakeMap({ markers: [dot("suez-crisis", 32, 30)], borders: [border("Egypt")] });
  const got = install(map, { clickable: () => false });
  await click(map, 320, 300);
  assert.deepEqual([got.selected, got.stack, got.popup], [[], [], []]);
});
