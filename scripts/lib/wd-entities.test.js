// wd-entities.js dates: Julian calendar values read as the Wikidata Query Service gives them (no network).
import test from "node:test";
import assert from "node:assert/strict";
import { JULIAN, fetchEntities, julianToGregorian, refreshFromEntities, wikidataDate } from "./wd-entities.js";
import { fetchEntity } from "./wiki.js";

const GREGORIAN = "http://www.wikidata.org/entity/Q1985727";
const tv = (time, precision, calendarmodel = GREGORIAN) => ({ time, timezone: 0, before: 0, after: 0, precision, calendarmodel });

test("julianToGregorian: the conversion table's century boundaries and the 1582 reform", () => {
  // en.wikipedia "Conversion between Julian and Gregorian calendars", table of differences.
  assert.equal(julianToGregorian(1582, 10, 5), "1582-10-15");
  assert.equal(julianToGregorian(1700, 2, 18), "1700-02-28");
  assert.equal(julianToGregorian(1700, 2, 19), "1700-03-01");
  assert.equal(julianToGregorian(1800, 2, 17), "1800-02-28");
  assert.equal(julianToGregorian(1800, 2, 18), "1800-03-01");
  // 1900 is a Julian leap year, not a Gregorian one: Julian 29 February 1900 exists.
  assert.equal(julianToGregorian(1900, 2, 28), "1900-03-12");
  assert.equal(julianToGregorian(1900, 2, 29), "1900-03-13");
  assert.equal(julianToGregorian(1900, 3, 1), "1900-03-14");
  assert.equal(julianToGregorian(2100, 2, 15), "2100-02-28");
  assert.equal(julianToGregorian(2100, 2, 16), "2100-03-01");
  // Year end: Julian 19 December 1917 is already 1 January 1918.
  assert.equal(julianToGregorian(1917, 12, 19), "1918-01-01");
  // Days the Julian calendar does not have; BCE and malformed input.
  assert.equal(julianToGregorian(1900, 2, 30), null);
  assert.equal(julianToGregorian(1901, 2, 29), null);
  assert.equal(julianToGregorian(1917, 13, 1), null);
  assert.equal(julianToGregorian(0, 1, 1), null);
});

test("wikidataDate: a Julian day becomes the Gregorian day WDQS gives (both checked live 2026-11-03)", () => {
  // german-ottoman-alliance (Q261982) P585 and armistice-of-erzincan (Q28048694) P585, as wbgetentities returns them;
  // WDQS wikibase:timeValue for the same statements: 1914-08-02 and 1917-12-18.
  assert.equal(wikidataDate(tv("+1914-07-20T00:00:00Z", 11, JULIAN)), "1914-08-02");
  assert.equal(wikidataDate(tv("+1917-12-05T00:00:00Z", 11, JULIAN)), "1917-12-18");
  assert.equal(wikidataDate(tv("+1900-02-29T00:00:00Z", 11, JULIAN)), "1900-03-13");
});

test("wikidataDate: Gregorian unchanged; a Julian value less precise than a day kept as written (as WDQS keeps it)", () => {
  assert.equal(wikidataDate(tv("+1914-08-02T00:00:00Z", 11)), "1914-08-02");
  assert.equal(wikidataDate(tv("+1940-00-00T00:00:00Z", 9)), "1940-00-00");
  assert.equal(wikidataDate(tv("+1917-12-00T00:00:00Z", 10, JULIAN)), "1917-12-00");
  assert.equal(wikidataDate(tv("+1917-00-00T00:00:00Z", 9, JULIAN)), "1917-00-00");
  // A Julian day that cannot be converted stays as written.
  assert.equal(wikidataDate(tv("+1917-12-00T00:00:00Z", 11, JULIAN)), "1917-12-00");
});

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
async function withFetch(body, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => json(body);
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
  }
}
const claim = (value) => ({ rank: "normal", mainsnak: { snaktype: "value", datavalue: { type: "time", value } } });

test("fetchEntities / fetchEntity: Julian P585 stored as its Gregorian day (german-ottoman-alliance, Q261982)", async () => {
  const ent = { id: "Q261982", sitelinks: {}, claims: { P585: [claim(tv("+1914-07-20T00:00:00Z", 11, JULIAN))] } };
  await withFetch({ entities: { Q261982: ent } }, async () => {
    const rec = (await fetchEntities(["Q261982"], { props: "claims", delayMs: 0 })).get("Q261982");
    assert.deepEqual(rec.p585, [{ time: "1914-08-02", precision: 11 }]);
    const e = await fetchEntity("Q261982");
    assert.deepEqual(e.pit, [{ date: "1914-08-02", precision: 11 }]);
  });
});

test("refreshFromEntities: a redirected (merged) QID is skipped and reported, not given the target's values", () => {
  const events = [
    { id: "a", wikidata_qid: "Q1", sitelinks_current: 10, wikidata_aliases: ["A"] },
    { id: "b", wikidata_qid: "Q2", sitelinks_current: 20, wikidata_aliases: ["B"] },
    { id: "c", wikidata_qid: "Q3", sitelinks_current: 30 },
  ];
  const entities = new Map([
    ["Q1", { qid: "Q1", requested: "Q1", redirected: false, sitelinks_all: 11, aliases: ["A", "AA"], p582_open: null }],
    ["Q2", { qid: "Q9", requested: "Q2", redirected: true, sitelinks_all: 99, aliases: ["Target"], p582_open: "novalue" }],
    ["Q3", null],
  ]);
  const logs = [];
  const r = refreshFromEntities(events, entities, { log: (m) => logs.push(m) });
  assert.deepEqual(r, { changed: 1, aliasesChanged: 1, openChanged: 0, missing: ["c (Q3)"], redirected: ["b (Q2 -> Q9)"] });
  assert.deepEqual(events[0], { id: "a", wikidata_qid: "Q1", sitelinks_current: 11, wikidata_aliases: ["A", "AA"] });
  assert.deepEqual(events[1], { id: "b", wikidata_qid: "Q2", sitelinks_current: 20, wikidata_aliases: ["B"] });
  assert.deepEqual(logs, ["a: 10 -> 11", 'a: aliases ["A"] -> ["A","AA"]']);
  // --aliases-only leaves the counts.
  const ev2 = [{ id: "a", wikidata_qid: "Q1", sitelinks_current: 10 }];
  assert.equal(refreshFromEntities(ev2, entities, { aliasesOnly: true }).changed, 0);
  assert.equal(ev2[0].sitelinks_current, 10);
});
