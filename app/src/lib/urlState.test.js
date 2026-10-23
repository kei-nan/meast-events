import test from "node:test";
import assert from "node:assert/strict";
import {
  areaToParam,
  canonicalPath,
  entryBeforePush,
  eventIdFromPath,
  eventPath,
  parseArea,
  parseUrl,
  parseUrlState,
  serializeUrlState,
  shareLink,
  stateUrl,
  urlWriteMode,
  YEAR_MAX,
} from "./urlState.js";

const base = { q: "", categories: [], countries: [], startYear: 1900, endYear: YEAR_MAX, scope: "all", area: null, eventId: null };

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
    sort: "coverage",
    view: "list",
  });
});

test("view=timeline round trips; the list (default) and junk stay out of the URL", () => {
  assert.equal(parseUrlState("?view=timeline").view, "timeline");
  assert.equal(parseUrlState("?view=grid").view, "list");
  assert.equal(serializeUrlState({ ...base, view: "timeline" }), "?view=timeline");
  assert.equal(serializeUrlState({ ...base, view: "list" }), "");
  assert.equal(serializeUrlState({ ...base, view: "grid" }), "");
});

test("sort round trips; the default (coverage) and junk stay out of the URL", () => {
  for (const s of ["coverage-asc", "date", "date-desc"]) {
    assert.equal(parseUrlState(`?sort=${s}`).sort, s);
    assert.equal(serializeUrlState({ ...base, sort: s }), `?sort=${s}`);
  }
  assert.equal(parseUrlState("?sort=bogus").sort, "coverage");
  assert.equal(serializeUrlState({ ...base, sort: "coverage" }), "");
  assert.equal(serializeUrlState({ ...base, sort: "bogus" }), "");
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
  const url = stateUrl(state);
  assert.ok(url.startsWith("/event/six-day-war?"));
  const p = parseUrl(url);
  assert.equal(p.q, state.q);
  assert.deepEqual(p.categories, state.categories);
  assert.deepEqual(p.countries, state.countries);
  assert.deepEqual(p.years, [1948, 1973]);
  assert.equal(p.scope, "range");
  assert.equal(areaToParam(p.area), "c:35.2,31.7,150");
  assert.equal(p.eventId, "six-day-war");
  const again = stateUrl({ ...p, startYear: p.years[0], endYear: p.years[1] });
  assert.equal(again, url);
});

test("an open event is the path, /event/<id>; older /?e=<id> links still parse", () => {
  assert.equal(eventPath("a:b"), "/event/a%3Ab");
  assert.equal(eventIdFromPath("/event/six-day-war"), "six-day-war");
  assert.equal(eventIdFromPath("/event/six-day-war/"), "six-day-war");
  assert.equal(eventIdFromPath("/event/a%3Ab"), "a:b");
  for (const p of ["/", "/event/", "/event", "/event/a/b", "/events/a", "/x/event/a", "/event/%E0%A4%A", "/event/a%20b", "/event/" + "a".repeat(200)]) {
    assert.equal(eventIdFromPath(p), null, p);
  }
  assert.equal(parseUrlState("?y=1950-1960", "/event/suez-crisis").eventId, "suez-crisis");
  assert.equal(parseUrlState("?e=suez-crisis", "/").eventId, "suez-crisis");
  assert.equal(parseUrlState("?e=other", "/event/suez-crisis").eventId, "suez-crisis"); // the path wins
  assert.equal(parseUrlState("", "/").eventId, null);
  // Written back as the path, never as ?e=.
  assert.equal(stateUrl({ ...base, eventId: "suez-crisis" }), "/event/suez-crisis");
  assert.equal(stateUrl({ ...base, eventId: "suez-crisis", startYear: 1950, endYear: 1960 }), "/event/suez-crisis?y=1950-1960");
  assert.equal(stateUrl(base), "/");
  assert.equal(stateUrl({ ...base, eventId: "<bad>" }), "/");
});

