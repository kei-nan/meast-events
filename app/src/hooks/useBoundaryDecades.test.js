import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// useBoundaryDecades runs here against lib/testing/fakeReact.mjs (aliased in
// for "react"; setState does not re-render, so each step calls rerender), with
// the decade files replaced by globalThis.__loadDecade and a stand-in map, and
// node:test's mock timers for the settle wait.
const fakeReactUrl = new URL("../lib/testing/fakeReact.mjs", import.meta.url).href;
const js = (src) => `data:text/javascript,${encodeURIComponent(src)}`;
const dataClientUrl = js(`
  export const decadeFloor = (y) => Math.floor(y / 10) * 10;
  export const loadBoundaryDecade = (d) => globalThis.__loadDecade(d);
  export const prefetchBoundaryDecade = (d) => globalThis.__prefetched.push(d);
  export const loadDeferredGeometry = () => new Promise(() => {});
`);
const mapLayersUrl = js("export const setCityYear = () => {};");
register("../lib/testing/viteNodeHooks.mjs", import.meta.url, {
  data: { aliases: { react: fakeReactUrl, "../lib/dataClient": dataClientUrl, "../components/mapInstallLayers": mapLayersUrl } },
});
const { renderHook } = await import(fakeReactUrl);
const { default: useBoundaryDecades, DECADE_SETTLE_MS } = await import("./useBoundaryDecades.js");

const fakeMap = () => ({
  once() {},
  off() {},
  on() {},
  triggerRepaint() {},
  getSource: () => ({ setData() {} }),
  getZoom: () => 4,
  getBounds: () => ({ getWest: () => 30, getSouth: () => 25, getEast: () => 50, getNorth: () => 40 }),
});

function setup(ctx, startYear) {
  ctx.mock.timers.enable({ apis: ["setTimeout"] });
  const loads = [];
  globalThis.__prefetched = [];
  globalThis.__loadDecade = (d) => {
    loads.push(d);
    return Promise.resolve({ features: [] });
  };
  const mapRef = { current: fakeMap() };
  const yearRef = { current: startYear };
  const hook = renderHook(
    (year) => {
      yearRef.current = year;
      return useBoundaryDecades({ mapRef, mapReady: true, year, yearRef, yearPending: false });
    },
    startYear
  );
  return { loads, at: (year) => hook.rerender(year) };
}

const flush = () => new Promise((r) => setImmediate(r));

test("a quick drag across the timeline fetches only the decade it ends in", async (ctx) => {
  const t = setup(ctx, 2000);
  assert.deepEqual(t.loads, [2000], "the first decade at once");
  for (let y = 1995; y >= 1900; y -= 5) {
    t.at(y);
    ctx.mock.timers.tick(20); // 5 years per 20 ms: each decade passed in 40 ms
  }
  assert.deepEqual(t.loads, [2000]);
  ctx.mock.timers.tick(DECADE_SETTLE_MS);
  await flush();
  assert.deepEqual(t.loads, [2000, 1900], "the decade the drag ended in");
  assert.equal(t.at(1900).shownBorderYear, 1900, "and the map shows its borders");
});

test("a decade the year rests in, however briefly, is fetched mid-drag; a cached one at once", async (ctx) => {
  const t = setup(ctx, 2000);
  t.at(1985);
  ctx.mock.timers.tick(DECADE_SETTLE_MS);
  await flush();
  assert.deepEqual(t.loads, [2000, 1980]);
  t.at(1975); // passing on: not yet
  assert.deepEqual(t.loads, [2000, 1980]);
  t.at(1981); // back into a cached decade: drawn at once, nothing fetched
  assert.equal(t.at(1981).shownBorderYear, 1981);
  ctx.mock.timers.tick(DECADE_SETTLE_MS);
  assert.deepEqual(t.loads, [2000, 1980]);
});
