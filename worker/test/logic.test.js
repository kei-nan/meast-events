import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ClientError,
  boundaryDocToFeature,
  buildBoundariesQuery,
  buildEventsQuery,
  buildEventsRequest,
  escapeTagValue,
  eventsResponse,
  makeSnippet,
  queryTokens,
  tagClause,
  textClause,
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
    "@start_year:[-inf 1950] @end_year:[1945 +inf] @lon:[32 38] @lat:[28 35] @title|extract:(coup d état*)"
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
  // unset/blank -> built-in defaults (production origin + localhost), never "*"
  const prod = "https://atlas-wiki.middle-wiki.workers.dev";
  assert.equal(matchOrigin(undefined, prod), prod);
  assert.equal(matchOrigin("  ", "http://localhost:5173"), "http://localhost:5173");
  assert.equal(matchOrigin(undefined, "https://a.example"), null);
  assert.equal(matchOrigin("", undefined), null);
  assert.deepEqual(corsHeaders(undefined, "https://a.example"), { Vary: "Origin" });
  assert.deepEqual(corsHeaders(undefined, prod), { "Access-Control-Allow-Origin": prod, Vary: "Origin" });
  // explicit "*" opt-in
  assert.equal(matchOrigin("*", "https://a.example"), "*");
  assert.deepEqual(corsHeaders("*", "https://a.example"), { "Access-Control-Allow-Origin": "*" });
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

test("escapeTagValue / tagClause: spaces, slashes and punctuation are escaped", () => {
  assert.equal(escapeTagValue("Saudi Arabia"), "Saudi\\ Arabia");
  assert.equal(escapeTagValue("Israel/Palestine"), "Israel\\/Palestine");
  assert.equal(escapeTagValue("Côte d'Ivoire"), "Côte\\ d\\'Ivoire");
  assert.equal(escapeTagValue("a-b|c}{d"), "a\\-b\\|c\\}\\{d");
  assert.equal(escapeTagValue("snake_case9"), "snake_case9");
  assert.equal(escapeTagValue("ישר"), "ישר"); // non-ASCII untouched
  assert.equal(tagClause("countries", ["Saudi Arabia", "Israel/Palestine"]), "@countries:{Saudi\\ Arabia|Israel\\/Palestine}");
  assert.equal(tagClause("category", []), null);
});

test("textClause: word split + prefix on last token (>= 2 chars)", () => {
  assert.deepEqual(queryTokens("Anglo-Iraqi War"), ["Anglo", "Iraqi", "War"]);
  assert.equal(textClause("Anglo-Iraqi War"), "@title|extract:(Anglo Iraqi War*)");
  assert.equal(textClause("revolution"), "@title|extract:(revolution*)");
  assert.equal(textClause("iraq r"), "@title|extract:(iraq r)"); // 1-char last token: exact
  assert.equal(textClause("r"), "@title|extract:(r)");
  assert.equal(textClause("café"), "@title|extract:(café*)");
  assert.equal(textClause("a/b"), "@title|extract:(a\\/b*)"); // non-separator punctuation stays literal
  assert.equal(textClause("*"), null);
  assert.equal(textClause("iraq* -war"), "@title|extract:(iraq war*)"); // user cannot inject wildcard/NOT
  assert.equal(textClause("(@x) {y}"), "@title|extract:(x y)");
});

test("buildEventsRequest: new params", () => {
  const r = buildEventsRequest(
    sp({ category: "war, treaty", country: "Saudi Arabia,Israel/Palestine", precise: "1", q: "iraq", limit: "20", offset: "40", fields: "lite" })
  );
  assert.equal(
    r.query,
    "@start_year:[-inf +inf] @end_year:[-inf +inf] @category:{war|treaty} @countries:{Saudi\\ Arabia|Israel\\/Palestine} @location_quality:{precise} @title|extract:(iraq*)"
  );
  assert.equal(r.sortBy, null); // q present -> relevance by default
  assert.equal(r.limit, 20);
  assert.equal(r.offset, 40);
  assert.equal(r.fields, "lite");
  assert.deepEqual(r.returnFields.slice(-2), ["location_quality", "snippet"]);

  const d = buildEventsRequest(sp({}));
  assert.equal(d.sortBy, "start_year"); // no q -> date
  assert.equal(d.limit, 1000);
  assert.equal(d.offset, 0);
  assert.equal(d.fields, "lite"); // full leads are opt-in
  assert.ok(d.returnFields.includes("snippet") && !d.returnFields.includes("extract"));
  assert.equal(buildEventsRequest(sp({ fields: "full" })).returnFields, null); // null = every stored field
  assert.equal(buildEventsRequest(sp({ q: "x", sort: "date" })).sortBy, "start_year");
  assert.equal(buildEventsRequest(sp({ sort: "relevance" })).sortBy, null);
  assert.equal(buildEventsRequest(sp({ precise: "0" })).query.includes("location_quality"), false);
});

