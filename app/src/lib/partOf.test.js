import test from "node:test";
import assert from "node:assert/strict";
import { resolvePartOf, wikidataUrl } from "./partOf.js";

const ev = (id, qid, date, part_of, title = id) => ({ id, title, wikidata_qid: qid, date_start: date, part_of });

test("a curated parent resolves to its event; a non-curated one keeps only Wikidata's label", () => {
  const events = [
    ev("war", "Q1", "2023-10-07", undefined, "Gaza war (title)"),
    ev("battle", "Q2", "2023-10-08", [{ qid: "Q1", label: "Gaza War" }, { qid: "Q9", label: "Some campaign" }]),
  ];
  const r = resolvePartOf(events);
  assert.deepEqual(r.get("battle").part_of, [
    { qid: "Q1", label: "Gaza War", id: "war" },
    { qid: "Q9", label: "Some campaign" },
  ]);
  assert.deepEqual(r.get("battle").includes, []);
  assert.deepEqual(r.get("war"), { part_of: [], includes: [{ id: "battle", title: "battle", date_start: "2023-10-08" }] });
});

test("children are sorted oldest first, ties by title", () => {
  const p = [{ qid: "Q1", label: "War" }];
  const r = resolvePartOf([
    ev("war", "Q1", "1980-09-22"),
    ev("c", "Q4", "1984-01-01", p, "Charlie"),
    ev("a", "Q2", "1982-05-01", p, "Bravo"),
    ev("b", "Q3", "1982-05-01", p, "Alpha"),
  ]);
  assert.deepEqual(r.get("war").includes.map((x) => x.id), ["b", "a", "c"]);
});

test("labels are kept exactly; duplicates, self-references and malformed QIDs are skipped", () => {
  const r = resolvePartOf([
    ev("x", "Q5", "2000", [
      { qid: "Q7", label: "  Odd label – as given " },
      { qid: "Q7", label: "dup" },
      { qid: "Q5", label: "itself" },
      { qid: "nope", label: "bad" },
      null,
      { qid: "Q8" },
    ]),
  ]);
  assert.deepEqual(r.get("x").part_of, [
    { qid: "Q7", label: "  Odd label – as given " },
    { qid: "Q8", label: "Q8" },
  ]);
});

test("events with no relation are absent; nesting works both ways", () => {
  const r = resolvePartOf([
    ev("lonely", "Q1", "1950", []),
    ev("top", "Q2", "1960"),
    ev("mid", "Q3", "1961", [{ qid: "Q2", label: "Top" }]),
    ev("leaf", "Q4", "1962", [{ qid: "Q3", label: "Mid" }]),
  ]);
  assert.equal(r.has("lonely"), false);
  assert.deepEqual(r.get("mid").part_of.map((p) => p.id), ["top"]);
  assert.deepEqual(r.get("mid").includes.map((c) => c.id), ["leaf"]);
});

test("wikidataUrl only accepts well-formed QIDs", () => {
  assert.equal(wikidataUrl("Q42"), "https://www.wikidata.org/wiki/Q42");
  assert.equal(wikidataUrl("Q0"), null);
  assert.equal(wikidataUrl("javascript:alert(1)"), null);
  assert.equal(wikidataUrl(undefined), null);
});
