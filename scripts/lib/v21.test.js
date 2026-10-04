import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWikidataClasses,
  placeIsMostlyInRegion,
  tagsFromOutsidePlaces,
  hasTrackedCountry,
  titleMismatch,
  dateOrderFlags,
  finalizeEvent,
} from "./v21.js";
import { FIXES_BY_QID } from "./fixes.js";

// Real Wikidata QIDs, used only as identifiers here.
const Q = {
  lebanon: "Q822", egypt: "Q79", iraq: "Q796", syria: "Q858", // tracked
  malta: "Q233", italy: "Q38", greece: "Q41", france: "Q142", // sovereign, outside the region
  ottoman: "Q12560", // historical: not a sovereign state today, counts on neither side
  med: "Q4918", beirut: "Q3820", // places
  battle: "Q178561", terror: "Q2223653", massacre: "Q3199915",
};
const SOVEREIGN = new Set([Q.lebanon, Q.egypt, Q.iraq, Q.syria, Q.malta, Q.italy, Q.greece, Q.france]);
const SANDBOX_QID = "Q4115189"; // Wikidata sandbox item: no entry in the fix ledger
assert.equal(FIXES_BY_QID.has(SANDBOX_QID), false);

const ctxWith = ({ leads = {}, entities = {}, places = {}, labels = {}, matched = {}, reconcileDates = false }) => ({
  leads: new Map(Object.entries(leads)),
  entities: new Map(Object.entries(entities)),
  places: new Map(Object.entries(places)),
  labels,
  matched: new Map(Object.entries(matched)),
  sovereign: SOVEREIGN,
  reconcileDates,
});

test("buildWikidataClasses: P31 labels in statement order, then subclass matches, each once", () => {
  const labels = { [Q.battle]: "battle", [Q.massacre]: "massacre" };
  assert.deepEqual(
    buildWikidataClasses({ p31: [Q.massacre, Q.battle, "Q999999999", Q.battle] }, labels, ["battle", "war"]),
    ["massacre", "battle", "Q999999999", "war"],
    "unlabelled class shows its QID; a repeated class is listed once; matched classes append",
  );
  assert.deepEqual(buildWikidataClasses(null, labels, ["siege"]), ["siege"]);
  assert.deepEqual(buildWikidataClasses(undefined, labels), []);
});

test("location rule: a place lends its countries only if at least as many of its states are inside the region", () => {
  // The Mediterranean case from the rule's comment, in miniature: 2 inside, 3 outside.
  assert.equal(placeIsMostlyInRegion({ p17: [Q.lebanon, Q.egypt, Q.malta, Q.italy, Q.greece] }, SOVEREIGN), false);
  assert.equal(placeIsMostlyInRegion({ p17: [Q.lebanon, Q.france] }, SOVEREIGN), true, "a tie counts as inside");
  assert.equal(placeIsMostlyInRegion({ p17: [Q.lebanon] }, SOVEREIGN), true);
  // Historical predecessors are neither inside nor outside.
  assert.equal(placeIsMostlyInRegion({ p17: [Q.ottoman, Q.ottoman, Q.syria] }, SOVEREIGN), true);
  assert.equal(placeIsMostlyInRegion({ p17: [Q.ottoman, Q.malta] }, SOVEREIGN), false);
  assert.equal(placeIsMostlyInRegion({}, SOVEREIGN), true, "no states: 0 outside <= 0 inside");
});

test("tagsFromOutsidePlaces: only tags that a mostly-outside place alone supports", () => {
  const places = new Map([
    [Q.med, { p17: [Q.lebanon, Q.egypt, Q.malta, Q.italy, Q.greece] }],
    [Q.beirut, { p17: [Q.lebanon] }],
  ]);
  const ev = { sitelinks: 30, countries: ["Lebanon", "Egypt", "regional"] };
  assert.deepEqual(tagsFromOutsidePlaces(ev, { p276: [Q.med] }, places, SOVEREIGN), ["Lebanon", "Egypt"]);
  // Lebanon is also supported by an in-region place, Egypt by the item's own P17.
  assert.deepEqual(tagsFromOutsidePlaces(ev, { p276: [Q.med], p131: [Q.beirut] }, places, SOVEREIGN), ["Egypt"]);
  assert.deepEqual(tagsFromOutsidePlaces(ev, { p17: [Q.egypt], p276: [Q.med], p131: [Q.beirut] }, places, SOVEREIGN), []);
  // Hand-tagged legacy events (no sitelinks) and missing entities are left alone.
  assert.deepEqual(tagsFromOutsidePlaces({ countries: ["Lebanon"] }, { p276: [Q.med] }, places, SOVEREIGN), []);
  assert.deepEqual(tagsFromOutsidePlaces(ev, null, places, SOVEREIGN), []);
});

