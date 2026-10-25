import test from "node:test";
import assert from "node:assert/strict";
import {
  COUNTRIES,
  QID_TO_COUNTRY,
  ALL_COUNTRY_QIDS,
  EVENT_CLASSES,
  OVERRIDING_GROUPS,
  groupForEvent,
  groupBasis,
  GROUPS,
  UNCLASSIFIED,
} from "./event-classes.js";

test("15 tracked countries/territories; every QID maps back to exactly one of them", () => {
  assert.equal(Object.keys(COUNTRIES).length, 15);
  assert.equal(new Set(ALL_COUNTRY_QIDS).size, ALL_COUNTRY_QIDS.length, "a QID listed under two names would map to only one");
  assert.equal(Object.keys(QID_TO_COUNTRY).length, ALL_COUNTRY_QIDS.length);
  for (const [name, qids] of Object.entries(COUNTRIES)) for (const q of qids) assert.equal(QID_TO_COUNTRY[q], name);
  assert.equal(QID_TO_COUNTRY.Q801, "Israel/Palestine");
  assert.equal(QID_TO_COUNTRY.Q219060, "Israel/Palestine", "State of Palestine");
  assert.ok(ALL_COUNTRY_QIDS.every((q) => /^Q[1-9]\d*$/.test(q)));
});

test("event classes: unique QIDs and labels, each with a known coarse group", () => {
  const qids = EVENT_CLASSES.map((c) => c.qid);
  const labels = EVENT_CLASSES.map((c) => c.label);
  assert.equal(new Set(qids).size, qids.length);
  assert.equal(new Set(labels).size, labels.length, "groupForEvent looks classes up by label");
  const groups = new Set(EVENT_CLASSES.map((c) => c.category));
  for (const g of OVERRIDING_GROUPS) assert.ok(groups.has(g), `${g} is the group of some class`);
});

test("groupForEvent: terrorism outranks atrocity, whatever order Wikidata lists the classes in", () => {
  assert.equal(groupForEvent(["massacre", "terrorist attack"]), "terrorism");
  assert.equal(groupForEvent(["terrorist attack", "massacre"]), "terrorism");
  assert.equal(groupForEvent(["war crime", "battle"]), "atrocity");
  assert.equal(groupForEvent(["genocide"]), "atrocity");
  assert.equal(groupForEvent(["hostage taking", "siege"]), "terrorism");
  // 2026-10-07: a suicide attack is terrorism whether or not Wikidata also types it "terrorist attack".
  assert.equal(groupForEvent(["suicide attack"]), "terrorism");
  assert.equal(groupForEvent(["suicide attack", "mass murder"]), "terrorism");
  assert.equal(groupForEvent(["pogrom"]), "atrocity");
  assert.equal(groupForEvent(["riot", "protest"]), "protest", "protest is not overriding");
});

test("groupForEvent: without an overriding class, the first listed class in table order decides; no hand-kept group", () => {
  assert.equal(groupForEvent(["battle", "siege"]), "war");
  assert.equal(groupForEvent(["treaty"]), "treaty");
  // Table order, not Wikidata's statement order: "military operation" comes before "assassination".
  assert.equal(groupForEvent(["assassination", "airstrike", "military operation"]), "war");
  assert.equal(groupForEvent(["peace treaty", "treaty"]), "treaty", "an unlisted class is skipped");
  assert.equal(groupForEvent(["coup d'état"]), "political");
  assert.equal(groupForEvent(["some class we do not track", "Q12345"]), UNCLASSIFIED);
  assert.equal(groupForEvent([]), UNCLASSIFIED);
  assert.equal(groupForEvent(undefined), UNCLASSIFIED);
  assert.ok(GROUPS.includes(UNCLASSIFIED));
});

test("groupForEvent: ethnic cleansing is in the overriding atrocity group, whoever the victims are", () => {
  assert.equal(EVENT_CLASSES.find((c) => c.label === "ethnic cleansing").qid, "Q154278");
  assert.equal(groupForEvent(["population transfer", "ethnic cleansing"]), "atrocity");
  assert.equal(groupForEvent(["population transfer"]), "migration");
});

test("groupBasis: names the classes that decided the group", () => {
  assert.deepEqual(groupBasis(["suicide attack", "battle"]), { group: "terrorism", classes: ["suicide attack"] });
  assert.deepEqual(groupBasis(["massacre", "genocide", "war"]), { group: "atrocity", classes: ["massacre", "genocide"] });
  assert.deepEqual(groupBasis(["revolt", "armed conflict", "military operation"]), { group: "war", classes: ["military operation"] });
  assert.deepEqual(groupBasis(["regime change"]), { group: UNCLASSIFIED, classes: [] });
});

test("not events: unique QIDs/labels, none of them an event class; matched by stored label", async () => {
  const { NOT_EVENT_CLASSES, notEventClasses } = await import("./event-classes.js");
  assert.equal(new Set(NOT_EVENT_CLASSES.map((c) => c.qid)).size, NOT_EVENT_CLASSES.length);
  assert.equal(new Set(NOT_EVENT_CLASSES.map((c) => c.label)).size, NOT_EVENT_CLASSES.length);
  const eventLabels = new Set(EVENT_CLASSES.map((c) => c.label));
  assert.ok(NOT_EVENT_CLASSES.every((c) => !eventLabels.has(c.label)));
  // The classes of the entries removed on 2026-10-09 and of Jordanian independence (history of Jordan, Q1639050).
  for (const classes of [["human"], ["historical country", "kingdom"], ["state", "historical country"], ["organization", "military alliance"],
    ["political organization", "political coalition"], ["caliphate", "armed organization", "self-proclaimed state"], ["history of a country or state"]]) {
    assert.ok(notEventClasses(classes).length > 0, classes.join(", "));
  }
  // Events about them stay; a social movement is kept (Iranian Green Movement).
  for (const classes of [["capital punishment"], ["social movement"], ["military operation"], ["League of Nations mandate", "British protectorate"], []]) {
    assert.deepEqual(notEventClasses(classes), [], classes.join(", "));
  }
});
