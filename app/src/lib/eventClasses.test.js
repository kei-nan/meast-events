import test from "node:test";
import assert from "node:assert/strict";
import { EVENT_CLASSES } from "../../../scripts/lib/event-classes.js";
import { RULE_CLASS_LABELS, shownClasses } from "./eventClasses.js";
import { FALLBACK_PLACES, fallbackLocationNote } from "./fallbackPoint.js";
import { COUNTRY_CAPITALS } from "../../../scripts/lib/geo.js";

test("RULE_CLASS_LABELS is the pipeline's event-class list", () => {
  assert.deepEqual([...RULE_CLASS_LABELS].sort(), EVENT_CLASSES.map((c) => c.label).sort());
});

test("shownClasses: only classes on the list, in Wikidata's order; none when they repeat the category", () => {
  // As in the data: gaza-strip-famine, turkish-capture-of-smyrna, june-2025-israeli-strikes-on-iran.
  assert.deepEqual(shownClasses({ category: "atrocity", wikidata_classes: ["famine", "starvation", "fake news", "genocide"] }), ["genocide"]);
  assert.deepEqual(shownClasses({ category: "war", wikidata_classes: ["liberation", "battle"] }), ["battle"]);
  assert.deepEqual(shownClasses({ category: "war", wikidata_classes: ["preemptive war", "airstrike", "sabotage", "war"] }), ["airstrike", "war"]);
  assert.deepEqual(shownClasses({ category: "war", wikidata_classes: ["war", "world war"] }), []);
  assert.deepEqual(shownClasses({ category: "political", wikidata_classes: ["document", "public statement"] }), []);
  assert.deepEqual(shownClasses({}), []);
});

test("fallbackLocationNote: a reference point named by country and city, never a capital", () => {
  assert.deepEqual(Object.keys(FALLBACK_PLACES).sort(), Object.keys(COUNTRY_CAPITALS).sort());
  const ip = fallbackLocationNote({ coordinate_source: "country-fallback:Israel/Palestine" });
  assert.match(ip, /reference point used for every such event of Israel\/Palestine \(Jerusalem\), whatever its date\./);
  assert.match(ip, /says nothing about the status of that city\.$/);
  assert.doesNotMatch(ip, /capital/);
  // Before the full record arrives (no coordinate_source yet).
  assert.match(fallbackLocationNote({}), /placed at a fixed reference point for one of its countries\. The marker shows the country, not where the event happened\.$/);
});
