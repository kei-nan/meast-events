import test from "node:test";
import assert from "node:assert/strict";
import {
  COUNTRIES,
  QID_TO_COUNTRY,
  ALL_COUNTRY_QIDS,
  EVENT_CLASSES,
  OVERRIDING_GROUPS,
  groupForEvent,
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
  assert.equal(groupForEvent(["massacre", "terrorist attack"], "political"), "terrorism");
  assert.equal(groupForEvent(["terrorist attack", "massacre"], "political"), "terrorism");
  assert.equal(groupForEvent(["war crime", "battle"], "war"), "atrocity");
  assert.equal(groupForEvent(["genocide"], "political"), "atrocity");
  assert.equal(groupForEvent(["hostage taking", "siege"], "war"), "terrorism");
});

test("groupForEvent: without an overriding class the event keeps its group", () => {
  assert.equal(groupForEvent(["battle", "siege"], "war"), "war");
  assert.equal(groupForEvent(["treaty"], "diplomatic"), "diplomatic", "a non-overriding class does not regroup");
  assert.equal(groupForEvent(["some class we do not track", "Q12345"], "political"), "political");
  assert.equal(groupForEvent([], "treaty"), "treaty");
  assert.equal(groupForEvent(undefined, "war"), "war");
});
