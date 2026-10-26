// Border geometry is never simplified: every source vertex is kept. The only vertex this
// may drop is an exact repeat of the one before it (rounding or a polygon cut can leave
// two identical neighbours, which add nothing and some tools reject). Unlike turf's
// cleanCoords, a vertex lying exactly on the line between its neighbours is KEPT - it is
// a source vertex like any other.

const samePosition = (a, b) => a[0] === b[0] && a[1] === b[1];

// Returns the ring without consecutive repeated positions, closed (last === first), or
// null if fewer than 4 positions remain (no longer a valid linear ring).
export function dropRepeatedPositions(ring) {
  const out = [];
  for (const pos of ring) {
    if (out.length && samePosition(out[out.length - 1], pos)) continue;
    out.push(pos);
  }
  // Re-close: an unclosed input, or a closing position that matched its neighbour.
  if (out.length && !samePosition(out[0], out[out.length - 1])) out.push(out[0]);
  return out.length >= 4 ? out : null;
}

// Applies dropRepeatedPositions to every ring of a Polygon or MultiPolygon geometry.
// Throws if any ring collapses below 4 positions (callers that want to drop such rings
// call dropRepeatedPositions ring by ring instead).
export function dropRepeatedPositionsInGeometry(geometry, label = "geometry") {
  const cleanRings = (rings, p) =>
    rings.map((ring, r) => {
      const clean = dropRepeatedPositions(ring);
      if (!clean) throw new Error(`${label}: polygon ${p} ring ${r} has fewer than 4 distinct positions`);
      return clean;
    });
  if (geometry.type === "Polygon") return { type: "Polygon", coordinates: cleanRings(geometry.coordinates, 0) };
  if (geometry.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: geometry.coordinates.map(cleanRings) };
  throw new Error(`${label}: expected Polygon or MultiPolygon, got ${geometry.type}`);
}
