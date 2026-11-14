import test from "node:test";
import assert from "node:assert/strict";
import { rederiveStartDate, rederiveWikipediaPin, wikipediaPinCheck, REDERIVED_START_RULES } from "./rederive.js";
import { staleDateNotes } from "./validate.js";

// Battle of the Chinese Farm (Q2072316), Wikidata live 2026-11-14: P585 +1973 (year), P580 1973-10-15, P582 1973-10-17.
const farmEntity = {
  qid: "Q2072316",
  p585: [{ time: "1973-00-00", precision: 9 }],
  p580: [{ time: "1973-10-15", precision: 11 }],
  p582: [{ time: "1973-10-17", precision: 11 }],
  p625: { lat: 30.45, lon: 32.4 },
};
const farm = () => ({
  id: "battle-of-the-chinese-farm",
  wikidata_qid: "Q2072316",
  title: "Battle of the Chinese Farm",
  extract: "The Battle of the Chinese Farm took place between 15 and 17 October 1973, between the IDF and the Egyptian Army.",
  date_start: "1973-01-01",
  date_end: "1973-10-17",
  date_precision: "year",
  date_end_precision: "day",
  review_reasons: [],
  needs_review: false,
});

test("rederiveStartDate: a year-precision P585 start becomes the item's P580 in that year, with the note and flags", () => {
  const ev = farm();
  const change = rederiveStartDate(ev, farmEntity);
  assert.deepEqual(change, {
    id: "battle-of-the-chinese-farm",
    qid: "Q2072316",
    from: "1973-01-01",
    fromPrecision: "year",
    to: "1973-10-15",
    toPrecision: "day",
    reason: change.reason,
  });
  assert.equal(ev.date_start, "1973-10-15");
  assert.equal(ev.date_precision, "day");
  assert.deepEqual(ev.date_flags.map((f) => f.split(":")[0]), ["date_source_adjusted"]);
  assert.match(ev.date_flags[0], /used P580 start time 1973-10-15$/);
  assert.equal(ev.needs_review, true);
  // Re-runnable: the stored start is no longer the P585, so a second run changes nothing.
  const again = structuredClone(ev);
  assert.equal(rederiveStartDate(again, farmEntity), null);
  assert.deepEqual(again, ev);
  assert.deepEqual(REDERIVED_START_RULES, ["year"]);
});

test("rederiveStartDate: the re-derived record passes validation, and its start-day flag follows the lead", () => {
  const ev = { ...farm(), extract: "The battle began on 16 October 1973 and ended on 17 October 1973." };
  rederiveStartDate(ev, farmEntity);
  assert.ok(ev.review_reasons.some((r) => r.startsWith("lead_start_day_differs:")), "the lead names another day");
  const month = { ...farm(), date_start: "1920-01-01", date_end: null, date_end_precision: undefined, extract: "In May 1920 a revolt began." };
  delete month.date_end_precision;
  const r = rederiveStartDate(month, { p585: [{ time: "1920-00-00", precision: 9 }], p580: [{ time: "1920-05-00", precision: 10 }], p582: [] });
  assert.equal(r.to, "1920-05-01");
  assert.equal(month.date_precision, "month");
  // The validator's check that each date note still describes the stored dates.
  assert.deepEqual(staleDateNotes(ev), { flags: [], reasons: [] });
  assert.deepEqual(staleDateNotes(month), { flags: [], reasons: [] });
});

test("rederiveStartDate: leaves the other cases, ledger dates and missing items alone", () => {
  // Case (b) "end" (applied to curated events only through the ledger, docs/data-fixes.md F15).
  const kobaniLike = { ...farm(), date_start: "1973-10-17", date_precision: "day" };
  assert.equal(rederiveStartDate(kobaniLike, { ...farmEntity, p585: [{ time: "1973-10-17", precision: 11 }] }), null);
  assert.equal(kobaniLike.date_start, "1973-10-17");
  // A start the ledger sets (F7, October 7 attacks) is never re-derived.
  const oct7 = { ...farm(), wikidata_qid: "Q122976243", date_start: "2023-01-01" };
  assert.equal(rederiveStartDate(oct7, { p585: [{ time: "2023-00-00", precision: 9 }], p580: [{ time: "2023-10-07", precision: 11 }] }), null);
  assert.equal(rederiveStartDate(farm(), null), null);
  assert.equal(rederiveStartDate(farm(), { ...farmEntity, redirected: true }), null);
});

// Gulf Air Flight 771 (Q2335758), live 2026-11-14: stored 24.783333, 55.4; article (GeoData primary) and P625 24.85, 54.95.
const gulf = () => ({
  id: "gulf-air-flight-771",
  wikidata_qid: "Q2335758",
  resolved_qid: "Q2335758",
  countries: ["UAE"],
  coordinates: { lat: 24.783333, lon: 55.4 },
  coordinate_source: "wikipedia",
  location_quality: "precise",
  review_reasons: [],
  needs_review: false,
});
const now = { lat: 24.85, lon: 54.95 };

test("wikipediaPinCheck: both sources agree against the pin, only the article differs, or nothing to say", () => {
  assert.deepEqual(wikipediaPinCheck(gulf(), now, now), { kind: "both_sources_differ", point: now });
  assert.deepEqual(wikipediaPinCheck(gulf(), now, { lat: 24.9, lon: 55 }), { kind: "article_differs" });
  assert.deepEqual(wikipediaPinCheck(gulf(), null, now), { kind: "article_differs" }, "the article has no coordinates now");
  assert.equal(wikipediaPinCheck(gulf(), { lat: 24.7833334, lon: 55.4 }, now), null, "the same point to 6 decimals");
  assert.equal(wikipediaPinCheck(gulf(), undefined, now), null, "not fetched");
  assert.equal(wikipediaPinCheck({ ...gulf(), coordinate_source: "wikidata" }, now, now), null);
  assert.equal(wikipediaPinCheck({ ...gulf(), resolved_qid: "Q1" }, now, now), null, "another item's article is not the event's");
});

test("rederiveWikipediaPin: takes the article's point only when P625 agrees, and re-derives the coordinate flags", () => {
  const ev = gulf();
  assert.deepEqual(rederiveWikipediaPin(ev, now, now), { id: "gulf-air-flight-771", qid: "Q2335758", from: { lat: 24.783333, lon: 55.4 }, to: now });
  assert.deepEqual(ev.coordinates, now);
  assert.equal(ev.coordinate_source, "wikipedia");
  assert.deepEqual(ev.review_reasons, []);
  assert.equal(rederiveWikipediaPin(ev, now, now), null, "re-runnable");
  const other = gulf();
  assert.equal(rederiveWikipediaPin(other, now, { lat: 24.9, lon: 55 }), null);
  assert.deepEqual(other.coordinates, { lat: 24.783333, lon: 55.4 });
  // A whole-degree point gets the low-precision flag, as enrich-candidates.js gives it.
  const rounded = gulf();
  rederiveWikipediaPin(rounded, { lat: 25, lon: 55 }, { lat: 25, lon: 55 });
  assert.ok(rounded.review_reasons.some((r) => r.startsWith("coordinate_low_precision:")));
  assert.equal(rounded.needs_review, true);
  // Coordinates the ledger sets (F11) are never re-derived.
  const ledger = { ...gulf(), wikidata_qid: "Q19831524", resolved_qid: "Q19831524" };
  assert.equal(rederiveWikipediaPin(ledger, now, now), null);
});
