// The search and timeline caches (lib/ranking.js word cache, lib/eventYears.js
// year cache) must give exactly the answers of the uncached code they replaced.
// The reference functions below are that code, kept verbatim in spirit:
// tokenise every event's text on every call, parse dates on every call.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localSearch } from "./localSearch.js";
import { matchesFilters, matchesTokens, normalizeText, rankEvents, tokenize, warmWords } from "./ranking.js";
import { eventOverlapsRange, eventYearRange, rawEventYears, yearsReversed } from "./eventYears.js";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data", "events.json");
// The lite records the app's store holds (snippet, no extract).
const events = JSON.parse(fs.readFileSync(DATA, "utf8")).map((e) => ({
  id: e.id,
  title: e.title,
  aliases: e.aliases,
  snippet: String(e.extract ?? "").slice(0, 160),
  date_start: e.date_start,
  date_end: e.date_end,
  category: e.category,
  countries: e.countries,
  coordinates: e.coordinates,
  location_quality: e.location_quality,
}));

// --- reference: the uncached matching (text rebuilt and tokenised per call)
function refTokenMatches(token, isLast, words) {
  const prefix = isLast && token.length >= 2;
  return words.some((w) => w === token || (prefix && w.startsWith(token)));
}
function refMatchesTokens(event, tokens) {
  if (tokens.length === 0) return true;
  const aliases = Array.isArray(event.aliases) ? event.aliases : [];
  const words = tokenize(`${event.title ?? ""} ${aliases.join(" ")} ${event.extract ?? event.snippet ?? ""}`);
  return tokens.every((t, i) => refTokenMatches(t, i === tokens.length - 1, words));
}
function refLocalSearch(list, q) {
  const hits = list.filter((e) => refMatchesTokens(e.extract === undefined ? e : { ...e, extract: undefined }, tokenize(q)));
  return rankEvents(hits, q);
}

const QUERIES = ["ba", "bag", "baghdad", "war", "war of", "gaza strip", "intifada", "1967", "yom kip", "suez", "iran ir", "kurd", "lebanon w", "ā", "zz", "operation"];

test("local search: same results in the same order as the uncached matching (real data)", () => {
  for (const q of QUERIES) {
    const want = refLocalSearch(events, q).map((e) => e.id);
    // Cold, then warm (second call hits the cache).
    assert.deepEqual(localSearch(events, { q }).map((e) => e.id), want, q);
    assert.deepEqual(localSearch(events, { q }).map((e) => e.id), want, `${q} (cached)`);
  }
});

test("local search with filters: same as the uncached matching", () => {
  const filters = { categories: ["war"], countries: ["Iraq"] };
  for (const q of QUERIES) {
    const want = refLocalSearch(events, q)
      .filter((e) => filters.categories.includes(e.category) && (e.countries ?? []).some((c) => filters.countries.includes(c)))
      .map((e) => e.id);
    assert.deepEqual(localSearch(events, { q, ...filters }).map((e) => e.id), want, q);
  }
});

test("warmWords: warming first gives the same answers", () => {
  const copy = events.map((e) => ({ ...e }));
  warmWords(copy);
  for (const q of QUERIES) {
    assert.deepEqual(localSearch(copy, { q }).map((e) => e.id), refLocalSearch(copy, q).map((e) => e.id), q);
  }
});

test("word cache: an event that gains its extract, a new title, aliases or snippet is matched on its new text", () => {
  const e = { id: "x", title: "Alpha", snippet: "first", date_start: "1950" };
  assert.equal(matchesTokens(e, tokenize("second")), false);
  e.extract = "the second text";
  assert.equal(matchesTokens(e, tokenize("second")), true);
  e.title = "Beta";
  assert.equal(matchesTokens(e, tokenize("beta")), true);
  assert.equal(matchesTokens(e, tokenize("alpha")), false);
  e.aliases = ["Gamma"];
  assert.equal(matchesTokens(e, tokenize("gamma")), true);
  delete e.extract;
  e.snippet = "third";
  assert.equal(matchesTokens(e, tokenize("third")), true);
  assert.equal(matchesTokens(e, tokenize("second")), false);
});

test("matchesFilters: a precomputed token list gives the same answer as q", () => {
  for (const q of QUERIES) {
    const tokens = tokenize(q);
    for (const e of events.slice(0, 200)) {
      assert.equal(matchesFilters(e, { q, tokens }), matchesFilters(e, { q }), `${q} ${e.id}`);
    }
  }
  assert.equal(normalizeText("Ā"), "a");
});

// --- reference: the uncached range check
function refOverlaps(e, startYear, endYear) {
  if (yearsReversed(e)) {
    const [s, en] = rawEventYears(e);
    return (s >= startYear && s <= endYear) || (en >= startYear && en <= endYear);
  }
  const [s, en] = eventYearRange(e);
  return s <= endYear && en >= startYear;
}

test("eventOverlapsRange: same answer as the uncached check for every event and range (real data)", () => {
  const odd = [
    { date_start: "2009-08-02", date_end: "1990-08-04" },
    { date_start: "", date_end: "1990" },
    { date_start: "1950" },
    {},
  ];
  const list = events.concat(odd);
  for (const [a, b] of [[1900, 2026], [1948, 1948], [1990, 1995], [2000, 2009], [1967, 1973], [2026, 2026]]) {
    for (const e of list) {
      assert.equal(eventOverlapsRange(e, a, b), refOverlaps(e, a, b), `${e.id} ${a}-${b}`);
      assert.equal(eventOverlapsRange(e, a, b), refOverlaps(e, a, b), `${e.id} ${a}-${b} (cached)`);
    }
  }
});

test("year cache: a changed date is parsed again", () => {
  const e = { date_start: "1950-01-01" };
  assert.equal(eventOverlapsRange(e, 1950, 1950), true);
  e.date_start = "1960-01-01";
  assert.equal(eventOverlapsRange(e, 1950, 1950), false);
  e.date_end = "1940-01-01"; // reversed: only its two years
  assert.equal(eventOverlapsRange(e, 1945, 1955), false);
  assert.equal(eventOverlapsRange(e, 1940, 1940), true);
});
