import test from "node:test";
import assert from "node:assert/strict";
import { isSeedEvent, proposeSeedFields, summarize } from "./seed-enrichment.js";

// A seed record as in data/events.json (no sitelinks, date_precision, part_of or resolved_qid).
const seed = (over = {}) => ({
  id: "suez-crisis",
  title: "Suez Crisis",
  wikidata_qid: "Q129286",
  wikipedia_url: "https://en.wikipedia.org/wiki/Suez_Crisis",
  date_start: "1956-10-29",
  date_end: "1957-03-01",
  extract: "The Suez Crisis, also known as the Second Arab–Israeli War, was a British–French–Israeli invasion of Egypt in 1956.",
  review_reasons: [],
  ...over,
});
const entity = (over = {}) => ({ description: "1956 invasion of Egypt", p585: [], p580: [{ time: "1956-10-29", precision: 11 }], p582: [], ...over });
const lead = (qid = "Q129286") => ({ title: "Suez Crisis", wikibase_item: qid });

test("isSeedEvent: no discovery sitelinks count", () => {
  assert.equal(isSeedEvent(seed()), true);
  assert.equal(isSeedEvent(seed({ sitelinks: 12 })), false);
});

test("proposeSeedFields: the missing fields, as the pipeline derives them", () => {
  const p = proposeSeedFields(seed(), { entity: entity(), partOfQids: ["Q8683"], labels: { Q8683: "Cold War" }, lead: lead() });
  assert.deepEqual(p.set, {
    date_precision: "day",
    part_of: [{ qid: "Q8683", label: "Cold War" }],
    resolved_qid: "Q129286",
    wikidata_description: "1956 invasion of Egypt",
  });
  assert.deepEqual(p.add_review_reasons, ['part_of: Wikidata (P361) lists this event as part of "Cold War" (Q8683); it may overlap with that larger event']);
  assert.deepEqual(p.notes, []);
});

test("proposeSeedFields: never proposes a field the event has, nor a note it already carries", () => {
  const has = seed({ date_precision: "month", part_of: [], resolved_qid: "Q1", wikidata_description: "x" });
  assert.deepEqual(proposeSeedFields(has, { entity: entity(), partOfQids: ["Q8683"], labels: {}, lead: lead("Q9") }).set, {});
  const noted = seed({ review_reasons: ['part_of: Wikidata (P361) lists this event as part of "Cold War" (Q8683); it may overlap with that larger event'] });
  assert.deepEqual(proposeSeedFields(noted, { entity: entity(), partOfQids: ["Q8683"], labels: { Q8683: "Cold War" }, lead: lead() }).add_review_reasons, []);
});

test("proposeSeedFields: a date that is no Wikidata value gets precision null and a note; coarse and month dates get the pipeline flags", () => {
  const other = proposeSeedFields(seed(), { entity: entity({ p580: [{ time: "1956-10-30", precision: 11 }] }), lead: lead() });
  assert.equal(other.set.date_precision, null);
  assert.match(other.notes[0], /date_start 1956-10-29 is none of the item's P585\/P580 values \(P580 1956-10-30 \(11\)\)/);
  const year = proposeSeedFields(seed({ date_start: "1956-01-01" }), { entity: entity({ p580: [{ time: "1956-00-00", precision: 9 }] }), lead: lead() });
  assert.equal(year.set.date_precision, "year");
  const decade = proposeSeedFields(seed({ date_start: "1950-01-01" }), { entity: entity({ p585: [{ time: "1950-00-00", precision: 8 }] }), lead: lead() });
  assert.ok(decade.add_review_reasons.includes("date_precision_coarse: Wikidata records the date only to decade precision"));
  const month = proposeSeedFields(seed({ date_start: "1956-10-01", extract: "On 29 October 1956, Israel invaded the Sinai." }), {
    entity: entity({ p580: [{ time: "1956-10-00", precision: 10 }] }),
    lead: lead(),
  });
  assert.equal(month.set.date_precision, "month");
  assert.ok(month.add_review_reasons.some((r) => r.startsWith("month_precision_day_in_lead:")));
});

test("proposeSeedFields: another article's item, a missing item or article", () => {
  const redirect = proposeSeedFields(seed(), { entity: entity(), lead: lead("Q42") });
  assert.equal(redirect.set.resolved_qid, "Q42");
  assert.ok(redirect.add_review_reasons.some((r) => r.startsWith("qid_mismatch: title resolved to Q42")));
  const gone = proposeSeedFields(seed(), { entity: null, lead: null });
  assert.deepEqual(gone.set, {});
  assert.equal(gone.notes.length, 2);
});

test("summarize: counts per field", () => {
  const ps = [
    { wikidata_qid: "Q1", set: { date_precision: "day", part_of: [{ qid: "Q2" }], resolved_qid: "Q1", wikidata_description: "d" }, add_review_reasons: ["part_of: x"], notes: [] },
    { wikidata_qid: "Q3", set: { date_precision: null, part_of: [], resolved_qid: "Q4" }, add_review_reasons: ["qid_mismatch: y"], notes: ["n"] },
  ];
  const s = summarize(ps);
  assert.equal(s.events, 2);
  assert.deepEqual(s.date_precision, { day: 1, "null (date is no Wikidata P585/P580 value)": 1 });
  assert.equal(s.part_of_nonempty, 1);
  assert.equal(s.part_of_empty, 1);
  assert.equal(s.resolved_qid_same_item, 1);
  assert.equal(s.resolved_qid_other_item, 1);
  assert.equal(s.wikidata_description, 1);
  assert.deepEqual(s.review_reasons_added, { part_of: 1, qid_mismatch: 1 });
  assert.equal(s.with_notes, 1);
});
