import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handPickedCountriesClause, handPickedStartDatesSentence } from "./funnelText.js";

test("handPickedCountriesClause: the About sentence's counts come from selection-funnel.json", () => {
  assert.equal(
    handPickedCountriesClause({ seed_events_also_found_by_discovery: 61, seed_events_found_with_other_countries_than_wikidata: 25 }),
    "of the 61 the rule also finds, 25 have other countries than Wikidata gives, and "
  );
  assert.equal(
    handPickedCountriesClause({ seed_events_also_found_by_discovery: 3, seed_events_found_with_other_countries_than_wikidata: 1 }),
    "of the 3 the rule also finds, 1 has other countries than Wikidata gives, and "
  );
  // loading, failed, or a file without the counts: the sentence goes on without them
  assert.equal(handPickedCountriesClause(undefined), "");
  assert.equal(handPickedCountriesClause({ seed_events_also_found_by_discovery: 61 }), "");
});

test("handPickedStartDatesSentence: the hand-picked start dates that are no Wikidata value, from selection-funnel.json", () => {
  const counts = (none, checked) => ({
    seed_start_dates_none_of_wikidata_values: none,
    seed_start_dates_none_of_wikidata_values_checked_against_article: checked,
  });
  assert.equal(
    handPickedStartDatesSentence(counts(19, 11)),
    "19 hand-picked start dates are none of the item's Wikidata dates (11 of them checked against the article). "
  );
  assert.equal(
    handPickedStartDatesSentence(counts(1, 0)),
    "1 hand-picked start date is none of the item's Wikidata dates (0 of them checked against the article). "
  );
  assert.equal(handPickedStartDatesSentence(undefined), "");
  assert.equal(handPickedStartDatesSentence({ seed_start_dates_none_of_wikidata_values: 19 }), "");
});

// That About renders these sentences from the loaded file, and types no count of its own, is checked on the
// rendered dialog (components/AboutData.test.js).
test("the committed funnel has the counts the About sentence uses", () => {
  const funnel = JSON.parse(readFileSync(new URL("../../../data/selection-funnel.json", import.meta.url), "utf8"));
  assert.notEqual(handPickedCountriesClause(funnel.shown_now), "");
  assert.notEqual(handPickedStartDatesSentence(funnel.shown_now), "");
});
