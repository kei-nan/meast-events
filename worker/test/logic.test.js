import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ClientError,
  boundaryDocToFeature,
  buildBoundariesQuery,
  buildEventsQuery,
  corsHeaders,
  escapeRediSearchTerm,
  hashToEvent,
  matchOrigin,
  parseBbox,
  parseQ,
  parseYear,
} from "../src/logic.js";

const sp = (o) => new URLSearchParams(o);
const bad = (fn, re) => assert.throws(fn, (e) => e instanceof ClientError && re.test(e.message));

test("parseYear", () => {
  assert.equal(parseYear("start", undefined), undefined);
  assert.equal(parseYear("start", ""), undefined);
  assert.equal(parseYear("start", "1948"), 1948);
  assert.equal(parseYear("start", "1000"), 1000);
  assert.equal(parseYear("start", "3000"), 3000);
  for (const v of ["999", "3001", "abc", "19.5", "1e3", "0x10", "-5", " 1948", "9999999"]) {
    bad(() => parseYear("year", v), /year must be/);
  }
});

test("parseBbox", () => {
  assert.equal(parseBbox(undefined), null);
  assert.deepEqual(parseBbox("32,28,38,35"), [32, 28, 38, 35]);
  assert.deepEqual(parseBbox("-180,-90,180,90"), [-180, -90, 180, 90]);
  assert.deepEqual(parseBbox("-200,10,300,20"), [-180, 10, 180, 20]); // wrapped map bounds clamp
  bad(() => parseBbox("1,2,3"), /bbox must be/);
  bad(() => parseBbox("1,2,3,x"), /bbox must be/);
  bad(() => parseBbox("1,2,3,"), /bbox must be/);
  bad(() => parseBbox("1,-91,3,4"), /latitude/);
  bad(() => parseBbox("1,2,3,91"), /latitude/);
  bad(() => parseBbox("5,2,3,4"), /min must not exceed max/);
  bad(() => parseBbox("1,5,3,4"), /min must not exceed max/);
  bad(() => parseBbox("1,2,99999,4"), /longitude/);
});

test("parseQ", () => {
  assert.equal(parseQ(undefined), undefined);
  assert.equal(parseQ("   "), undefined);
  assert.equal(parseQ("  coup "), "coup");
  assert.equal(parseQ("a".repeat(100)), "a".repeat(100));
  bad(() => parseQ("a".repeat(101)), /at most 100/);
});

test("buildEventsQuery", () => {
  assert.equal(buildEventsQuery(sp({})), "@start_year:[-inf +inf] @end_year:[-inf +inf]");
  assert.equal(
    buildEventsQuery(sp({ start: "1945", end: "1950", bbox: "32,28,38,35", q: "coup d'état" })),
    "@start_year:[-inf 1950] @end_year:[1945 +inf] @lon:[32 38] @lat:[28 35] @title|extract:(coup d\\'état)"
  );
  bad(() => buildEventsQuery(sp({ start: "1950", end: "1945" })), /start must not exceed end/);
  bad(() => buildEventsQuery(sp({ start: "abc" })), /start must be/);
  bad(() => buildEventsQuery(sp({ q: "x".repeat(500) })), /at most/);
});

test("buildBoundariesQuery", () => {
  assert.equal(buildBoundariesQuery(sp({ year: "1948" })), "@start_year:[-inf 1948] @end_year:[1948 +inf]");
  assert.equal(
    buildBoundariesQuery(sp({ start: "1950", end: "1940" })),
    "@start_year:[-inf 1950] @end_year:[1940 +inf]"
  );
  bad(() => buildBoundariesQuery(sp({})), /required/);
  bad(() => buildBoundariesQuery(sp({ start: "1940" })), /required/);
  bad(() => buildBoundariesQuery(sp({ year: "12" })), /between/);
  bad(() => buildBoundariesQuery(sp({ start: "1940", end: "x" })), /end must be/);
});

test("escapeRediSearchTerm", () => {
  assert.equal(escapeRediSearchTerm("Anglo-Iraqi War"), "Anglo\\-Iraqi War");
  assert.equal(escapeRediSearchTerm("café"), "café");
});

test("hashToEvent", () => {
  const e = hashToEvent({ id: "1", title: "T", countries: "IL,EG,", lon: "34.5", lat: "31" });
  assert.deepEqual(e.countries, ["IL", "EG"]);
  assert.deepEqual(e.coordinates, { lon: 34.5, lat: 31 });
  assert.equal(hashToEvent({ id: "2", title: "x" }).coordinates, null);
});

test("boundaryDocToFeature preserves shape and unicode", () => {
  const doc = {
    name: "Perşia–é",
    start_year: 1,
    end_year: 2,
    status: null,
    source: "s",
    note: "",
    extra: 1,
    geometry: { type: "Polygon", coordinates: [] },
  };
  const f = boundaryDocToFeature(JSON.stringify(doc));
  assert.deepEqual(f, {
    type: "Feature",
    properties: { name: "Perşia–é", start_year: 1, end_year: 2, status: null, source: "s", note: "" },
    geometry: { type: "Polygon", coordinates: [] },
  });
  assert.deepEqual(Object.keys(f.properties), ["name", "start_year", "end_year", "status", "source", "note"]);
  assert.equal(boundaryDocToFeature(null), null);
  assert.equal(boundaryDocToFeature(JSON.stringify([doc])).properties.name, "Perşia–é"); // array-wrapped form
});

test("matchOrigin / corsHeaders", () => {
  assert.equal(matchOrigin(undefined, "https://a.example"), "*"); // unset -> allow all
  assert.equal(matchOrigin("", undefined), "*");
  assert.deepEqual(corsHeaders(undefined, "https://a.example"), { "Access-Control-Allow-Origin": "*" });
  const allowed = "https://a.example, https://b.example/";
  assert.equal(matchOrigin(allowed, "https://a.example"), "https://a.example");
  assert.equal(matchOrigin(allowed, "https://b.example"), "https://b.example");
  assert.equal(matchOrigin(allowed, "https://evil.example"), null);
  assert.equal(matchOrigin(allowed, "https://a.example.evil.com"), null);
  assert.equal(matchOrigin(allowed, "http://a.example"), null);
  assert.equal(matchOrigin(allowed, undefined), null);
  assert.deepEqual(corsHeaders(allowed, "https://a.example"), {
    "Access-Control-Allow-Origin": "https://a.example",
    Vary: "Origin",
  });
  assert.deepEqual(corsHeaders(allowed, "https://evil.example"), { Vary: "Origin" });
});

test("boundaryDocToFeatureJson equals stringify(boundaryDocToFeature) (fast path and fallback)", async () => {
  const { boundaryDocToFeatureJson } = await import("../src/logic.js");
  const geo = { type: "MultiPolygon", coordinates: [[[[1.5, 2], [3, 4.25], [1.5, 2]]]] };
  const docs = [
    { name: 'Q"uote–é', start_year: 1, end_year: 9999, status: null, source: 's,"geometry":x', note: "n", geometry: geo },
    { name: "geometry not last", geometry: geo, start_year: 5, end_year: 6, status: "x", source: "s", note: "" },
    { name: "no geometry", start_year: 5, end_year: 6 },
  ];
  for (const d of docs) {
    const raw = JSON.stringify(d);
    const expected = boundaryDocToFeature(raw);
    assert.deepEqual(JSON.parse(boundaryDocToFeatureJson(raw)), JSON.parse(JSON.stringify(expected)));
  }
  assert.equal(boundaryDocToFeatureJson(null), null);
  assert.equal(boundaryDocToFeatureJson("null"), null);
});
