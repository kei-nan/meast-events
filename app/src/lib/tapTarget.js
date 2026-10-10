// Which map marker a click or tap meant. Pure (the map's projection is passed in).
//
// A mouse click takes the marker under the pointer. A finger is less precise
// than the 12-16 px dots, so on a touch screen MapView also looks in a box of
// TAP_SLOP_PX around the tap and takes the nearest marker there, before the
// tap falls through to the border under it.

export const TAP_SLOP_PX = 12;

const SELECTED_LAYER = "selected-point";

// The selected marker is drawn over a regular dot of the same event, which
// handles the click itself (it may stand for several events at one spot).
const rank = (f) => (f.layer?.id === SELECTED_LAYER ? 1 : 0);

/**
 * The marker a press at `point` ({x, y}) picks from `hits` (rendered features,
 * topmost first): the one whose position is nearest, a regular dot or cluster
 * before the selected marker on a tie. `toPixel([lon, lat])` gives {x, y}.
 * null when there are no hits.
 */
export function pickMarker(hits, point, toPixel) {
  let best = null;
  let bestD = Infinity;
  for (const f of hits) {
    const p = toPixel(f.geometry.coordinates);
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d < bestD || (d === bestD && best && rank(f) < rank(best))) {
      best = f;
      bestD = d;
    }
  }
  return best;
}
