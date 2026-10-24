import test from "node:test";
import assert from "node:assert/strict";
import {
  axisTicks,
  barGeometry,
  chronological,
  decadeLabel,
  rangeBand,
  startDecade,
  timelineAxis,
} from "./timelineView.js";

const ev = (id, date_start, date_end) => ({ id, title: id, date_start, date_end });

test("chronological: oldest first by start date, undated last, ties keep their order", () => {
  const events = [
    ev("b", "1973-10-06"),
    ev("none", null),
    ev("a", "1948-05-15", "1949-03-10"),
    ev("c1", "1973-10-06"),
    ev("early", "1973-01-01"),
  ];
  assert.deepEqual(
    chronological(events).map((e) => e.id),
    ["a", "early", "b", "c1", "none"]
  );
});

test("chronological does not change its input", () => {
  const events = [ev("b", "2000-01-01"), ev("a", "1990-01-01")];
  chronological(events);
  assert.deepEqual(events.map((e) => e.id), ["b", "a"]);
});

test("decades and their labels", () => {
  assert.equal(startDecade(ev("x", "1979-02-11")), 1970);
  assert.equal(startDecade(ev("x", "1980-01-01")), 1980);
  assert.equal(startDecade(ev("x", null)), null);
  assert.equal(decadeLabel(1970), "1970s");
  assert.equal(decadeLabel(null), "No date");
});

test("axis: the selected years, or with fit the events' own span", () => {
  const events = [ev("a", "1973-10-06", "1974-03-17"), ev("b", "1990-08-02", "1991-02-28")];
  assert.deepEqual(timelineAxis(events, [1900, 2026]), [1900, 2026]);
  assert.deepEqual(timelineAxis(events, [1900, 2026], { fit: true }), [1973, 1991]);
  assert.deepEqual(timelineAxis([], [1950, 1960], { fit: true }), [1950, 1960]);
  assert.deepEqual(
    timelineAxis([ev("old", "1890-01-01", "1905-01-01")], [1900, 2026], { fit: true, minYear: 1900, maxYear: 2026 }),
    [1900, 1905]
  );
});

test("axis with fit: a reversed record counts at its start year only", () => {
  // Wikidata's Iraqi invasion of Kuwait: start 2009, end 1990.
  const events = [ev("kuwait", "2009-08-02", "1990-08-04"), ev("x", "2003-03-20", "2003-05-01")];
  assert.deepEqual(timelineAxis(events, [1900, 2026], { fit: true }), [2003, 2009]);
});

test("bar: one equal cell per year", () => {
  const axis = [1970, 1979]; // 10 cells
  assert.deepEqual(barGeometry(ev("x", "1973-10-06", "1974-03-17"), axis), {
    left: 30,
    width: 20,
    before: false,
    after: false,
    reversed: false,
    point: false,
  });
  // No end date: one year, not "ongoing".
  const point = barGeometry(ev("p", "1979-02-11"), axis);
  assert.equal(point.left, 90);
  assert.equal(point.width, 10);
  assert.equal(point.point, true);
});

test("bar: cut at the axis ends, and flagged as going on past them", () => {
  const g = barGeometry(ev("ww2", "1939-09-01", "1945-09-02"), [1941, 1950]);
  assert.equal(g.left, 0);
  assert.equal(g.width, 50);
  assert.equal(g.before, true);
  assert.equal(g.after, false);
  const h = barGeometry(ev("long", "1948-05-15", "2026-01-01"), [1940, 1949]);
  assert.equal(h.after, true);
  assert.equal(h.left + h.width, 100);
});

test("bar: a reversed record is drawn at its start year only", () => {
  const g = barGeometry(ev("kuwait", "2009-08-02", "1990-08-04"), [1990, 2009]);
  assert.equal(g.reversed, true);
  assert.equal(g.point, true);
  assert.equal(g.left, 95);
  assert.equal(g.width, 5);
});

test("bar: a reversed record with only its end year on the axis is a point there", () => {
  // Kuwait is listed for 1985-1994 by its end year 1990 (lib/eventYears.js), so its bar sits at 1990.
  const g = barGeometry(ev("kuwait", "2009-08-02", "1990-08-04"), [1985, 1994]);
  assert.deepEqual(g, { left: 50, width: 10, before: false, after: false, reversed: true, point: true });
  // Neither year on the axis (a range between them): no bar.
  assert.equal(barGeometry(ev("kuwait", "2009-08-02", "1990-08-04"), [1995, 2004]), null);
});

test("bar: none off the axis or without a start year", () => {
  assert.equal(barGeometry(ev("x", "1950-01-01", "1951-01-01"), [1960, 1970]), null);
  assert.equal(barGeometry(ev("x", null), [1960, 1970]), null);
});

test("a single-year axis is one cell", () => {
  const g = barGeometry(ev("x", "1967-06-05", "1967-06-10"), [1967, 1967]);
  assert.equal(g.left, 0);
  assert.equal(g.width, 100);
});

test("range band: only when the selected years are part of the axis", () => {
  assert.equal(rangeBand([1900, 2026], [1950, 2000]), null);
  assert.equal(rangeBand([1950, 2000], [1950, 2000]), null);
  assert.deepEqual(rangeBand([1960, 1969], [1950, 1999]), { left: 20, width: 20 });
  assert.equal(rangeBand([1900, 1910], [1950, 1999]), null);
});

test("ticks: round years, not crowding the labelled ends", () => {
  assert.deepEqual(
    axisTicks([1900, 2026]).map((t) => t.year),
    [1925, 1950, 1975, 2000]
  );
  assert.deepEqual(axisTicks([1967, 1967]), []);
  for (const t of axisTicks([1973, 1991])) assert.ok(t.at >= 12 && t.at <= 88);
});
