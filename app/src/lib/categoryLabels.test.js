import test from "node:test";
import assert from "node:assert/strict";
import { categoryLabel, categoryShortLabel, categoryBasis, categoryWithBasis, categoryNoteOutdated } from "./categoryLabels.js";

test("category labels match the legend and never drop unknown ids", () => {
  assert.equal(categoryLabel("war"), "War");
  assert.equal(categoryLabel("atrocity"), "Atrocity (genocide, massacre, war crime, ethnic cleansing)");
  assert.equal(categoryLabel("famine"), "Famine");
  assert.equal(categoryLabel(""), "");
});

test("short labels drop only the parenthetical gloss", () => {
  assert.equal(categoryShortLabel("atrocity"), "Atrocity");
  assert.equal(categoryShortLabel("war"), "War");
  assert.equal(categoryShortLabel("famine"), "Famine");
});

test("the header names the Wikidata class that decided the group, the same way for every event", () => {
  const sbarro = { category: "terrorism", wikidata_classes: ["suicide attack"] };
  assert.deepEqual(categoryBasis(sbarro), ["suicide attack"]);
  assert.equal(categoryWithBasis(sbarro), "Terrorism, from Wikidata’s class “suicide attack”");
  const bahr = { category: "terrorism", wikidata_classes: ["bomb attack", "terrorist attack"] };
  assert.equal(categoryWithBasis(bahr), "Terrorism, from Wikidata’s class “terrorist attack”");
  const gaza = { category: "atrocity", wikidata_classes: ["military operation", "bombardment", "genocide"] };
  assert.deepEqual(categoryBasis(gaza), ["genocide"]);
  const exodus = { category: "atrocity", wikidata_classes: ["ethnic cleansing", "population transfer"] };
  assert.deepEqual(categoryBasis(exodus), ["ethnic cleansing"]);
  // Table order: "military operation" before "assassination", whatever order Wikidata lists them in.
  const strike = { category: "war", wikidata_classes: ["assassination", "airstrike", "military operation"] };
  assert.equal(categoryWithBasis(strike), "War, from Wikidata’s class “military operation”");
  const twoAtrocity = { category: "atrocity", wikidata_classes: ["massacre", "mass murder"] };
  assert.match(categoryWithBasis(twoAtrocity), /classes “massacre”, “mass murder”$/);
  assert.equal(
    categoryWithBasis({ category: "unclassified", wikidata_classes: ["regime change"] }),
    "Unclassified: none of its Wikidata classes is on our list"
  );
  assert.equal(categoryWithBasis({ category: "war" }), "War", "classes not loaded: the group alone");
});

test("a framing-review category note about a group the event no longer has is recognised", () => {
  const note = 'Shown as "political", a group assigned by hand when the event was added; the explosion was an industrial accident.';
  assert.equal(categoryNoteOutdated(note, "unclassified"), "political");
  assert.equal(categoryNoteOutdated(note, "political"), null);
  assert.equal(categoryNoteOutdated('Shown as "terrorism" because ...', "terrorism"), null);
  assert.equal(categoryNoteOutdated('Wikidata says "assassination campaign"', "war"), null, "only our group ids count");
  assert.equal(categoryNoteOutdated(undefined, "war"), null);
});
