import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handPickedCountriesClause } from "./funnelText.js";

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

test("the committed funnel has the counts the About sentence uses, and About types no count of its own", () => {
  const funnel = JSON.parse(readFileSync(new URL("../../../data/selection-funnel.json", import.meta.url), "utf8"));
  assert.notEqual(handPickedCountriesClause(funnel.shown_now), "");
  const about = readFileSync(new URL("../components/AboutData.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(about, /of the \d+ the rule also finds/);
  assert.match(about, /handPickedCountriesClause\(funnel\.data\?\.shown_now\)/);
});
