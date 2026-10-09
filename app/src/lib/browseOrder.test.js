import test from "node:test";
import assert from "node:assert/strict";
import { eventStartYear, orderBrowseList, startedBefore } from "./browseOrder.js";

const ev = (id, date_start, date_end) => ({ id, title: id, date_start, date_end });

test("events starting in the range come first, then ongoing ones, each chronological", () => {
  const events = [
    ev("kurdish", "1918-01-01", "2003-01-01"),
    ev("war48", "1948-05-15", "1949-03-10"),
    ev("mandate", "1920-04-25", "1948-05-14"),
    ev("deir", "1948-04-09"),
    ev("cold", "1947-03-12", "1991-12-26"),
  ];
  assert.deepEqual(
    orderBrowseList(events, 1948).map((e) => e.id),
    ["deir", "war48", "kurdish", "mandate", "cold"]
  );
});

test("whole-timeline browse stays purely chronological", () => {
  const events = [ev("b", "1950-01-01"), ev("a", "1901-01-01", "1990-01-01"), ev("c", "1920-01-01")];
  assert.deepEqual(orderBrowseList(events, 1900).map((e) => e.id), ["a", "c", "b"]);
});

test("ties keep input order; input is not mutated", () => {
  const events = [ev("x", "1950-01-01"), ev("y", "1950-01-01")];
  const copy = [...events];
  assert.deepEqual(orderBrowseList(events, 1950).map((e) => e.id), ["x", "y"]);
  assert.deepEqual(events, copy);
});

test("startedBefore / eventStartYear", () => {
  assert.equal(eventStartYear(ev("a", "1918-06-01")), 1918);
  assert.equal(startedBefore(ev("a", "1918-06-01"), 1948), true);
  assert.equal(startedBefore(ev("a", "1948-01-01"), 1948), false);
  assert.equal(startedBefore({ id: "nodate" }, 1948), false);
});

test("coverage: most sitelinks first within each part, ties chronological, no count last", () => {
  const withCount = (id, date_start, sitelinks, date_end) => ({ ...ev(id, date_start, date_end), sitelinks });
  const events = [
    withCount("old-big", "1920-01-01", 90, "1960-01-01"),
    withCount("small", "1950-01-01", 12),
    withCount("big", "1956-01-01", 80),
    withCount("tie-late", "1958-01-01", 12),
    { ...ev("nocount", "1951-01-01") },
    withCount("old-small", "1930-01-01", 20, "1970-01-01"),
  ];
  assert.deepEqual(
    orderBrowseList(events, 1950, "coverage").map((e) => e.id),
    ["big", "small", "tie-late", "nocount", "old-big", "old-small"]
  );
  assert.deepEqual(
    orderBrowseList(events, 1950, "date").map((e) => e.id),
    ["small", "nocount", "big", "tie-late", "old-big", "old-small"]
  );
});
