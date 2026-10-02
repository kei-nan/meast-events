import test from "node:test";
import assert from "node:assert/strict";
import { textMatchesFromStore, localSearch, countInBbox } from "./localSearch.js";
import { makeCircleArea, makeRectArea } from "./geo.js";

const ev = (id, title, lon, lat, extra = {}) => ({
  id,
  title,
  date_start: "1950-01-01",
  category: "war",
  countries: ["Israel"],
  snippet: "",
  coordinates: lon === null ? null : { lon, lat },
  location_quality: lon === null ? "none" : "precise",
  ...extra,
});

const store = [
  ev("a", "Suez Crisis", 32.5, 30.0, { snippet: "Invasion of Egypt" }),
  ev("b", "Six-Day War", 35.2, 31.8, { countries: ["Jordan"], category: "conflict" }),
  ev("c", "Unmapped event", null, null),
  ev("d", "Capital pin", 35.9, 31.9, { location_quality: "approximate" }),
];

test("title and snippet matching, prefix on last token", () => {
  assert.deepEqual(localSearch(store, { q: "suez" }).map((e) => e.id), ["a"]);
  assert.deepEqual(localSearch(store, { q: "egyp" }).map((e) => e.id), ["a"]);
  assert.deepEqual(localSearch(store, { q: "nothing" }), []);
});

test("matching ignores a loaded full lead (title + snippet only)", () => {
  const opened = { ...store[1], extract: "long text mentioning Sinai" };
  assert.deepEqual(localSearch([opened], { q: "sinai" }), []);
});

test("coordinate-less events match text/filters but never an area", () => {
  assert.deepEqual(localSearch(store, { q: "unmapped" }).map((e) => e.id), ["c"]);
  assert.deepEqual(localSearch(store, { countries: ["Israel"] }).map((e) => e.id).sort(), ["a", "c", "d"]);
  const all = makeRectArea([-180, -90, 180, 90]);
  assert.ok(!localSearch(store, { area: all }).some((e) => e.id === "c"));
});

test("drawn area is precise-only and circles are trimmed by distance", () => {
  const rect = makeRectArea([30, 29, 37, 33]);
  assert.deepEqual(localSearch(store, { area: rect }).map((e) => e.id).sort(), ["a", "b"]); // d approximate
  const circle = makeCircleArea([35.2, 31.8], 50); // around b only
  assert.deepEqual(localSearch(store, { area: circle }).map((e) => e.id), ["b"]);
});

test("category filter", () => {
  assert.deepEqual(localSearch(store, { categories: ["conflict"] }).map((e) => e.id), ["b"]);
});

test("countInBbox counts only mapped events in view", () => {
  assert.equal(countInBbox(store, [30, 29, 37, 33]), 3);
  assert.equal(countInBbox(store, [0, 0, 1, 1]), 0);
  assert.equal(countInBbox(store, null), null);
});

test("textMatchesFromStore: records come from the store in index order, unknown ids are dropped", () => {
  const a = ev("tikrit", "First Battle of Tikrit", 43.7, 34.6, { date_start: "2014-06-26", date_end: "2014-07-21" });
  const b = ev("mosul", "Fall of Mosul", 43.1, 36.3);
  const byId = new Map([a, b].map((e) => [e.id, e]));
  const out = textMatchesFromStore(["mosul", "gone", "tikrit"], byId);
  assert.deepEqual(out, [b, a]);
});

test("textMatchesFromStore: category and country filters apply", () => {
  const war = ev("w", "A war", 35, 31, { category: "war", countries: ["Iraq"] });
  const treaty = ev("t", "A treaty", 35, 31, { category: "treaty", countries: ["Syria"] });
  const byId = new Map([war, treaty].map((e) => [e.id, e]));
  assert.deepEqual(textMatchesFromStore(["w", "t"], byId, { categories: ["treaty"] }).map((e) => e.id), ["t"]);
  assert.deepEqual(textMatchesFromStore(["w", "t"], byId, { countries: ["Iraq"] }).map((e) => e.id), ["w"]);
});

test("textMatchesFromStore: a drawn area keeps only precise events inside it", () => {
  const inside = ev("in", "Inside", 35, 31);
  const outside = ev("out", "Outside", 50, 20);
  const approx = ev("cap", "Capital pin", 35.1, 31.1, { location_quality: "approximate" });
  const none = ev("none", "No location", null, null);
  const byId = new Map([inside, outside, approx, none].map((e) => [e.id, e]));
  const area = makeRectArea([34, 30, 36, 32]);
  assert.deepEqual(textMatchesFromStore([...byId.keys()], byId, { area }).map((e) => e.id), ["in"]);
  assert.equal(textMatchesFromStore([...byId.keys()], byId).length, 4);
});