test("buildEventsRequest: validation", () => {
  bad(() => buildEventsRequest(sp({ limit: "0" })), /limit must be between 1 and 1000/);
  bad(() => buildEventsRequest(sp({ limit: "1001" })), /limit must be between/);
  bad(() => buildEventsRequest(sp({ fields: "full", limit: "101" })), /limit must be between 1 and 100/);
  assert.equal(buildEventsRequest(sp({ fields: "full" })).limit, 100);
  assert.equal(buildEventsRequest(sp({ fields: "full", limit: "100" })).limit, 100);
  bad(() => buildEventsRequest(sp({ limit: "-1" })), /limit must be a non-negative integer/);
  bad(() => buildEventsRequest(sp({ limit: "1.5" })), /limit must be/);
  bad(() => buildEventsRequest(sp({ offset: "10001" })), /offset must be between/);
  bad(() => buildEventsRequest(sp({ sort: "name" })), /sort must be one of/);
  bad(() => buildEventsRequest(sp({ fields: "all" })), /fields must be one of/);
  bad(() => buildEventsRequest(sp({ precise: "yes" })), /precise must be 1 or 0/);
  bad(() => buildEventsRequest(sp({ country: "x".repeat(81) })), /country items must be/);
  bad(() => buildEventsRequest(sp({ category: Array.from({ length: 21 }, (_, i) => "c" + i).join(",") })), /at most 20/);
  // empty list items are ignored, not errors
  assert.equal(buildEventsQuery(sp({ category: ",," })), "@start_year:[-inf +inf] @end_year:[-inf +inf]");
  // injection attempts stay inside the TAG braces
  assert.ok(buildEventsQuery(sp({ category: "war}|@title:{x" })).endsWith("@category:{war\\}\\|\\@title\\:\\{x}"));
});

test("hashToEvent: lite vs full, snippet, location_quality", () => {
  const long = "é".repeat(200);
  assert.equal(makeSnippet(long).length, 160);
  assert.equal(makeSnippet("short"), "short");
  assert.equal(makeSnippet(""), "");
  assert.equal(Array.from(makeSnippet("😀".repeat(200))).length, 160); // never splits a surrogate pair
  const v = { id: "1", title: "T", extract: long, lon: "1", lat: "2", location_quality: "approximate", wikipedia_url: "u" };
  const lite = hashToEvent(v, "lite");
  assert.deepEqual(Object.keys(lite), ["id", "title", "date_start", "date_end", "countries", "category", "snippet", "location_quality", "coordinates"]);
  assert.equal(lite.snippet.length, 160);
  assert.equal(hashToEvent({ ...v, snippet: "pre" }, "lite").snippet, "pre");
  const full = hashToEvent(v);
  assert.equal(full.extract, long);
  assert.equal(full.location_quality, "approximate");
  assert.equal(full.wikipedia_url, "u");
  assert.equal("snippet" in full, false);
  assert.equal(hashToEvent({ id: "2", title: "x" }).location_quality, "precise");
  assert.equal("category_label" in full, false);
});

test("hashToEvent: v2.1 fields (full), coordinate-less events", () => {
  const v = {
    id: "n1",
    title: "No place",
    extract: "Full lead.",
    extract_retrieved_at: "2026-09-20",
    wikidata_classes: JSON.stringify(["battle", "siege, of a city"]),
    date_flags: JSON.stringify(["date_order_invalid: Wikidata start after end"]),
    location_quality: "none",
  };
  const full = hashToEvent(v);
  assert.equal(full.coordinates, null);
  assert.equal(full.location_quality, "none");
  assert.equal(full.extract_retrieved_at, "2026-09-20");
  assert.deepEqual(full.wikidata_classes, ["battle", "siege, of a city"]);
  assert.deepEqual(full.date_flags, ["date_order_invalid: Wikidata start after end"]);
  const lite = hashToEvent(v, "lite");
  assert.equal(lite.coordinates, null);
  assert.equal("wikidata_classes" in lite, false);
  assert.deepEqual(hashToEvent({ id: "x", title: "y", wikidata_classes: "not json", date_flags: "{}" }).wikidata_classes, []);
  assert.deepEqual(hashToEvent({ id: "x", title: "y" }).date_flags, []);
  assert.equal(hashToEvent({ id: "x", title: "y" }).extract_retrieved_at, null);
});

test("bbox / precise clauses exclude coordinate-less events by construction", () => {
  // Events with location_quality "none" have no lon/lat fields, so a NUMERIC range on them cannot match.
  const q = buildEventsQuery(sp({ bbox: "0,0,10,10" }));
  assert.ok(q.includes("@lon:[0 10] @lat:[0 10]"));
  assert.ok(buildEventsQuery(sp({ precise: "1" })).includes("@location_quality:{precise}"));
});

test("eventsResponse: truncated flag", () => {
  const docs = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
  const r = (total, offset) => eventsResponse(total, docs, { fields: "full", offset }).truncated;
  assert.equal(r(2, 0), false);
  assert.equal(r(3, 0), true);
  assert.equal(r(12, 10), false);
  assert.equal(r(13, 10), true);
  assert.equal(eventsResponse(0, [], { fields: "lite", offset: 0 }).truncated, false);
});
