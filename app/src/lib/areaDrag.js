import { haversineKm } from "./geo.js";
import { makeCircleArea, makeRectArea, oppositeCorner } from "../components/mapLayers.js";

// Geometry of drawing and editing the search area by dragging on the map
// (MapView's pointer handlers). Points are [lon, lat] pairs.

// Distance between two [lon, lat] points, km.
export const distanceKm = (a, b) => haversineKm(a[0], a[1], b[0], b[1]);

// The smallest radius a dragged radius handle leaves a circle with, km.
export const MIN_RADIUS_KM = 0.1;

/**
 * The area a drag gives with the pointer at `ll`.
 * `d.kind`: "rect" or "circle" (drawing from `d.start`), "radius" or "center"
 * (editing the circle `d.area0`), or a corner "sw"/"se"/"ne"/"nw" (editing the
 * rectangle `d.area0`, the opposite corner staying put).
 */
export function dragArea(d, ll) {
  switch (d.kind) {
    case "rect":
      return makeRectArea(d.start, ll);
    case "circle":
      return makeCircleArea(d.start, distanceKm(d.start, ll));
    case "radius":
      return makeCircleArea(d.area0.center, Math.max(MIN_RADIUS_KM, distanceKm(d.area0.center, ll)));
    case "center":
      return makeCircleArea(ll, d.area0.radiusKm);
    default:
      return makeRectArea(oppositeCorner(d.area0.bbox, d.kind), ll);
  }
}

/** The screen box, [[x0, y0], [x1, y1]], searched for a handle around `pt` (r px each way). */
export function handleBox(pt, r) {
  return [
    [pt[0] - r, pt[1] - r],
    [pt[0] + r, pt[1] + r],
  ];
}

/**
 * The handle kind to drag among the rendered handle features under the
 * pointer, or null. The radius handle wins over the centre when they overlap
 * (a small circle), so a small circle can still be resized.
 */
export function pickHandle(hits) {
  if (!hits?.length) return null;
  return (hits.find((h) => h.properties.kind !== "center") ?? hits[0]).properties.kind;
}
