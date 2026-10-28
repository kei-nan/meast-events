import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryLabel,
  categoryShortLabel,
  categoryBasis,
  categoryBasisParts,
  categoryWithBasis,
  categoryNoteOutdated,
  classUrl,
} from "./categoryLabels.js";

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

test("the header names the Wikidata classes behind the group, the same way for every event", () => {
  const sbarro = { category: "terrorism", wikidata_classes: ["suicide attack"] };
  assert.deepEqual(categoryBasis(sbarro), [["suicide attack", "terrorism"]]);
  assert.equal(categoryWithBasis(sbarro), "Terrorism, from Wikidata\u2019s class \u201csuicide attack\u201d");
  const bahr = { category: "terrorism", wikidata_classes: ["bomb attack", "terrorist attack"] };
  assert.equal(categoryWithBasis(bahr), "Terrorism, from Wikidata\u2019s class \u201cterrorist attack\u201d");
  const gaza = { category: "atrocity", wikidata_classes: ["military operation", "bombardment", "genocide"] };
  assert.deepEqual(categoryBasis(gaza), [["genocide", "atrocity"]]);
  const war = { category: "war", wikidata_classes: ["war", "armed conflict"] };
  assert.equal(categoryWithBasis(war), "War, from Wikidata\u2019s classes \u201cwar\u201d, \u201carmed conflict\u201d");
  const spring = { category: "mixed", wikidata_classes: ["protest", "civil war", "revolution", "war"] };
  assert.equal(
    categoryWithBasis(spring),
    "Mixed \u2014 Wikidata\u2019s classes point to more than one group: protest (Protest), revolution (Uprising), war (War)"
  );
  assert.equal(
    categoryWithBasis({ category: "unclassified", wikidata_classes: ["regime change"] }),
    "Unclassified: none of its Wikidata classes is on our list"
  );
  assert.equal(categoryWithBasis({ category: "war" }), "War", "classes not loaded: the group alone");
});

test("each class named in the header links to its own Wikidata class item, for every group alike", () => {
  const W = "https://www.wikidata.org/wiki/";
  // Bahr el-Baqar primary school bombing: Wikidata's classes as stored in data/events.json.
  const bahr = { category: "terrorism", wikidata_classes: ["bomb attack", "terrorist attack"] };
  assert.deepEqual(categoryBasisParts(bahr), [
    "Terrorism, from Wikidata’s class ",
    "“",
    { label: "terrorist attack", url: `${W}Q2223653` },
    "”",
  ]);
  // October 7 attacks: the same rule and the same class.
  const oct7 = {
    category: "terrorism",
    wikidata_classes: ["coordinated terrorist attack", "massacre", "offensive", "military raid", "border incident", "terrorist attack"],
  };
  assert.deepEqual(categoryBasisParts(oct7).filter((p) => typeof p !== "string"), [{ label: "terrorist attack", url: `${W}Q2223653` }]);
  assert.equal(categoryWithBasis(oct7), "Terrorism, from Wikidata’s class “terrorist attack”");
  const war = { category: "war", wikidata_classes: ["war", "armed conflict"] };
  assert.deepEqual(categoryBasisParts(war), [
    "War, from Wikidata’s classes ",
    "“",
    { label: "war", url: `${W}Q198` },
    "”",
    ", “",
    { label: "armed conflict", url: `${W}Q350604` },
    "”",
  ]);
  const spring = { category: "mixed", wikidata_classes: ["protest", "revolution"] };
  assert.deepEqual(categoryBasisParts(spring), [
    "Mixed — Wikidata’s classes point to more than one group: ",
    { label: "protest", url: `${W}Q273120` },
    " (Protest)",
    ", ",
    { label: "revolution", url: `${W}Q10931` },
    " (Uprising)",
  ]);
  assert.deepEqual(categoryBasisParts({ category: "war" }), ["War"]);
  assert.deepEqual(categoryBasisParts({}), []);
  assert.equal(classUrl("bomb attack"), null, "only classes on the rule's list have a link");
  assert.equal(classUrl(undefined), null);
});

test("a framing-review category note about a group the event no longer has is recognised", () => {
  const note = 'Shown as "political", a group assigned by hand when the event was added; the explosion was an industrial accident.';
  assert.equal(categoryNoteOutdated(note, "unclassified"), "political");
  assert.equal(categoryNoteOutdated(note, "political"), null);
  assert.equal(categoryNoteOutdated('Shown as "terrorism" because ...', "terrorism"), null);
  assert.equal(categoryNoteOutdated('Wikidata says "assassination campaign"', "war"), null, "only our group ids count");
  assert.equal(categoryNoteOutdated(undefined, "war"), null);
});
