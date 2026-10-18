import test from "node:test";
import assert from "node:assert/strict";
import { BOUNDARY_STATUS_LABELS, humaniseStatus, isDashedStatus, uniqueBoundaries, yearsLabel } from "./mapBorders.js";

test("humaniseStatus: a known status gives its label from the one table", () => {
  for (const [status, label] of Object.entries(BOUNDARY_STATUS_LABELS)) assert.equal(humaniseStatus(status), label);
});

test("humaniseStatus: no status gives null", () => {
  assert.equal(humaniseStatus(null), null);
  assert.equal(humaniseStatus(undefined), null);
  assert.equal(humaniseStatus(""), null);
});

test("humaniseStatus: an unknown status is spelled out and marked as the raw flag", () => {
  assert.equal(humaniseStatus("buffer-zone"), "Buffer zone (status flag as recorded in the data)");
  assert.equal(humaniseStatus("un_buffer--zone"), "Un buffer zone (status flag as recorded in the data)");
});

test("isDashedStatus: any flag is dashed except an '...-included' one", () => {
  assert.equal(isDashedStatus("disputed"), true);
  assert.equal(isDashedStatus("occupied-administered"), true);
  assert.equal(isDashedStatus("occupied-territory-included"), false);
  assert.equal(isDashedStatus("shared-sovereignty-included"), false);
  // "-included" only counts at the end.
  assert.equal(isDashedStatus("included-later"), true);
});

test("isDashedStatus: no status is solid", () => {
  assert.equal(isDashedStatus(null), false);
  assert.equal(isDashedStatus(undefined), false);
  assert.equal(isDashedStatus(""), false);
});

const feature = (name, start_year, end_year, extra = {}) => ({ properties: { name, start_year, end_year, ...extra } });

test("uniqueBoundaries: drops repeated pieces of the same boundary and sorts by name", () => {
  const out = uniqueBoundaries([
    feature("Syria", 1946, 9999, { status: "disputed", note: "n", source: "s" }),
    feature("Egypt", 1922, 9999),
    feature("Syria", 1946, 9999, { status: "disputed", note: "n", source: "s" }),
  ]);
  assert.deepEqual(out, [
    { name: "Egypt", start_year: 1922, end_year: 9999, status: null, note: null, source: null },
    { name: "Syria", start_year: 1946, end_year: 9999, status: "disputed", note: "n", source: "s" },
  ]);
});

test("uniqueBoundaries: the same name in other years is a separate boundary", () => {
  const out = uniqueBoundaries([feature("Israel", 1949, 1966), feature("Israel", 1967, 9999), feature("Israel", 1949, 1966)]);
  assert.deepEqual(out.map((b) => [b.start_year, b.end_year]), [[1949, 1966], [1967, 9999]]);
});

test("uniqueBoundaries: tolerates features without properties and keeps only known fields", () => {
  const out = uniqueBoundaries([{ properties: null }, feature("Iraq", 1932, 9999, { extra: 1 })]);
  assert.equal(out.length, 2);
  assert.deepEqual(Object.keys(out.find((b) => b.name === "Iraq")).sort(), ["end_year", "name", "note", "source", "start_year", "status"]);
  assert.deepEqual(uniqueBoundaries([]), []);
});

test("yearsLabel: a range, an open end as 'present', and a single year", () => {
  assert.equal(yearsLabel({ start_year: 1949, end_year: 1966 }), "1949–1966");
  assert.equal(yearsLabel({ start_year: 1967, end_year: 9999 }), "1967–present");
  assert.equal(yearsLabel({ start_year: 1967, end_year: 10000 }), "1967–present");
  assert.equal(yearsLabel({ start_year: 1990, end_year: 1990 }), "1990");
});
