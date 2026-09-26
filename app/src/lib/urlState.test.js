import test from "node:test";
import assert from "node:assert/strict";
import { areaToParam, parseArea, parseUrlState, serializeUrlState } from "./urlState.js";

const base = { q: "", categories: [], countries: [], startYear: 1900, endYear: 2026, scope: "all", area: null, eventId: null };

test("defaults serialize to empty and parse back to defaults", () => {
  assert.equal(serializeUrlState(base), "");
  assert.deepEqual(parseUrlState(""), {
    q: "",
    categories: [],
    countries: [],
    years: null,
    scope: "all",
    area: null,
    eventId: null,
    about: false,
  });
});

test("about=1 round trips", () => {
  assert.equal(parseUrlState("?about=1").about, true);
  assert.equal(parseUrlState("?about=yes").about, false);
  assert.equal(serializeUrlState({ ...base, about: true }), "?about=1");
});

test("round trip of a full state", () => {
  const state = {
    q: "coup d'état",
    categories: ["war", "political"],
    countries: ["Israel", "Türkiye"],
    startYear: 1948,
    endYear: 1973,
    scope: "range",
    area: parseArea("c:35.2,31.7,150"),
    eventId: "six-day-war",
  };
  const url = serializeUrlState(state);
  const p = parseUrlState(url);
  assert.equal(p.q, state.q);
  assert.deepEqual(p.categories, state.categories);
  assert.deepEqual(p.countries, state.countries);
  assert.deepEqual(p.years, [1948, 1973]);
  assert.equal(p.scope, "range");
  assert.equal(areaToParam(p.area), "c:35.2,31.7,150");
  assert.equal(p.eventId, "six-day-war");
  const again = serializeUrlState({ ...p, startYear: p.years[0], endYear: p.years[1] });
  assert.equal(again, url);
});

test("rect area round trip", () => {
  const a = parseArea("r:30,25,45,40");
  assert.deepEqual(a.bbox, [30, 25, 45, 40]);
  assert.equal(areaToParam(a), "r:30,25,45,40");
});

test("strict validation rejects malformed input", () => {
  const bad = (s) => parseUrlState(s);
  assert.equal(bad("?y=1800-2000").years, null);
  assert.equal(bad("?y=1990-1950").years, null);
  assert.equal(bad("?y=abc").years, null);
  assert.equal(bad("?y=1900-2027").years, null);
  assert.equal(bad("?scope=bogus").scope, "all");
  assert.equal(bad("?area=r:1,2,3").area, null);
  assert.equal(bad("?area=r:40,10,30,20").area, null); // min > max
  assert.equal(bad("?area=r:0,0,200,10").area, null); // lon out of range
  assert.equal(bad("?area=r:0,0,10,95").area, null);
  assert.equal(bad("?area=c:35,32,0").area, null);
  assert.equal(bad("?area=c:35,32,999999").area, null);
  assert.equal(bad("?area=c:35,32,abc").area, null);
  assert.equal(bad("?area=x:1,2,3").area, null);
  assert.equal(bad("?e=" + encodeURIComponent("../etc/passwd")).eventId, null);
  assert.equal(bad("?e=" + encodeURIComponent("<script>")).eventId, null);
  assert.equal(bad("?e=" + "a".repeat(200)).eventId, null);
  assert.equal(bad("?q=" + "x".repeat(101)).q, "");
  assert.equal(bad("?q=a%00b").q, "");
  assert.equal(bad("?cat=" + Array.from({ length: 50 }, (_, i) => "c" + i).join(",")).categories.length, 20);
  assert.deepEqual(bad("?cat=war,,war, ").categories, ["war"]);
});

test("serialize omits invalid pieces", () => {
  assert.equal(serializeUrlState({ ...base, eventId: "<bad>" }), "");
  assert.equal(serializeUrlState({ ...base, startYear: 1950, endYear: 1960 }), "?y=1950-1960");
  assert.equal(serializeUrlState({ ...base, q: "  " }), "");
});
