import test from "node:test";
import assert from "node:assert/strict";
import { MONTH_LABEL_PX, compassLayout, compassPoint, compassScale, formatKm, stripLayout } from "./relatedViz.js";
import { bearingDeg } from "./geo.js";

test("compass points and km wording", () => {
  assert.deepEqual([0, 44, 46, 90, 180, 225, 315, 359, 360].map(compassPoint), ["N", "NE", "NE", "E", "S", "SW", "NW", "N", "N"]);
  assert.equal(formatKm(0), "under 1 km");
  assert.equal(formatKm(0.9), "under 1 km");
  assert.equal(formatKm(12.4), "12 km");
});

test("bearingDeg: north, east, and Gaza to Jerusalem (about 67°, north-east) and back", () => {
  assert.equal(Math.round(bearingDeg(35, 31, 35, 32)), 0);
  assert.equal(Math.round(bearingDeg(35, 0, 36, 0)), 90);
  assert.equal(Math.round(bearingDeg(34.45, 31.5, 35.21, 31.77)), 67);
  assert.equal(compassPoint(bearingDeg(34.45, 31.5, 35.21, 31.77)), "NE");
  assert.equal(Math.round(bearingDeg(35.21, 31.77, 34.45, 31.5)), 248); // the reverse, plus 180 and a little: the sphere
});

test("the compass edge is the smallest step that holds the farthest event", () => {
  assert.deepEqual(compassScale(0), { outer: 1 });
  assert.deepEqual(compassScale(3), { outer: 5 });
  assert.deepEqual(compassScale(35), { outer: 50 });
});

test("compass dots sit at their true direction and scaled distance, north up", () => {
  const [n, e, s] = compassLayout(
    [
      { km: 5, bearing: 0 },
      { km: 2.5, bearing: 90 },
      { km: 5, bearing: 180 },
    ],
    { radius: 100, gap: 10 }
  );
  assert.deepEqual(n, { x: 0, y: -100 });
  assert.deepEqual(e, { x: 50, y: 0 });
  assert.deepEqual(s, { x: 0, y: 100 });
});

test("overlapping compass dots are nudged apart and stay inside the dial", () => {
  const pts = compassLayout(
    [
      { km: 2, bearing: 10 },
      { km: 2, bearing: 12 },
      { km: 0, bearing: 0 },
      { km: 0, bearing: 0 },
    ],
    { radius: 90, gap: 20 }
  );
  for (let i = 0; i < pts.length; i++) {
    assert.ok(Math.hypot(pts[i].x, pts[i].y) <= 90.1); // 0.1 rounding
    for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= 19.9, `${i},${j}`);
  }
  // Still roughly in their direction: the first two are north of the centre.
  assert.ok(pts[0].y < -40 && pts[1].y < -40);
});

test("no dot hides the centre: a very close one moves out along its own direction", () => {
  const [p, q] = compassLayout(
    [
      { km: 0.2, bearing: 225 },
      { km: 0, bearing: 90 },
    ],
    { radius: 90, gap: 20, inner: 16 }
  );
  assert.ok(Math.hypot(p.x, p.y) >= 15.9 && Math.hypot(q.x, q.y) >= 15.9);
  assert.ok(p.x < 0 && p.y > 0, "still south-west");
  assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 19.9);
});

test("time strip: the open event is the middle, six months each side, close dots go up a lane", () => {
  const s = stripLayout(
    [{ date_start: "1917-11-01" }, { date_start: "1917-11-02" }, { date_start: "1917-05-03" }, { date_start: "1918-05-02" }],
    "1917-10-31",
    { width: 366, gap: 10 }
  );
  assert.equal(s.dots[0].lane, 0);
  assert.equal(s.dots[1].lane, 1, "a day later overlaps, so it is stacked");
  assert.ok(Math.abs(s.dots[0].x - 184) < 1.5);
  assert.ok(s.dots[2].x <= 2 && s.dots[3].x >= 364);
  assert.equal(s.lanes, 2);
  const labels = s.ticks.filter((t) => t.label).map((t) => t.label);
  assert.deepEqual(labels, ["Jul 1917", "Oct", "Jan 1918", "Apr"]);
  assert.ok(s.ticks.every((t, i) => i === 0 || t.x > s.ticks[i - 1].x));
  assert.equal(stripLayout([], null, { width: 100, gap: 10 }), null);
});

test("time strip: wide enough, every month is labelled, and close dots fit side by side", () => {
  const items = [{ date_start: "1917-11-01" }, { date_start: "1917-11-15" }];
  const narrow = stripLayout(items, "1917-10-31", { width: 300, gap: 20 });
  const wide = stripLayout(items, "1917-10-31", { width: 12 * MONTH_LABEL_PX, gap: 20 });
  assert.equal(narrow.lanes, 2, "two weeks apart overlap at 300px");
  assert.equal(wide.lanes, 1, "and fits side by side at 576px");
  const labels = wide.ticks.filter((t) => t.label).map((t) => t.label);
  assert.deepEqual(labels.slice(0, 8), ["Jun 1917", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan 1918"]);
  const width = 12 * MONTH_LABEL_PX;
  for (const t of wide.ticks) assert.equal(t.label !== null, t.x >= 12 && t.x <= width - 12, `tick at ${t.x}`);
});

test("time strip: no label so close to an end that it would be cut off; the year moves to the next", () => {
  // Centre 2024-02-29: the strip starts on 2023-08-30, so September 1st is 2 days (3px) in.
  const s = stripLayout([], "2024-02-29", { width: 818, gap: 20 });
  assert.equal(s.ticks[0].label, null);
  assert.ok(s.ticks[0].x < 12);
  assert.equal(s.ticks[1].label, "Oct 2023");
});
