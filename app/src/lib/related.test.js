import test from "node:test";
import assert from "node:assert/strict";
import { NEARBY_KM, RELATED_SHOWN, SAME_TIME_DAYS, emptyReason, relatedTabFor, resolveRelated } from "./related.js";
import { resolvePartOf } from "./partOf.js";

// A precise, day-exact event unless told otherwise.
const ev = (id, o = {}) => ({
  id,
  title: `T ${id}`,
  date_start: "2000-01-01",
  date_precision: "day",
  location_quality: "precise",
  coordinates: { lon: 35, lat: 32 },
  ...o,
});
const ids = (list) => (list ?? []).map((x) => x.id);
const far = (n) => ({ coordinates: { lon: 35 + n * 5, lat: 32 } });

test("events sharing a Wikidata parent are listed closest in time first, undated last", () => {
  const p = [{ qid: "Q100", label: "War" }];
  const r = resolveRelated([
    ev("a", { part_of: p, date_start: "2000-06-01", ...far(0) }),
    ev("b", { part_of: p, date_start: "2003-01-01", ...far(1) }),
    ev("c", { part_of: p, date_start: "2000-07-01", ...far(2) }),
    ev("d", { part_of: p, date_start: null, ...far(3) }),
    ev("e", { part_of: [{ qid: "Q200", label: "Other" }], ...far(4) }),
  ]);
  assert.deepEqual(ids(r.get("a").shared_parent), ["c", "b", "d"]);
  assert.deepEqual(r.get("a").shared_parent[0], { id: "c", title: "T c", date_start: "2000-07-01" });
  assert.equal(r.get("e")?.shared_parent, undefined);
});

test("a curated parent or child is not repeated, nor is the event itself", () => {
  const p = [{ qid: "Q1", label: "War" }];
  const events = [
    ev("war", { wikidata_qid: "Q1", part_of: [{ qid: "Q1", label: "self" }], ...far(0) }),
    ev("x", { wikidata_qid: "Q2", part_of: p, ...far(1) }),
    ev("y", { wikidata_qid: "Q3", part_of: p, ...far(2), date_start: "1990-01-01" }),
  ];
  const r = resolveRelated(events, resolvePartOf(events));
  assert.deepEqual(ids(r.get("x").shared_parent), ["y"]);
  assert.ok(!ids(r.get("war")?.same_time).includes("x"), "the war's own children are already under Includes");
  assert.ok(!ids(r.get("x")?.same_time).includes("war"), "the curated parent is already under Part of");
});

test("nearby: only precise locations within NEARBY_KM, closest first, with km to 0.1 and the bearing", () => {
  const at = (lon, lat, o = {}) => ({ coordinates: { lon, lat }, date_start: "1950-01-01", ...o });
  const r = resolveRelated([
    ev("home", at(35, 32, { date_start: "2010-01-01" })),
    ev("n20", at(35, 32.18)),
    ev("n5", at(35.05, 32)),
    ev("out", at(35, 32 + (NEARBY_KM + 5) / 111)),
    ev("capital", at(35, 32.01, { location_quality: "approximate" })),
  ]);
  assert.deepEqual(ids(r.get("home").nearby), ["n5", "n20"]);
  assert.deepEqual(r.get("home").nearby.map((x) => x.km), [4.7, 20]);
  assert.deepEqual(r.get("home").nearby.map((x) => x.bearing), [90, 0], "n5 is due east, n20 due north");
  assert.equal(r.get("capital")?.nearby, undefined, "an approximate event gets no nearby list");
});

test("same time: only day-exact, unflagged dates within SAME_TIME_DAYS", () => {
  const r = resolveRelated([
    ev("a", { ...far(0), date_start: "2000-01-10" }),
    ev("b", { ...far(1), date_start: "2000-03-01" }),
    ev("c", { ...far(2), date_start: "1999-12-30" }),
    ev("late", { ...far(3), date_start: "2001-01-01" }),
    ev("month", { ...far(4), date_start: "2000-01-01", date_precision: "month" }),
    ev("flagged", { ...far(5), date_start: "2000-01-11", date_flags: ["date_start_year_not_in_lead: …"] }),
    ev("unknown", { ...far(6), date_start: "2000-01-12", date_precision: undefined }),
  ]);
  assert.ok(SAME_TIME_DAYS < 357);
  assert.deepEqual(ids(r.get("a").same_time), ["c", "b"]);
  assert.equal(r.get("month"), undefined);
  assert.equal(r.get("flagged"), undefined);
});

test("each related event is listed once, in the first group it fits; groups are capped", () => {
  const p = [{ qid: "Q9", label: "War" }];
  const many = Array.from({ length: RELATED_SHOWN + 3 }, (_, i) => ev(`s${i}`, { part_of: p, date_start: `2000-01-${String(10 + i)}` }));
  const r = resolveRelated([ev("a", { part_of: p }), ...many]);
  const g = r.get("a");
  assert.equal(g.shared_parent.length, RELATED_SHOWN);
  const all = [...ids(g.shared_parent), ...ids(g.nearby), ...ids(g.same_time)];
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, RELATED_SHOWN + 3);
  assert.deepEqual(ids(g.nearby), ["s5", "s6", "s7"], "the rest are nearby (same point), ties by id");
});

test("an event with nothing related is absent", () => {
  const r = resolveRelated([ev("a", far(0)), ev("b", { ...far(1), date_start: "1950-01-01" })]);
  assert.equal(r.size, 0);
});

test("emptyReason says which rule left a group empty", () => {
  const base = ev("a");
  assert.match(emptyReason("shared_parent", base), /does not list this event as part of/);
  assert.match(emptyReason("shared_parent", { ...base, part_of: [{ qid: "Q1" }] }), /No other event .* shares/);
  assert.match(emptyReason("nearby", { ...base, location_quality: "none", coordinates: null }), /no map location/);
  assert.match(emptyReason("nearby", { ...base, location_quality: "approximate" }), /approximate place/);
  assert.match(emptyReason("nearby", base), new RegExp(`within ${NEARBY_KM} km`));
  assert.match(emptyReason("same_time", { ...base, date_flags: ["x"] }), /could not be checked/);
  assert.match(emptyReason("same_time", { ...base, date_precision: "year" }), /known only to the year/);
  assert.match(emptyReason("same_time", { ...base, date_precision: undefined }), /exact day .* not recorded/);
  assert.match(emptyReason("same_time", base), /within six months/);
});

test("relatedTabFor: the chosen tab while it has events, else the first that has", () => {
  const keys = ["shared_parent", "nearby", "same_time"];
  const counts = { shared_parent: 0, nearby: 2, same_time: 1 };
  assert.equal(relatedTabFor(keys, counts, null), "nearby");
  assert.equal(relatedTabFor(keys, counts, "same_time"), "same_time");
  // Chosen on another event, empty for this one: falls back.
  assert.equal(relatedTabFor(keys, counts, "shared_parent"), "nearby");
  // Chosen on this event: an empty tab stays open (it says why it is empty).
  assert.equal(relatedTabFor(keys, counts, "shared_parent", true), "shared_parent");
  // All empty: the chosen one, else the first.
  const none = { shared_parent: 0, nearby: 0, same_time: 0 };
  assert.equal(relatedTabFor(keys, none, "same_time"), "same_time");
  assert.equal(relatedTabFor(keys, none, null), "shared_parent");
  assert.equal(relatedTabFor(keys, counts, "bogus"), "nearby");
});
