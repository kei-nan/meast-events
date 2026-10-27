// Two repairs for rings that our own processing makes cross themselves (a "proper" crossing,
// as scripts/lib/boundary-checks.js and the validator count it). Neither simplifies a border:
// they touch only the vertices of the two crossing edges and leave every other vertex as it is.
import { ringCrossings } from "./boundary-checks.js";
import { dropRepeatedPositions } from "./ring-positions.js";

// --- rounding to 6 decimals without creating a crossing ----------------------------------
//
// Rounding to 6 decimals (~10 cm) moves each coordinate by up to half a step. Where two edges
// of one ring run closer than that - OCHA's West Bank layer has hairline channels a few
// millimetres wide, which its classes' union keeps as long, thin holes - plain rounding can
// push one edge across the other. Such a crossing is undone by rounding one vertex of the two
// crossing edges to another 6-decimal neighbour of its source position (each coordinate rounded
// down or up instead of to the nearest; still less than one step, 1e-6 degrees, from the source):
// the alternative closest to the source that removes the crossing without adding another.
// Every other vertex keeps plain rounding.
const STEP = 1e6;
const roundCoord = (v) => Math.round(v * STEP) / STEP; // the same as turf.truncate({ precision: 6 })
const samePosition = (a, b) => a[0] === b[0] && a[1] === b[1];

// The 6-decimal values on either side of v (one, if v is already on that grid).
function axisNeighbours(v) {
  const s = v * STEP;
  const r = Math.round(s);
  if (Math.abs(s - r) < 1e-6) return [r / STEP];
  return [r / STEP, (s > r ? r + 1 : r - 1) / STEP];
}
const gridNeighbours = ([x, y]) => axisNeighbours(x).flatMap((gx) => axisNeighbours(y).map((gy) => [gx, gy]));

// Returns { ring, rerounded }: the ring rounded to 6 decimals (same length as the input, repeats
// not yet dropped) and the indices of the vertices rounded to a neighbour instead of the nearest.
// Throws if a crossing cannot be undone this way.
export function roundRingWithoutCrossings(ring, label = "ring") {
  const out = ring.map(([x, y]) => [roundCoord(x), roundCoord(y)]);
  const n = ring.length - 1;
  const closed = n > 0 && samePosition(ring[0], ring[n]);
  const at = (k) => (closed && k === n ? 0 : k);
  const set = (k, p) => {
    out[k] = p;
    if (closed && k === 0) out[n] = p;
  };
  const rerounded = [];
  let crossings = ringCrossings(out);
  while (crossings.length) {
    const [i, j] = crossings[0].segments;
    const options = [];
    for (const k of new Set([i, i + 1, j, j + 1].map(at))) {
      for (const p of gridNeighbours(ring[k])) {
        if (!samePosition(p, out[k])) options.push({ k, p, d: Math.hypot(p[0] - ring[k][0], p[1] - ring[k][1]) });
      }
    }
    options.sort((a, b) => a.d - b.d || a.k - b.k);
    let fixed = null;
    for (const o of options) {
      const before = out[o.k];
      set(o.k, o.p);
      const after = ringCrossings(out);
      if (after.length < crossings.length && !after.some((c) => c.segments[0] === i && c.segments[1] === j)) {
        fixed = after;
        rerounded.push(o.k);
        break;
      }
      set(o.k, before);
    }
    if (!fixed) throw new Error(`${label}: rounding to 6 decimals makes segments ${i}/${j} cross, and no other rounding of their vertices undoes it`);
    crossings = fixed;
  }
  return { ring: out, rerounded };
}

// --- untangling a ring that a polygon operation returned crossing itself ----------------------
//
// turf's polygon operations work in floating point, and where two sources' edges nearly coincide
// (a Natural Earth coast and a CShapes line, or a fitted sliver along a CShapes edge) they can
// return a ring that crosses itself where it runs out along one of its own edges and back: a
// hairline spike folded over the edge, crossing it within floating-point noise. The ring is
// split at the crossing into its two loops; the fold, a loop enclosing less than minM2, is
// dropped, and the other loop is kept with all its vertices. The crossing point becomes a
// vertex, unless it lies within epsDeg of one of the two edges' vertices, which is then used as
// it is. Any other crossing (both loops real, e.g. a bow tie) is not guessed at: it throws.

// areaM2(ring) gives a closed ring's area in m2 (turf.area). Returns { ring, dropped: [loops] }.
export function untangleRing(ring, { areaM2, minM2 = 1, epsDeg = 1e-9, label = "ring" }) {
  let r = ring;
  const dropped = [];
  for (let guard = 0; guard < 1000; guard++) {
    const c = ringCrossings(r)[0];
    if (!c) return { ring: r, dropped };
    const [i, j] = c.segments;
    const x = [r[i], r[i + 1], r[j], r[j + 1]].find((p) => Math.hypot(p[0] - c.at[0], p[1] - c.at[1]) < epsDeg) ?? c.at;
    const loops = [[x, ...r.slice(i + 1, j + 1), x], [...r.slice(0, i + 1), x, ...r.slice(j + 1)]];
    const real = loops.map((l) => {
      const clean = dropRepeatedPositions(l); // null: fewer than 3 distinct positions, no area
      return clean && areaM2(clean) >= minM2 ? clean : null;
    });
    if (real.filter(Boolean).length !== 1) {
      throw new Error(`${label}: segments ${i}/${j} cross at ${c.at}, and ${real.filter(Boolean).length} of the two loops there enclose ${minM2} m2 or more (not a fold; cannot untangle)`);
    }
    dropped.push(loops[real[0] ? 1 : 0]);
    r = real[0] ?? real[1];
  }
  throw new Error(`${label}: too many crossings to untangle`);
}
