import test from "node:test";
import assert from "node:assert/strict";
import {
  effectiveQuery,
  matchedAlias,
  matchesFilters,
  matchesTokens,
  normalizeText,
  rankEvents,
  tokenize,
} from "./ranking.js";
import { makeCircleArea, makeRectArea } from "./geo.js";

test("effectiveQuery: short or letter-less text is no query", () => {
  assert.equal(effectiveQuery(""), "");
  assert.equal(effectiveQuery(" a "), "");
  assert.equal(effectiveQuery("??"), "");
  assert.equal(effectiveQuery("--"), "");
  assert.equal(effectiveQuery("  ... !! "), "");
  assert.equal(effectiveQuery(" suez "), "suez");
  assert.equal(effectiveQuery("1967"), "1967");
  assert.equal(effectiveQuery("حرب"), "حرب");
  assert.equal(effectiveQuery("?a"), "?a"); // has a letter: searched
});

const ev = (id, title, extra = {}) => ({
  id,
  title,
  extract: "",
  date_start: "1950-01-01",
  countries: ["Israel"],
  category: "war",
  coordinates: { lon: 35, lat: 32 },
  location_quality: "precise",
  ...extra,
});

test("normalizeText / tokenize fold diacritics and case", () => {
  assert.equal(normalizeText("Coup d'État"), "coup d'etat");
  assert.deepEqual(tokenize("Anglo-Iraqi War"), ["anglo", "iraqi", "war"]);
  assert.deepEqual(tokenize("Şırnak İstanbul"), ["sirnak", "istanbul"]);
});

test("matching: whole words, last token prefix (>=2 chars)", () => {
  const e = ev("a", "Suez Crisis", { extract: "The Suez Canal was nationalised." });
  assert.ok(matchesTokens(e, tokenize("suez crisis")));
  assert.ok(matchesTokens(e, tokenize("suez cri")));
  assert.ok(matchesTokens(e, tokenize("SUEZ canal nation")));
  assert.ok(!matchesTokens(e, tokenize("sue crisis"))); // non-last token must be whole
  assert.ok(!matchesTokens(e, tokenize("suez x"))); // no such word
  assert.ok(!matchesTokens(e, tokenize("suez c"))); // 1-char last token is exact, not prefix
  assert.ok(matchesTokens(ev("b", "Été"), tokenize("ete")));
});

test("matching: an event that gains its extract later is matched on the new text", () => {
  const e = ev("c", "Siege of Kut", { snippet: "The siege" });
  assert.ok(!matchesTokens(e, tokenize("townshend")));
  e.extract = "Townshend surrendered the garrison.";
  assert.ok(matchesTokens(e, tokenize("townshend")));
});

test("filters: coordinate-less events match text but never areas; category/country/area, approximate excluded from areas", () => {
  const e = ev("a", "X");
  assert.ok(matchesFilters(e, {}));
  const none = { ...e, coordinates: null, location_quality: "none" };
  assert.ok(matchesFilters(none, {}));
  assert.ok(matchesFilters(none, { categories: ["war"] }));
  assert.ok(!matchesFilters(none, { area: makeRectArea([-180, -90, 180, 90]) }));
  assert.ok(matchesFilters(e, { categories: ["war"] }));
  assert.ok(!matchesFilters(e, { categories: ["politics"] }));
  assert.ok(matchesFilters(e, { countries: ["Israel", "Egypt"] }));
  assert.ok(!matchesFilters(e, { countries: ["Egypt"] }));
  const area = makeRectArea([30, 30, 40, 40]);
  assert.ok(matchesFilters(e, { area }));
  assert.ok(!matchesFilters({ ...e, location_quality: "approximate" }, { area }));
  assert.ok(matchesFilters({ ...e, location_quality: "approximate" }, {}));
  assert.ok(!matchesFilters(e, { area: makeCircleArea([0, 0], 50) }));
});

test("rank: exact > prefix > contains > rest (server order), stable", () => {
  const list = [
    ev("rest1", "Something else", { extract: "war of words" }),
    ev("contains", "The Six-Day War"),
    ev("prefix", "War of Attrition"),
    ev("exact", "War"),
    ev("rest2", "Another", { extract: "war again" }),
  ];
  assert.deepEqual(rankEvents(list, "war").map((e) => e.id), ["exact", "prefix", "contains", "rest1", "rest2"]);
  assert.deepEqual(rankEvents(list, "WAR").map((e) => e.id), ["exact", "prefix", "contains", "rest1", "rest2"]);
});