test("hasTrackedCountry: a tracked country or the hand-assigned 'regional' tag", () => {
  assert.equal(hasTrackedCountry({ countries: ["France", "Iraq"] }), true);
  assert.equal(hasTrackedCountry({ countries: ["regional"] }), true);
  assert.equal(hasTrackedCountry({ countries: ["France", "Malta"] }), false);
  assert.equal(hasTrackedCountry({}), false);
});

test("titleMismatch: flags only when the article title differs AND the record title is absent from the lead", () => {
  const ev = { title: "Suez Crisis" };
  assert.equal(titleMismatch(ev, "Suez Crisis", "Anything."), false);
  assert.equal(titleMismatch(ev, "Suez crisis", "x"), false, "case and punctuation are normalised");
  assert.equal(titleMismatch(ev, "Tripartite Aggression", "The Suez Crisis, or the Tripartite Aggression, ..."), false);
  assert.equal(titleMismatch(ev, "Tripartite Aggression", "The Tripartite Aggression was ..."), true);
  assert.equal(titleMismatch({ title: "Battle of Tal Afar" }, "Battle of Tal ʿAfar", "x"), false, "diacritics are dropped");
  assert.equal(titleMismatch(ev, null, "x"), false);
  assert.equal(titleMismatch(ev, "Other", null), false);
});

test("dateOrderFlags: only for an end before the start, with what the lead says", () => {
  assert.deepEqual(dateOrderFlags({ date_start: "1948-05-15", date_end: "1949-07-20", extract: "1948" }), []);
  assert.deepEqual(dateOrderFlags({ date_start: "1948-05-15", date_end: null }), []);
  const flags = dateOrderFlags({ date_start: "1952-07-20", date_end: "1948-05-15", extract: "It began on 15 May 1948." });
  assert.equal(flags.length, 2);
  assert.match(flags[0], /^date_order_invalid: Wikidata start \(1952-07-20\) is after end \(1948-05-15\)/);
  assert.equal(
    flags[1],
    "wikipedia_dates_note: Wikipedia lead mentions 15 May 1948; Wikidata gives 1952-07-20 to 1948-05-15 (start year 1952 not in lead)",
  );
  // A year within 1 of the lead's counts as present.
  assert.doesNotMatch(dateOrderFlags({ date_start: "1949-01-01", date_end: "1948-05-15", extract: "In 1948." })[1], /not in lead/);
});

test("finalizeEvent: copies the lead, regroups by class and removes tags that came only from an outside sea", () => {
  const ev = {
    id: "operation-pedestal",
    title: "Operation Pedestal",
    wikipedia_url: "https://en.wikipedia.org/wiki/Operation_Pedestal",
    wikidata_qid: SANDBOX_QID,
    date_start: "1942-08-03",
    date_end: "1942-08-15",
    countries: ["Lebanon", "Egypt"],
    category: "battle",
    category_label: "old",
    sitelinks: 20,
  };
  const ctx = ctxWith({
    leads: { "Operation Pedestal": { extract: "Operation Pedestal was a British operation in August 1942.", retrieved_at: "2026-09-01T10:00:00Z" } },
    entities: { [SANDBOX_QID]: { p31: [Q.battle], p276: [Q.med] } },
    places: { [Q.med]: { p17: [Q.lebanon, Q.egypt, Q.malta, Q.italy, Q.greece] } },
    labels: { [Q.battle]: "battle" },
  });
  finalizeEvent(ev, ctx);
  assert.equal(ev.extract, "Operation Pedestal was a British operation in August 1942.");
  assert.equal(ev.extract_retrieved_at, "2026-09-01");
  assert.deepEqual(ev.wikidata_classes, ["battle"]);
  assert.equal(ev.category, "war");
  assert.equal(ev.category_group, "war");
  assert.equal("category_label" in ev, false);
  assert.deepEqual(ev.countries, []);
  assert.equal(ev.review_reasons.length, 1);
  assert.match(ev.review_reasons[0], /^country_from_outside_place_removed: Lebanon, Egypt /);
  assert.equal("date_flags" in ev, false, "1942 is in the lead and the dates are in order");
  assert.equal(ev.needs_review, true);

  const once = structuredClone(ev);
  finalizeEvent(ev, ctx);
  assert.deepEqual(ev, once, "a second run changes nothing");
});

test("finalizeEvent: an overriding class wins over the stored group", () => {
  const ev = {
    title: "X", wikipedia_url: "https://en.wikipedia.org/wiki/X", wikidata_qid: SANDBOX_QID,
    date_start: "1985-10-07", countries: ["Egypt"], category: "political", category_group: "political",
  };
  const ctx = ctxWith({
    leads: { X: { extract: "X happened in 1985.", retrieved_at: "2026-09-01T00:00:00Z" } },
    entities: { [SANDBOX_QID]: { p31: [Q.massacre, Q.terror], p17: [Q.egypt] } },
    labels: { [Q.massacre]: "massacre", [Q.terror]: "terrorist attack" },
  });
  finalizeEvent(ev, ctx);
  assert.equal(ev.category, "terrorism");
  assert.equal(ev.needs_review, false);
  assert.deepEqual(ev.review_reasons, []);
});

