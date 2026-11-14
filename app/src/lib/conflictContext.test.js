import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GROUP_MAX, resolveContext } from "./conflictContext.js";

const ev = (id, date_start, countries, part_of = [], wikidata_qid) => ({ id, title: id, date_start, countries, part_of, wikidata_qid });
const p = (qid, label = qid) => ({ qid, label });

test("two events in different narrow groups of one wider group get the same events", () => {
  // "Framing" groups A and B are both part of the war W (an event here).
  const events = [
    ev("war", "2000-01-01", ["X"], [], "Q1"),
    ev("a1", "2001-01-01", ["X"], [p("Q2")]),
    ev("b1", "2004-01-01", ["X"], [p("Q3")]),
    ev("groupA", "2001-01-01", ["X"], [p("Q1")], "Q2"),
    ev("groupB", "2004-01-01", ["X"], [p("Q1")], "Q3"),
  ];
  const c = resolveContext(events);
  assert.deepEqual(c.get("a1").groups.filter((g) => g.own).map((g) => g.qid), ["Q1"]);
  assert.deepEqual(c.get("a1").ids, c.get("b1").ids);
  assert.ok(c.get("a1").ids.includes("b1") && c.get("b1").ids.includes("a1"));
});

test("a group wider than GROUP_MAX is not used when a narrower one fits; a list article never is", () => {
  const filler = Array.from({ length: GROUP_MAX + 1 }, (_, i) => ev(`f${i}`, "1950-01-01", ["Z"], [p("Q9", "Huge")]));
  const events = [...filler, ev("e", "1990-01-01", ["Y"], [p("Q9", "Huge"), p("Q8", "Small"), p("Q7", "list of wars")]), ev("s", "1995-01-01", ["W"], [p("Q8", "Small"), p("Q7", "list of wars")])];
  const c = resolveContext(events).get("e");
  assert.deepEqual(c.groups.map((g) => g.label), ["Small"]);
  assert.deepEqual(c.ids, ["e", "s"]);
});

test("an event whose only groups are too wide gets the narrowest of them", () => {
  const filler = Array.from({ length: GROUP_MAX + 1 }, (_, i) => ev(`f${i}`, "1950-01-01", ["Z"], [p("Q9")]));
  const more = Array.from({ length: GROUP_MAX + 5 }, (_, i) => ev(`g${i}`, "1950-01-01", ["Z"], [p("Q10")]));
  const c = resolveContext([...filler, ...more, ev("e", "1990-01-01", ["Y"], [p("Q9"), p("Q10")])]).get("e");
  assert.deepEqual(c.groups.map((g) => g.qid), ["Q9"]);
});

test("place and time: same country within NEAR_YEARS, and those events' groups one step", () => {
  const events = [
    ev("alone", "1988-03-16", ["Iraq"]),
    ev("battle", "1987-06-01", ["Iran", "Iraq"], [p("Q50", "The war")]),
    ...["w1", "w2", "w3"].map((id, i) => ev(id, `198${i}-01-01`, ["Iran"], [p("Q50", "The war")])),
    ev("far", "1990-01-01", ["Iraq"]),
    ev("other-country", "1988-01-01", ["Oman"]),
  ];
  const c = resolveContext(events).get("alone");
  assert.equal(c.near.size, 2); // itself and "battle"
  assert.deepEqual(c.groups.map((g) => [g.label, g.own]), [["The war", false]]);
  assert.deepEqual(c.ids, ["w1", "w2", "w3", "battle", "alone"]);
});

test("order is by start date, undated last, and stable", () => {
  const events = [ev("c", null, ["X"], [p("Q1")]), ev("b", "2001", ["X"], [p("Q1")]), ev("a", "2000-05-01", ["X"], [p("Q1")]), ev("a2", "2000-05-01", ["X"], [p("Q1")])];
  assert.deepEqual(resolveContext(events).get("c").ids, ["a", "a2", "b", "c"]);
});

// The real data: events a reader on each side might start from. Each must reach the other.
const events = JSON.parse(readFileSync(new URL("../../../data/events.json", import.meta.url), "utf8"));
const ctx = resolveContext(events);
const ids = new Set(events.map((e) => e.id));

const BOTH_WAYS = [
  ["october-7-attacks", "gaza-genocide"],
  ["deir-yassin-massacre", "hadassah-medical-convoy-massacre"],
  ["nakba", "1948-arab-israeli-war"],
  ["palestinian-expulsion-from-lydda-and-ramle", "kfar-etzion-massacre"],
  ["damour-massacre", "tel-al-zaatar-massacre"],
  ["2006-lebanon-war", "2006-qana-airstrike"],
];
// Known gaps (the first reaches the second, not the reverse): eight years apart, and
// Wikidata places the second in no group that holds the first.
const ONE_WAY = [
  ["halabja-massacre", "battle-of-khorramshahr-1980"],
  ["iran-air-flight-655", "tanker-war"],
];

test("real data: events from opposite sides of a conflict each reach the other", () => {
  for (const [a, b] of [...BOTH_WAYS, ...ONE_WAY]) assert.ok(ids.has(a) && ids.has(b), `test pair names a missing event: ${a} / ${b}`);
  for (const [a, b] of BOTH_WAYS) {
    assert.ok(ctx.get(a).ids.includes(b), `${a} does not reach ${b}`);
    assert.ok(ctx.get(b).ids.includes(a), `${b} does not reach ${a}`);
  }
  for (const [a, b] of ONE_WAY) assert.ok(ctx.get(a).ids.includes(b), `${a} does not reach ${b}`);
});

test("real data: the two Wikidata framings of the Gaza war give exactly the same events", () => {
  assert.deepEqual(ctx.get("october-7-attacks").ids, ctx.get("gaza-genocide").ids);
});

test("real data: every event is in its own context, and every id is an event", () => {
  for (const [id, c] of ctx) {
    assert.ok(c.ids.includes(id), id);
    for (const x of c.ids) assert.ok(ids.has(x), `${id}: ${x}`);
  }
});
