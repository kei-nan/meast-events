import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// useCountryHighlight is a React hook driving a MapLibre map. It runs here
// against lib/testing/fakeReact.mjs (aliased in for "react": refs, memos and
// effects only) and a recording fake map; the pure parts (which shapes, their
// bbox) are covered in lib/eventCountries.test.js.
const fakeReactUrl = new URL("../lib/testing/fakeReact.mjs", import.meta.url).href;
register("../lib/testing/viteNodeHooks.mjs", import.meta.url, { data: { aliases: { react: fakeReactUrl } } });
const { renderHook } = await import(fakeReactUrl);
const { default: useCountryHighlight } = await import("./countryHighlight.js");

const sq = (x) => ({ type: "Polygon", coordinates: [[[x, 30], [x + 4, 30], [x + 4, 34], [x, 34], [x, 30]]] });
const shape = (name, x, start = 1900, end = 9999) => ({
  type: "Feature",
  properties: { name, start_year: start, end_year: end },
  geometry: sq(x),
});

function fakeMap({ hasAreaLayer = true } = {}) {
  const log = { layers: [], setData: [], fitBounds: [], flyTo: [], easeTo: [] };
  let source = null;
  const map = {
    log,
    getLayer: (id) => (id === "area-fill" && hasAreaLayer ? {} : undefined),
    getSource: () => source,
    addSource: () => {
      source = { setData: (d) => log.setData.push(d) };
    },
    addLayer: (layer, before) => log.layers.push([layer.id, before]),
    getContainer: () => ({ clientHeight: 600, closest: () => null }),
    getZoom: () => 3,
    cameraForBounds: () => null,
    fitBounds: (b, o) => log.fitBounds.push([b, o]),
    flyTo: (o) => log.flyTo.push(o),
    easeTo: (o) => log.easeTo.push(o),
  };
  return map;
}

const IRAQ = shape("Iraq", 40);
const KUWAIT = shape("Kuwait", 47);
const FEATURES = [IRAQ, KUWAIT, shape("Iran", 50)];
const EVENT = { id: "e", countries: ["Iraq", "Kuwait"] };

test("adds its layers once map is ready, below the search area, and shades the event's countries", () => {
  const map = fakeMap();
  const mapRef = { current: map };
  const h = renderHook(useCountryHighlight, { mapRef, mapReady: false, event: EVENT, year: 2003, features: FEATURES, focus: null });
  assert.equal(map.log.layers.length, 0);
  h.rerender({ mapRef, mapReady: true, event: EVENT, year: 2003, features: FEATURES, focus: null });
  assert.deepEqual(map.log.layers, [
    ["country-highlight-fill", "area-fill"],
    ["country-highlight-line", "area-fill"],
  ]);
  assert.deepEqual(map.log.setData.at(-1).features, [IRAQ, KUWAIT]);
});

test("without the area layer the highlight goes on top", () => {
  const map = fakeMap({ hasAreaLayer: false });
  renderHook(useCountryHighlight, { mapRef: { current: map }, mapReady: true, event: null, year: 2003, features: FEATURES, focus: null });
  assert.deepEqual(map.log.layers.map(([, before]) => before), [undefined, undefined]);
});

test("a year step that shades the same border objects does not resend the source", () => {
  const map = fakeMap();
  const mapRef = { current: map };
  const props = { mapRef, mapReady: true, event: EVENT, year: 2003, features: FEATURES, focus: null };
  const h = renderHook(useCountryHighlight, props);
  h.rerender({ ...props, year: 2004 });
  h.rerender({ ...props, year: 2005 });
  assert.equal(map.log.setData.length, 1);
  h.rerender({ ...props, event: null });
  assert.equal(map.log.setData.length, 2);
  assert.deepEqual(map.log.setData.at(-1).features, []);
  h.rerender({ ...props, event: null, year: 2006 });
  assert.equal(map.log.setData.length, 2);
});

test("a fitCountries focus waits for the borders, then fits them once", () => {
  const map = fakeMap();
  const mapRef = { current: map };
  const focus = { id: "e", countries: ["Iraq", "Kuwait"], fitCountries: true, nonce: 1 };
  const props = { mapRef, mapReady: true, event: EVENT, year: 2003, features: null, focus };
  const h = renderHook(useCountryHighlight, props);
  assert.equal(map.log.fitBounds.length, 0);
  h.rerender({ ...props, features: FEATURES });
  assert.equal(map.log.fitBounds.length, 1);
  const [bounds, opts] = map.log.fitBounds[0];
  assert.deepEqual(bounds, [
    [40, 30],
    [51, 34],
  ]);
  assert.equal(opts.maxZoom, 6);
  h.rerender({ ...props, features: FEATURES, year: 2004 });
  assert.equal(map.log.fitBounds.length, 1);
});

test("no shape in that year: flies to the event's pin, or does nothing without one", () => {
  const map = fakeMap();
  const mapRef = { current: map };
  const focus = { id: "e", countries: ["Atlantis"], fitCountries: true, lon: 35, lat: 31, nonce: 2 };
  renderHook(useCountryHighlight, { mapRef, mapReady: true, event: EVENT, year: 2003, features: FEATURES, focus });
  assert.equal(map.log.fitBounds.length, 0);
  assert.deepEqual(map.log.flyTo, [{ center: [35, 31], zoom: 5, offset: [0, 0] }]);

  const map2 = fakeMap();
  const noPin = { ...focus, lon: undefined, lat: undefined, nonce: 3 };
  renderHook(useCountryHighlight, { mapRef: { current: map2 }, mapReady: true, event: EVENT, year: 2003, features: FEATURES, focus: noPin });
  assert.equal(map2.log.flyTo.length + map2.log.fitBounds.length + map2.log.easeTo.length, 0);
});

test("a focus without fitCountries never moves the map", () => {
  const map = fakeMap();
  const focus = { id: "e", countries: ["Iraq"], lon: 35, lat: 31, nonce: 4 };
  renderHook(useCountryHighlight, { mapRef: { current: map }, mapReady: true, event: EVENT, year: 2003, features: FEATURES, focus });
  assert.equal(map.log.flyTo.length + map.log.fitBounds.length + map.log.easeTo.length, 0);
});
