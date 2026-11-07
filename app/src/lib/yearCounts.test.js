import test from "node:test";
import assert from "node:assert/strict";
import { countEventsByStartYear } from "./yearCounts.js";

test("events are counted in their start year", () => {
  const counts = countEventsByStartYear([
    { id: "a", date_start: "1948-05-15", date_end: "1949-03-10" },
    { id: "b", date_start: "1948-04-09" },
    { id: "c", date_start: "1967-06-05", date_end: "1967-06-10" },
  ]);
  assert.deepEqual(counts, { 1948: 2, 1967: 1 });
});

test("a reversed record counts in its date_start year, not its lower (end) year", () => {
  // arab-cold-war as the data gives it: start 1979-02-11, end 1970-01-01.
  const counts = countEventsByStartYear([
    { id: "arab-cold-war", date_start: "1979-02-11", date_end: "1970-01-01" },
  ]);
  assert.deepEqual(counts, { 1979: 1 });
});

test("events without a start date are not counted", () => {
  assert.deepEqual(countEventsByStartYear([{ id: "x" }, { id: "y", date_start: "" }]), {});
});
