import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fullBucket } from "./fullBucket.js";
import { TEST_DATA_VERSION as V1, TEST_FULL_BUCKETS as B1 } from "./testing/viteNodeHooks.mjs";

// dataClient.js imports the generated dataVersion.js and reads Vite's
// import.meta.env; the hooks stub both (DATA_VERSION = V1, FULL_BUCKETS = B1,
// BASE_URL "/"). Every test imports a fresh copy, so the module's caches start empty.
register("./testing/viteNodeHooks.mjs", import.meta.url);
let copies = 0;
const freshClient = () => import(`./dataClient.js?copy=${++copies}`);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = (status = 200) => new Response("<!doctype html><title>x</title>", { status, headers: { "content-type": "text/html; charset=utf-8" } });

// globalThis.fetch answering from `routes` ({url: () => Response | throw}); an
// unknown url is a 404. Returns the list of requests made ({url, init}).
function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    return route ? route() : json({ error: "not found" }, 404);
  };
  return calls;
}
const count = (calls, url) => calls.filter((c) => c.url === url).length;

const all = (v) => `/data/events/v.${v}/all.json`;
const bucket = (v, id, n) => `/data/events/v.${v}/full/${fullBucket(id, n)}.json`;
const META = "/data/events/meta.json";
const LITE = [{ id: "e1", date_start: "1948-05-14", coordinates: { lon: 35, lat: 31 } }];

test("failure classes: 4xx and an HTML 200 are not outages, 5xx and network errors are", async () => {
  const { loadLand, loadFarLand, loadSelectionFunnel, loadFramingReviewSummary } = await freshClient();
  stubFetch({
    "/data/land.json": () => json({}, 404),
    "/data/land-far.json": () => json({}, 503),
    "/data/selection-funnel.json": () => html(200),
    "/data/framing-review.json": () => {
      throw new TypeError("fetch failed");
    },
  });
  await assert.rejects(loadLand(), (e) => e.outage === false && /404/.test(e.message));
  await assert.rejects(loadFarLand(), (e) => e.outage === true && /503/.test(e.message));
  await assert.rejects(loadSelectionFunnel(), (e) => e.outage === false && /Not found/.test(e.message));
  await assert.rejects(loadFramingReviewSummary(), (e) => e.outage === true && e instanceof TypeError);
});

test("a 200 that is not valid JSON counts as an outage", async () => {
  const { loadLand } = await freshClient();
  stubFetch({ "/data/land.json": () => new Response("{trunc", { headers: { "content-type": "application/json" } }) });
  await assert.rejects(loadLand(), (e) => e.outage === true);
});

test("concurrent callers share one request; a success stays cached, a failure is evicted", async () => {
  const { loadLand, loadLandCell } = await freshClient();
  let landOk = false;
  const calls = stubFetch({
    "/data/land.json": () => (landOk ? json({ type: "FeatureCollection", features: [] }) : json({}, 500)),
    "/data/land-cells/35_30.json": () => json({ cell: "35_30" }),
  });
  const [a, b] = await Promise.all([loadLandCell("35_30"), loadLandCell("35_30")]);
  assert.equal(a, b);
  await loadLandCell("35_30");
  assert.equal(count(calls, "/data/land-cells/35_30.json"), 1);

  await assert.rejects(Promise.all([loadLand(), loadLand()]));
  assert.equal(count(calls, "/data/land.json"), 1);
  landOk = true;
  assert.deepEqual(await loadLand(), { type: "FeatureCollection", features: [] });
  assert.equal(count(calls, "/data/land.json"), 2);
});

