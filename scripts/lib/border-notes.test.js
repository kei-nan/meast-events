// Border notes and citations shown to readers (scripts/boundary-corrections.js and the
// data/boundaries.json built from it), the cities' names by year (app/src/data/cities.json),
// and the pre-2000 year of the border report (scripts/verify-borders.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CORRECTIONS } from "../boundary-corrections.js";
import { existedIn, EARLY_YEAR, WIKIDATA_DATES } from "../verify-borders.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf-8");
const boundaries = JSON.parse(read("../../data/boundaries.json")).features;

test("no citation to an English Wikipedia title that does not exist (checked 2026-11-06)", () => {
  // Neither title has ever existed (no page, no deletion or move log).
  const dead = ["wiki/Hawar_Islands_dispute", "wiki/Republic_of_Turkey_(1923%E2%80%93present)"];
  for (const c of CORRECTIONS) for (const d of dead) assert.ok(!String(c.source ?? "").includes(d), `${c.target ?? c.name}: ${d}`);
  for (const f of boundaries) for (const d of dead) assert.ok(!f.properties.source?.includes(d), `${f.properties.name}: ${d}`);
  assert.ok(boundaries.some((f) => f.properties.name === "Bahrain" && f.properties.source.includes("wiki/Qatar_v._Bahrain")));
});

test("West Bank 1967-1994: the note does not deny the Jericho transfer of 4 May 1994", () => {
  const f = boundaries.find((x) => x.properties.name === "West Bank (held by Israel)" && x.properties.start_year === 1967);
  assert.equal(f.properties.end_year, 1994);
  assert.ok(f.properties.note.endsWith("No part of the West Bank passed to Palestinian control in this period before the 4 May 1994 Gaza-Jericho Agreement."));
});

test("Gaziantep: Aintab to 1920, Gazi Ayıntap 1921-1927, Gaziantep from 1928, cited", () => {
  const cities = JSON.parse(read("../../app/src/data/cities.json")).features.filter((f) => f.properties.qid === "Q93338");
  assert.deepEqual(cities.map(({ properties: p }) => [p.name, p.from ?? null, p.to ?? null, p.source ?? null]), [
    ["Aintab", null, 1921, "Gaziantep"],
    ["Gazi Ayıntap", 1921, 1928, "Gaziantep"],
    ["Gaziantep", 1928, null, null],
  ]);
});

test("border report: the early year is scored only with points Wikidata dates as existing then", () => {
  assert.equal(EARLY_YEAR, 1960);
  assert.ok(existedIn("Q731063", 1960)); // Mandelbaum Gate, 1949-1967
  assert.ok(!existedIn("Q731063", 1967)); // gone by the 1967 map year
  assert.ok(!existedIn("Q2071881", 1960)); // Fatima Gate, from 1976
  assert.ok(!existedIn("Q67893141", 1960)); // dissolved, date unknown
  assert.ok(!existedIn("Q47457749", 1960)); // Checkpoint 300: no date in Wikidata
  assert.ok(existedIn("Q111974111", 1960)); // Arar, "1960": that year counts
  assert.equal(Object.keys(WIKIDATA_DATES).filter((id) => existedIn(id, 1960)).length, 10);
});

test("border report: docs/border-verification.md shows the 1960 section and the Mandelbaum Gate row", () => {
  const doc = read("../../docs/border-verification.md");
  assert.match(doc, /^## Map year 1960 \(report only\), with the points that existed then$/m);
  assert.match(doc, /^\| [\d.]+ \| [\d.]+ \| \[Mandelbaum Gate\]\(https:\/\/www\.wikidata\.org\/wiki\/Q731063\) \(Q731063\) \| border checkpoint \| 1949-1967 \| Israel \/ West Bank \(annexed by Jordan\) \|$/m);
});