test("canonicalPath: the event's page, or the home page", () => {
  assert.equal(canonicalPath({ ...base, q: "suez", eventId: "a:b" }), "/event/a%3Ab");
  assert.equal(canonicalPath({ ...base, q: "suez" }), "/");
  assert.equal(canonicalPath({ ...base, eventId: "a b" }), "/");
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

test("serialize omits invalid pieces, and the event (it is the path)", () => {
  assert.equal(serializeUrlState({ ...base, eventId: "<bad>" }), "");
  assert.equal(serializeUrlState({ ...base, eventId: "six-day-war" }), "");
  assert.equal(serializeUrlState({ ...base, startYear: 1950, endYear: 1960 }), "?y=1950-1960");
  assert.equal(serializeUrlState({ ...base, q: "  " }), "");
});

test("the last year follows the clock, not a fixed year", () => {
  assert.equal(YEAR_MAX, new Date().getUTCFullYear());
  assert.deepEqual(parseUrlState(`?y=2000-${YEAR_MAX}`).years, [2000, YEAR_MAX]);
  assert.equal(parseUrlState(`?y=2000-${YEAR_MAX + 1}`).years, null);
});

test("urlWriteMode: pushes event changes, debounces the rest, replaces on request", () => {
  assert.equal(urlWriteMode("/event/a", "/event/a"), null);
  assert.equal(urlWriteMode("/", "/event/a"), "push");
  assert.equal(urlWriteMode("/event/a", "/event/b"), "push");
  assert.equal(urlWriteMode("/event/a", "/"), "push");
  assert.equal(urlWriteMode("/", "/?about=1"), "push");
  assert.equal(urlWriteMode("/event/a", "/event/a?q=x"), "debounce");
  assert.equal(urlWriteMode("/?y=1900-1950", "/?y=1900-1960"), "debounce");
  // An older link rewritten to the event's path: the same event, so a replace.
  assert.equal(urlWriteMode("/?e=a&y=1950-1960", "/event/a?y=1950-1960"), "debounce");
  // Clearing an unresolvable deep link overwrites it instead of adding an entry.
  assert.equal(urlWriteMode("/event/bogus", "/", { replace: true }), "replace");
  assert.equal(urlWriteMode("/event/bogus?q=x", "/?q=x", { replace: true }), "replace");
  // The flag only matters for event changes.
  assert.equal(urlWriteMode("/?q=x", "/?q=y", { replace: true }), "debounce");
});

test("entryBeforePush: carries a pending non-event change onto the current entry", () => {
  const base = { q: "", categories: [], countries: [], startYear: 1900, endYear: YEAR_MAX, scope: "all", area: null, about: false };
  // Typed "suez", then opened an event within the debounce: the current entry
  // (still "/?q=su") gets "/?q=suez" before the event's entry is pushed.
  assert.equal(entryBeforePush("/?q=su", { ...base, q: "suez", eventId: "suez-crisis" }), "/?q=suez");
  // Closing the event after moving the years: the event's entry keeps the event.
  assert.equal(
    entryBeforePush("/event/suez-crisis", { ...base, startYear: 1956, endYear: 1957, eventId: null }),
    "/event/suez-crisis?y=1956-1957"
  );
  // Nothing pending: nothing to write.
  assert.equal(entryBeforePush("/?q=suez", { ...base, q: "suez", eventId: "suez-crisis" }), null);
  assert.equal(entryBeforePush("/", { ...base, about: true }), null);
});

test("shareLink: the view as it is now (not as the debounced URL last had it)", () => {
  // An open event: its own page, with the view's years and filters.
  assert.equal(
    shareLink("https://middleeast.events", { ...base, q: "suez", startYear: 1950, endYear: 1960, eventId: "Q1" }),
    "https://middleeast.events/event/Q1?q=suez&y=1950-1960"
  );
  assert.equal(shareLink("https://x.test", { ...base, eventId: "a:b" }), "https://x.test/event/a%3Ab");
  assert.equal(shareLink("https://x.test", base), "https://x.test/");
  assert.equal(shareLink("https://x.test", { ...base, q: "suez", startYear: 1956, endYear: 1957 }), "https://x.test/?q=suez&y=1956-1957");
  // An invalid id is not shared.
  assert.equal(shareLink("https://x.test", { ...base, eventId: "a b" }), "https://x.test/");
});