test("loadAllLite reads the bundle's versioned folder once and normalizes", async () => {
  const { loadAllLite } = await freshClient();
  const calls = stubFetch({
    [all(V1)]: () =>
      json([
        ...LITE,
        { id: "e2", date_start: "1967-06-05", coordinates: { lon: null, lat: null }, extract: "x".repeat(200) },
        { id: "e3", date_start: "1990-08-02", coordinates: { lon: 47, lat: 29 }, coordinate_source: "country-fallback:KW" },
        { id: "no-date" },
      ]),
  });
  const [list, again] = await Promise.all([loadAllLite(), loadAllLite()]);
  assert.equal(list, again);
  assert.deepEqual(
    list.map((e) => [e.id, e.location_quality, e.coordinates, e.snippet?.length]),
    [
      ["e1", "precise", { lon: 35, lat: 31 }, undefined],
      ["e2", "none", null, 160],
      ["e3", "approximate", { lon: 47, lat: 29 }, undefined],
    ]
  );
  assert.deepEqual(calls.map((c) => c.url), [all(V1)]);
});

test("loadAllLite: a missing versioned folder falls back to events/meta.json (no-cache)", async () => {
  const { loadAllLite, loadFullLead } = await freshClient();
  const calls = stubFetch({
    [META]: () => json({ version: "v2", fullBuckets: 128 }),
    [all("v2")]: () => json(LITE),
    [bucket("v2", "e1", 128)]: () => json({ e1: { extract: "from v2" } }),
  });
  assert.deepEqual((await loadAllLite()).map((e) => e.id), ["e1"]);
  const meta = calls.find((c) => c.url === META);
  assert.equal(meta.init?.cache, "no-cache");
  // Full records come from the folder the list came from, with ITS bucket count.
  assert.deepEqual(await loadFullLead("e1"), { extract: "from v2" });
});

// The shape check runs before the file is cached, so a bad answer is evicted
// and useAllEvents' retry fetches again.
test("loadAllLite: a non-array file is an error and the next call tries again", async () => {
  const { loadAllLite } = await freshClient();
  let good = false;
  const calls = stubFetch({
    [all(V1)]: () => json(good ? LITE : { not: "an array" }),
    [META]: () => json({ version: V1, fullBuckets: B1 }),
  });
  await assert.rejects(loadAllLite(), /not an array/);
  good = true;
  assert.equal((await loadAllLite()).length, 1);
  assert.equal(count(calls, all(V1)), 3); // first try, meta retry, next call
});

test("loadFullLead: the record, or null when its bucket lacks the id", async () => {
  const { loadFullLead } = await freshClient();
  stubFetch({ [all(V1)]: () => json(LITE), [bucket(V1, "e1", B1)]: () => json({ e1: { extract: "lead" } }) });
  assert.deepEqual(await loadFullLead("e1"), { extract: "lead" });
  // "constructor" must not be read off the object's prototype.
  stubFetch({ [all(V1)]: () => json(LITE), [bucket(V1, "constructor", B1)]: () => json({}) });
  assert.equal(await loadFullLead("constructor"), null);
});

test("loadFullLead after a deploy removed the folder: re-reads meta.json and the new folder", async () => {
  const { loadFullLead } = await freshClient();
  const calls = stubFetch({
    [all(V1)]: () => json(LITE),
    [bucket(V1, "e1", B1)]: () => json({}, 404),
    [META]: () => json({ version: "v2", fullBuckets: 256 }),
    [bucket("v2", "e1", 256)]: () => json({ e1: { extract: "new" } }),
  });
  assert.deepEqual(await loadFullLead("e1"), { extract: "new" });
  assert.equal(calls.find((c) => c.url === META).init?.cache, "no-cache");
});

test("loadFullLead: an outage is not retried via meta.json; same version rethrows the 4xx", async () => {
  {
    const { loadFullLead } = await freshClient();
    const calls = stubFetch({ [all(V1)]: () => json(LITE), [bucket(V1, "e1", B1)]: () => json({}, 502) });
    await assert.rejects(loadFullLead("e1"), (e) => e.outage === true);
    assert.equal(count(calls, META), 0);
  }
  {
    const { loadFullLead } = await freshClient();
    stubFetch({
      [all(V1)]: () => json(LITE),
      [bucket(V1, "e1", B1)]: () => html(200),
      [META]: () => json({ version: V1, fullBuckets: B1 }),
    });
    await assert.rejects(loadFullLead("e1"), (e) => e.outage === false && /Not found/.test(e.message));
  }
});

