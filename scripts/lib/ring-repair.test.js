import test from "node:test";
import assert from "node:assert/strict";
import { roundRingWithoutCrossings, untangleRing } from "./ring-repair.js";
import { ringCrossings } from "./boundary-checks.js";

const u = 1e-6; // one 6-decimal step

test("roundRingWithoutCrossings: plain rounding where it makes no crossing", () => {
  const ring = [[35.0000004, 31.0000006], [35.0010004, 31.0000001], [35.0010001, 31.0010004], [35.0000004, 31.0000006]];
  const { ring: out, rerounded } = roundRingWithoutCrossings(ring);
  assert.deepEqual(out, [[35, 31.000001], [35.001, 31], [35.001, 31.001], [35, 31.000001]]);
  assert.deepEqual(rerounded, []);
});

test("roundRingWithoutCrossings: a vertex that plain rounding pushes across another edge is rounded the other way", () => {
  // A thin channel: the path out (via F) runs just below the path back (Bb -> Ba). Unrounded
  // they do not cross; rounded to the nearest 6-decimal position, F (0.55 steps up) goes to
  // the step above while the back path's vertices go down and up, and the two cross twice.
  const F = [20 * u, 0.55 * u];
  const ring = [[0, 0], F, [40 * u, 0], [40 * u, 2 * u], [30 * u, 0.8 * u], [10 * u, 0.4 * u], [0, 2 * u], [0, 0]];
  assert.deepEqual(ringCrossings(ring), []);
  const plain = ring.map((p) => p.map((v) => Math.round(v * 1e6) / 1e6));
  assert.equal(ringCrossings(plain).length, 2);
  const { ring: out, rerounded } = roundRingWithoutCrossings(ring);
  assert.deepEqual(ringCrossings(out), []);
  assert.deepEqual(rerounded, [1]); // only F, rounded down instead of up
  assert.deepEqual(out[1], [0.00002, 0]);
  out.forEach((p, k) => { if (k !== 1) assert.deepEqual(p, plain[k]); });
});

const planarM2 = (ring) => {
  let s = 0;
  for (let k = 1; k < ring.length; k++) s += ring[k - 1][0] * ring[k][1] - ring[k][0] * ring[k - 1][1];
  return Math.abs(s / 2) * 1e10; // ~m2 per square degree near 30N; enough for a test
};

test("untangleRing: a hairline fold back over the ring's own edge is dropped, nothing else moves", () => {
  // A square whose top edge runs out to a tip T and back to X, which lies on that edge to
  // within floating-point noise but just outside it, and then turns inland (as Israel 1948-1966
  // did at the Gaza Strip's northern coast end).
  const T = [2, 10];
  const X = [4, 10 + 1e-12];
  const ring = [[0, 0], [10, 0], [10, 10], T, X, [4, 5], [0, 5], [0, 0]];
  assert.equal(ringCrossings(ring).length, 1);
  const { ring: out, dropped } = untangleRing(ring, { areaM2: planarM2 });
  assert.deepEqual(out, [[0, 0], [10, 0], [10, 10], X, [4, 5], [0, 5], [0, 0]]);
  assert.equal(dropped.length, 1);
  assert.deepEqual(ringCrossings(out), []);
});

test("untangleRing: a plain ring is returned as it is; a real bow tie is not guessed at", () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  assert.deepEqual(untangleRing(square, { areaM2: planarM2 }), { ring: square, dropped: [] });
  assert.throws(() => untangleRing([[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]], { areaM2: planarM2, label: "bow tie" }), /bow tie: segments 0\/2 cross at 1,1.*not a fold/);
});
