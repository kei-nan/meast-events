import test from "node:test";
import assert from "node:assert/strict";
import { searchIndex } from "./search.js";

const index = [
  { id: "b", title: "Gaza genocide", date_start: "2023-10-07", countries: [], groups: ["Gaza War"] },
  { id: "a", title: "October 7 attacks", date_start: "2023-10-07", countries: [], groups: ["Gaza War"] },
  { id: "c", title: "Gaza–Israel conflict", date_start: "1948-05-15", countries: [], groups: [] },
  { id: "d", title: "Battle of Jenin (2002)", date_start: null, countries: [], groups: [] },
];

test("results are in date order, whatever the words", () => {
  assert.deepEqual(searchIndex(index, "gaza").results.map((e) => e.id), ["c", "a", "b"]);
});

test("every word must match, in the title, id or a group; prefixes of 4+ letters count", () => {
  assert.deepEqual(searchIndex(index, "gaza war").results.map((e) => e.id), ["a", "b"]);
  assert.deepEqual(searchIndex(index, "genoc").results.map((e) => e.id), ["b"]);
  assert.deepEqual(searchIndex(index, "ga").results, []);
  assert.deepEqual(searchIndex(index, "jenin 2002").results.map((e) => e.id), ["d"]);
});

test("an empty query finds nothing, and the limit is applied after counting", () => {
  assert.deepEqual(searchIndex(index, "  "), { total: 0, results: [] });
  assert.deepEqual(searchIndex(index, "gaza", 1), { total: 3, results: [index[2]] });
});
