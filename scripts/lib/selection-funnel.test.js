// The published funnel's words follow the data (scripts/build-selection-funnel.js; CI's --check keeps the counts current).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTRIES, EVENT_CLASSES } from "./event-classes.js";
import { FIXES_BY_QID } from "./fixes.js";

const read = (n) => JSON.parse(readFileSync(new URL(`../../data/${n}`, import.meta.url), "utf-8"));
const funnel = read("selection-funnel.json");

test("the raw-candidates label names the class and country counts discovery uses", () => {
  const raw = funnel.stages.find((s) => s.stage === "raw_candidates");
  assert.equal(raw.label, `Raw Wikidata candidates (${EVENT_CLASSES.length} event classes, ${Object.keys(COUNTRIES).length} tracked countries, dated 1900+)`);
});

test("shown_now counts the hand-picked events found by discovery whose countries are not Wikidata's", () => {
  const curated = read("events.json");
  const candidates = new Map(read("event-candidates.json").map((c) => [c.wikidata_qid, c]));
  const seeds = curated.filter((e) => e.sitelinks === undefined && candidates.has(e.wikidata_qid));
  const differ = seeds.filter((e) => {
    const c = candidates.get(e.wikidata_qid).countries ?? [];
    const a = new Set(e.countries ?? []);
    return a.size !== new Set(c).size || c.some((x) => !a.has(x));
  });
  assert.equal(funnel.shown_now.seed_events_also_found_by_discovery, seeds.length);
  assert.equal(funnel.shown_now.seed_events_found_with_other_countries_than_wikidata, differ.length);
  assert.ok(differ.length > 0 && differ.length <= seeds.length);
});

test("shown_now counts the hand-picked start dates that are none of the item's Wikidata P585/P580 values", () => {
  // As the pipeline stored its comparison (build-selection-funnel.js): no date_precision, or one from ledger F14.
  const seeds = read("events.json").filter((e) => e.sitelinks === undefined);
  const f14 = seeds.filter((e) => FIXES_BY_QID.get(e.wikidata_qid)?.ref === "F14");
  const none = seeds.filter((e) => e.date_precision == null);
  assert.equal(funnel.shown_now.seed_start_dates_none_of_wikidata_values, none.length + f14.length);
  assert.equal(funnel.shown_now.seed_start_dates_none_of_wikidata_values_checked_against_article, f14.length);
  // F14 dates carry day precision from the article, so the two groups never overlap.
  assert.ok(f14.length > 0 && f14.every((e) => e.date_precision === "day"));
});