test("finalizeEvent: date, title and country flags are recomputed from the lead and Wikidata", () => {
  const ev = {
    title: "Foo uprising",
    wikipedia_url: "https://en.wikipedia.org/wiki/Bar_revolt",
    wikidata_qid: SANDBOX_QID,
    date_start: "1920-05-01",
    date_end: "1919-01-01",
    countries: ["Iraq", "Syria"],
    category: "uprising",
    review_reasons: ["title_differs_from_article: stale", "kept: unrelated reason"],
    date_flags: ["date_order_invalid: stale"],
  };
  const ctx = ctxWith({
    leads: { "Bar revolt": { extract: "The Bar revolt took place in 1935 in Iraq.", retrieved_at: "2026-09-01T00:00:00Z" } },
    entities: { [SANDBOX_QID]: { p31: [], p17: [Q.iraq] } },
  });
  finalizeEvent(ev, ctx);
  assert.deepEqual(ev.review_reasons.map((r) => r.split(":")[0]), [
    "kept",
    "title_differs_from_article",
    "country_not_supported_by_wikidata",
  ]);
  assert.match(ev.review_reasons[1], /record title "Foo uprising" differs from the Wikipedia article title "Bar revolt"/);
  assert.match(ev.review_reasons[2], /^country_not_supported_by_wikidata: Syria not derivable .*Wikidata gives: Iraq\)/);
  assert.deepEqual(ev.date_flags.map((f) => f.split(":")[0]), [
    "date_start_year_not_in_lead",
    "date_order_invalid",
    "wikipedia_dates_note",
  ]);
  assert.equal(ev.date_flags.filter((f) => f.includes("stale")).length, 0, "stale flags are replaced, not duplicated");
  assert.equal(ev.needs_review, true);
});

test("finalizeEvent: a tag supported only via an in-region place is flagged, not removed", () => {
  const ev = {
    title: "Y", wikipedia_url: "https://en.wikipedia.org/wiki/Y", wikidata_qid: SANDBOX_QID,
    date_start: "1982-06-06", countries: ["Lebanon"], category: "war", sitelinks: 12,
  };
  const ctx = ctxWith({
    leads: { Y: { extract: "Y began in 1982.", retrieved_at: "2026-09-01T00:00:00Z" } },
    entities: { [SANDBOX_QID]: { p17: [Q.france], p131: [Q.beirut] } },
    places: { [Q.beirut]: { p17: [Q.lebanon] } },
    labels: { [Q.france]: "France" },
  });
  finalizeEvent(ev, ctx);
  assert.deepEqual(ev.countries, ["Lebanon"]);
  assert.equal(ev.review_reasons.length, 1);
  assert.match(ev.review_reasons[0], /^country_via_place_only: Wikidata P17 of the item is France;/);
});

test("finalizeEvent: reconcileDates swaps a decade-precision P585 for the item's P580, with a flag", () => {
  const entity = {
    p31: [Q.battle],
    p585: [{ time: "1930-00-00", precision: 8 }],
    p580: [{ time: "1941-06-08", precision: 11 }],
  };
  const base = {
    title: "Z", wikipedia_url: "https://en.wikipedia.org/wiki/Z", wikidata_qid: SANDBOX_QID,
    date_start: "1930-01-01", countries: ["Syria"], category: "war",
  };
  const opts = {
    leads: { Z: { extract: "Z was fought in June 1941.", retrieved_at: "2026-09-01T00:00:00Z" } },
    entities: { [SANDBOX_QID]: entity },
    labels: { [Q.battle]: "battle" },
  };
  const curated = finalizeEvent(structuredClone(base), ctxWith(opts));
  assert.equal(curated.date_start, "1930-01-01", "curated events keep their date");
  assert.deepEqual(curated.date_flags.map((f) => f.split(":")[0]), ["date_start_year_not_in_lead"]);
  assert.match(curated.date_flags[0], /start year 1930 \(1930-01-01\) is not within 1 year .*\[1941\]/);

  const candidate = finalizeEvent(structuredClone(base), ctxWith({ ...opts, reconcileDates: true }));
  assert.equal(candidate.date_start, "1941-06-08");
  assert.deepEqual(candidate.date_flags.map((f) => f.split(":")[0]), ["date_source_adjusted"]);
  assert.match(candidate.date_flags[0], /P585 1930-00-00 is only decade-or-coarser precision; used P580 start time 1941-06-08/);
});