test("prefetchFullLead warms the bucket loadFullLead then reuses; a failed prefetch is retried", async () => {
  {
    const { prefetchFullLead, loadFullLead } = await freshClient();
    const calls = stubFetch({ [all(V1)]: () => json(LITE), [bucket(V1, "e1", B1)]: () => json({ e1: { extract: "p" } }) });
    prefetchFullLead("e1");
    assert.deepEqual(await loadFullLead("e1"), { extract: "p" });
    assert.equal(count(calls, bucket(V1, "e1", B1)), 1);
  }
  {
    const { prefetchFullLead, loadFullLead } = await freshClient();
    let up = false;
    const calls = stubFetch({
      [all(V1)]: () => json(LITE),
      [bucket(V1, "e1", B1)]: () => (up ? json({ e1: { extract: "p" } }) : json({}, 503)),
    });
    prefetchFullLead("e1");
    await new Promise((r) => setTimeout(r, 0));
    up = true;
    assert.deepEqual(await loadFullLead("e1"), { extract: "p" });
    assert.equal(count(calls, bucket(V1, "e1", B1)), 2);
  }
});

test("loadBoundaryDecade puts shared geometries back, leaves deferred ones, shares and evicts", async () => {
  const { loadBoundaryDecade, loadDeferredGeometry } = await freshClient();
  const geom = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  let decadeOk = false;
  const calls = stubFetch({
    "/data/boundaries/1990.json": () =>
      decadeOk
        ? json({
            type: "FeatureCollection",
            features: [
              { properties: { name: "A" }, geometry_ref: "h1" },
              { properties: { name: "B" }, geometry_ref: "h2", minzoom: 5 },
              { properties: { name: "C" }, geometry: geom },
            ],
          })
        : json({}, 500),
    "/data/boundaries/shared/h1.json": () => json(geom),
    "/data/boundaries/shared/h2.json": () => json(geom),
  });
  await assert.rejects(loadBoundaryDecade(1990), (e) => e.outage === true);
  decadeOk = true;
  const [fc, same] = await Promise.all([loadBoundaryDecade(1990), loadBoundaryDecade(1990)]);
  assert.equal(fc, same);
  assert.deepEqual(fc.features[0], { properties: { name: "A" }, geometry: geom });
  assert.equal(fc.features[1].geometry_ref, "h2");
  assert.equal(fc.features[1].geometry, undefined);
  assert.equal(count(calls, "/data/boundaries/shared/h2.json"), 0);
  assert.deepEqual(await loadDeferredGeometry("h2"), geom);
  assert.equal(count(calls, "/data/boundaries/1990.json"), 2);
});

test("loadBoundaryDecade: a file without features is evicted and refetched", async () => {
  const { loadBoundaryDecade } = await freshClient();
  let good = false;
  const calls = stubFetch({
    "/data/boundaries/2000.json": () => json(good ? { type: "FeatureCollection", features: [] } : { type: "FeatureCollection" }),
  });
  await assert.rejects(loadBoundaryDecade(2000), /no features/);
  good = true;
  assert.deepEqual((await loadBoundaryDecade(2000)).features, []);
  assert.equal(count(calls, "/data/boundaries/2000.json"), 2);
});

test("BASE_URL prefixes every data path", async () => {
  globalThis.__VITE_ENV__ = { BASE_URL: "/sub/" };
  try {
    const { loadLand } = await freshClient();
    const calls = stubFetch({ "/sub/data/land.json": () => json({ ok: 1 }) });
    assert.deepEqual(await loadLand(), { ok: 1 });
    assert.deepEqual(calls.map((c) => c.url), ["/sub/data/land.json"]);
  } finally {
    delete globalThis.__VITE_ENV__;
  }
});
