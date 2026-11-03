import test from "node:test";
import assert from "node:assert/strict";
import { eventStartYear, orderBrowseList, parseSort, sortValue, startedBefore } from "./browseOrder.js";

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
  // Fewest first: equal counts still chronological, no count still last.
  assert.deepEqual(
    orderBrowseList(events, 1950, "coverage-asc").map((e) => e.id),
    ["small", "tie-late", "big", "nocount", "old-small", "old-big"]
  );
  // Newest first, still within each part.
  assert.deepEqual(
    orderBrowseList(events, 1950, "date-desc").map((e) => e.id),
    ["tie-late", "big", "nocount", "small", "old-small", "old-big"]
  );
});

test("parseSort / sortValue", () => {
  assert.deepEqual(parseSort("coverage"), { key: "coverage", dir: "desc" });
  assert.deepEqual(parseSort("coverage-asc"), { key: "coverage", dir: "asc" });
  assert.deepEqual(parseSort("date"), { key: "date", dir: "asc" });
  assert.deepEqual(parseSort("date-desc"), { key: "date", dir: "desc" });
  assert.deepEqual(parseSort("bogus"), { key: "coverage", dir: "desc" });
  assert.equal(sortValue("coverage", "desc"), "coverage");
  assert.equal(sortValue("coverage", "asc"), "coverage-asc");
  assert.equal(sortValue("date", "asc"), "date");
  assert.equal(sortValue("date", "desc"), "date-desc");
});

// iraqi-invasion-of-kuwait as stored (data/events.json): start 2009-08-02, end
// 1990-08-04, flagged date_order_invalid. In 1990-1991 it matches by its end
// year only (eventOverlapsRange), so it is listed there: among the events
// starting in those years, at 4 August 1990, not after them at 2009.
test("a reversed record is listed at the year it matches the range by (real record)", async () => {
  const { readFileSync } = await import("node:fs");
  const { eventOverlapsRange } = await import("./eventYears.js");
  const { listedAtEnd, listedYear } = await import("./browseOrder.js");
  const events = JSON.parse(readFileSync(new URL("../../../data/events.json", import.meta.url), "utf8"));
  const kuwait = events.find((e) => e.id === "iraqi-invasion-of-kuwait");
  assert.ok(kuwait.date_flags.some((f) => f.startsWith("date_order_invalid")));
  assert.equal(listedAtEnd(kuwait, [1990, 1991]), true);
  assert.equal(listedYear(kuwait, [1990, 1991]), 1990);
  assert.equal(listedYear(kuwait, [2009, 2009]), 2009);
  assert.equal(listedYear(kuwait, [1985, 2010]), 2009, "both years in range: its start, as given");
  assert.equal(listedYear(kuwait, 1990), 2009, "a start year alone: its start");
  assert.equal(startedBefore(kuwait, 1990), false, "never 'ongoing from earlier'");

  const inRange = events.filter((e) => eventOverlapsRange(e, 1990, 1991));
  const ordered = orderBrowseList(inRange, [1990, 1991], "date");
  const starting = ordered.filter((e) => !startedBefore(e, 1990));
  const i = starting.indexOf(kuwait);
  assert.ok(i >= 0, "in the 'starting in the selected years' part");
  assert.equal(ordered.indexOf(kuwait), i);
  const before = starting.slice(0, i).map((e) => e.date_start ?? "");
  const after = starting.slice(i + 1).map((e) => e.date_start ?? "");
  assert.ok(before.every((d) => d <= "1990-08-04"), before.join(" "));
  assert.ok(after.every((d) => d >= "1990-08-04"), after.join(" "));
  assert.ok(after.length > 0, "events after 4 August 1990 follow it");
});
