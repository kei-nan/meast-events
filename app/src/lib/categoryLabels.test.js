import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryLabel,
  categoryShortLabel,
  categoryBasis,
  categorySummary,
  categorySourceParts,
  categoryNoteOutdated,
  classUrl,
} from "./categoryLabels.js";

const W = "https://www.wikidata.org/wiki/";
const text = (parts) => parts.map((p) => (typeof p === "string" ? p : p.label)).join("");

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

test("a single group: the group alone, and the Wikidata classes behind it when opened", () => {
  const sbarro = { category: "terrorism", wikidata_classes: ["suicide attack"] };
  assert.deepEqual(categoryBasis(sbarro), [["suicide attack", "terrorism"]]);
  assert.equal(categorySummary(sbarro), "Terrorism");
  assert.deepEqual(categorySourceParts(sbarro), ["From Wikidata’s class ", "“", { label: "suicide attack", url: `${W}Q217327` }, "”"]);
  const gaza = { category: "atrocity", wikidata_classes: ["military operation", "bombardment", "genocide"] };
  assert.deepEqual(categoryBasis(gaza), [["genocide", "atrocity"]]);
  assert.equal(categorySummary(gaza), "Atrocity");
  assert.equal(text(categorySourceParts(gaza)), "From Wikidata’s class “genocide”");
  const war = { category: "war", wikidata_classes: ["war", "armed conflict"] };
  assert.equal(categorySummary(war), "War");
  assert.deepEqual(categorySourceParts(war), [
    "From Wikidata’s classes ",
    "“",
    { label: "war", url: `${W}Q198` },
    "”",
    ", “",
    { label: "armed conflict", url: `${W}Q350604` },
    "”",
  ]);
});

test("mixed: the distinct groups in a fixed order, and the classes grouped by group when opened", () => {
  // Invasion of Iraq: Wikidata's classes as stored in data/events.json.
  const iraq = { category: "mixed", wikidata_classes: ["invasion", "military operation", "armed conflict", "political crisis", "international crisis"] };
  assert.equal(categorySummary(iraq), "Mixed: War, Political");
  assert.deepEqual(categorySourceParts(iraq), [
    "From Wikidata’s classes: ",
    { label: "military operation", url: `${W}Q645883` },
    ", ",
    { label: "armed conflict", url: `${W}Q350604` },
    " (War)",
    "; ",
    { label: "political crisis", url: `${W}Q3002772` },
    ", ",
    { label: "international crisis", url: `${W}Q5791104` },
    " (Political)",
  ]);
  // The order of Wikidata's class list plays no part.
  const reversed = { ...iraq, wikidata_classes: [...iraq.wikidata_classes].reverse() };
  assert.equal(categorySummary(reversed), "Mixed: War, Political");
  assert.equal(
    text(categorySourceParts(reversed)),
    "From Wikidata’s classes: armed conflict, military operation (War); international crisis, political crisis (Political)"
  );
  const spring = { category: "mixed", wikidata_classes: ["protest", "civil war", "revolution", "war"] };
  assert.equal(categorySummary(spring), "Mixed: War, Uprising, Protest");
  assert.equal(text(categorySourceParts(spring)), "From Wikidata’s classes: war (War); revolution (Uprising); protest (Protest)");
});

test("unclassified, unknown classes and classes not loaded", () => {
  const regime = { category: "unclassified", wikidata_classes: ["regime change"] };
  assert.equal(categorySummary(regime), "Unclassified");
  assert.deepEqual(categorySourceParts(regime), ["None of its Wikidata classes is on our list"]);
  // A class that is not on the rule's list is never named, and has no link.
  const bomb = { category: "terrorism", wikidata_classes: ["bomb attack"] };
  assert.deepEqual(categorySourceParts(bomb), []);
  assert.equal(classUrl("bomb attack"), null, "only classes on the rule's list have a link");
  assert.equal(classUrl(undefined), null);
  assert.equal(categorySummary({ category: "war" }), "War", "classes not loaded: the group alone");
  assert.deepEqual(categorySourceParts({ category: "war" }), [], "classes not loaded: nothing to open");
  assert.equal(categorySummary({ category: "mixed" }), "Mixed");
  assert.equal(categorySummary({}), "");
  assert.deepEqual(categorySourceParts({}), []);
});

test("Bahr el-Baqar and October 7 render identically apart from the data", () => {
  // Wikidata's classes as stored in data/events.json.
  const bahr = { category: "terrorism", wikidata_classes: ["bomb attack", "terrorist attack"] };
  const oct7 = {
    category: "terrorism",
    wikidata_classes: ["coordinated terrorist attack", "massacre", "offensive", "military raid", "border incident", "terrorist attack"],
  };
  const expected = ["From Wikidata’s class ", "“", { label: "terrorist attack", url: `${W}Q2223653` }, "”"];
  assert.equal(categorySummary(bahr), "Terrorism");
  assert.equal(categorySummary(oct7), "Terrorism");
  assert.deepEqual(categorySourceParts(bahr), expected);
  assert.deepEqual(categorySourceParts(oct7), expected);
});

test("a framing-review category note about a group the event no longer has is recognised", () => {
  const note = 'Shown as "political", a group assigned by hand when the event was added; the explosion was an industrial accident.';
  assert.equal(categoryNoteOutdated(note, "unclassified"), "political");
  assert.equal(categoryNoteOutdated(note, "political"), null);
  assert.equal(categoryNoteOutdated('Shown as "terrorism" because ...', "terrorism"), null);
  assert.equal(categoryNoteOutdated('Wikidata says "assassination campaign"', "war"), null, "only our group ids count");
  assert.equal(categoryNoteOutdated(undefined, "war"), null);
});