test("aliases: matched as words like the title, ranked after the same kind of title match", () => {
  const war2006 = ev("w2006", "2006 Lebanon War", { aliases: ["July War", "Second Lebanon War", "Lebanon War"] });
  const war1982 = ev("w1982", "1982 Lebanon War", { extract: "the second Israeli invasion of Lebanon; the war" });
  const july = ev("july", "14 July Revolution", { extract: "a war" });
  assert.ok(matchesTokens(war2006, tokenize("july war")));
  assert.ok(matchesTokens(war2006, tokenize("second leb")));
  assert.deepEqual(rankEvents([july, war1982, war2006], "July War").map((e) => e.id), ["w2006", "july", "w1982"]);
  assert.deepEqual(rankEvents([war1982, war2006], "Second Lebanon War").map((e) => e.id), ["w2006", "w1982"]);
  // A title match of a kind beats an alias match of the same kind: both contain "lebanon war" in the title,
  // and the alias "Lebanon War" (exact) lifts 2006 above 1982 (title contains only).
  assert.deepEqual(rankEvents([war1982, war2006], "Lebanon War").map((e) => e.id), ["w2006", "w1982"]);
  const exact = ev("exact", "Lebanon War");
  assert.deepEqual(rankEvents([war2006, exact], "Lebanon War").map((e) => e.id), ["exact", "w2006"]);
  // Prefix of an alias, for search-as-you-type.
  const ykw = ev("ykw", "Yom Kippur War", { aliases: ["October War", "Tishreen Liberation war"] });
  assert.deepEqual(rankEvents([july, ykw], "Tishreen").map((e) => e.id), ["ykw", "july"]);
});

test("matchedAlias: the best-matching alias when the title does not match, else null", () => {
  const ykw = ev("ykw", "Yom Kippur War", { aliases: ["1973 October War", "October War", "Tishreen Liberation war"] });
  assert.equal(matchedAlias(ykw, "october war"), "October War");
  assert.equal(matchedAlias(ykw, "Tishreen"), "Tishreen Liberation war");
  assert.equal(matchedAlias(ykw, "yom kippur"), null);
  assert.equal(matchedAlias(ykw, "war"), null);
  assert.equal(matchedAlias(ykw, "egypt"), null);
  assert.equal(matchedAlias(ev("x", "X"), "october war"), null);
});

test("rank: no query sorts by date, stable on ties", () => {
  const list = [
    ev("c", "C", { date_start: "1990-05-01" }),
    ev("a", "A", { date_start: "1948-05-15" }),
    ev("b1", "B1", { date_start: "1967-06-05" }),
    ev("b2", "B2", { date_start: "1967-06-05" }),
  ];
  assert.deepEqual(rankEvents(list, "").map((e) => e.id), ["a", "b1", "b2", "c"]);
});

test("rankEvents without a query: already-chronological input gives the same order as a full stable sort", () => {
  // Reference: the stable sort by date_start the function performs on unsorted input.
  const reference = (list) =>
    list
      .map((e, i) => ({ e, i }))
      .sort((a, b) => (a.e.date_start < b.e.date_start ? -1 : a.e.date_start > b.e.date_start ? 1 : a.i - b.i))
      .map((x) => x.e);
  const dates = ["1948-05-14", "1948-05-14", "1967-06-05", "1900-01-01", "2023-10-07", "1967-06-05", "1980-09-22"];
  const list = dates.map((d, i) => ev(`e${i}`, `T${i}`, { date_start: d }));
  const sorted = rankEvents(list, "");
  assert.deepEqual(sorted.map((e) => e.id), reference(list).map((e) => e.id));
  // Feeding the sorted list (and any order-preserving filter of it) back in is the identity, ties included.
  assert.deepEqual(rankEvents(sorted, "").map((e) => e.id), sorted.map((e) => e.id));
  const filtered = sorted.filter((e) => e.date_start >= "1948");
  assert.deepEqual(rankEvents(filtered, "").map((e) => e.id), filtered.map((e) => e.id));
  // A fresh array, so callers may mutate it.
  assert.notEqual(rankEvents(sorted, ""), sorted);
});
