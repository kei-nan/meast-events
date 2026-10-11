// What the map looks like before any of its own code has loaded: shared by
// MapView (the MapLibre map) and MapLoading (the stand-in drawn while MapLibre
// downloads), so the stand-in matches the map pixel for pixel and nothing
// jumps when the map takes over. No MapLibre import here: this ships in the
// main chunk.
import { MAP_EXTENT } from "./mapExtent.js";

// A calm, slightly greyed sea (was a bright #d8f2ff): the map's background.
export const SEA_COLOR = "#b9d5e3";
// Land (mapInstallLayers.js "land-fill"): drawn at LAND_OPACITY over the sea.
export const LAND_COLOR = "#e4ded0";
export const LAND_OPACITY = 0.65;

// Default view: the Middle East. Shared by the initial view and "Reset view".
export const DEFAULT_BOUNDS = [
  [8, 6],
  [72, 50],
];
export const DEFAULT_PADDING = 20;

// MapLibre's tile size: at zoom z the world is 512 * 2^z pixels wide.
const TILE_SIZE = 512;

// Web Mercator, as MapLibre computes it: [0, 1] across the world, y down.
export const mercatorX = (lon) => (180 + lon) / 360;
export const mercatorY = (lat) =>
  (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;

/**
 * The camera MapLibre settles on for `new Map({bounds: DEFAULT_BOUNDS,
 * fitBoundsOptions: {padding}, maxBounds: MAP_EXTENT})` in a width x height
 * container: fit the bounds inside the padding (cameraForBounds), then zoom in
 * and shift as needed so the view stays inside maxBounds (the transform's
 * constrain step). Returns {zoom, worldSize, x0, y0}: a [lon, lat] point is
 * drawn at (mercatorX(lon) * worldSize - x0, mercatorY(lat) * worldSize - y0).
 */
export function defaultCamera(width, height, { bounds = DEFAULT_BOUNDS, padding = DEFAULT_PADDING, extent = MAP_EXTENT } = {}) {
  const [[west, south], [east, north]] = bounds;
  const left = mercatorX(west);
  const right = mercatorX(east);
  const top = mercatorY(north);
  const bottom = mercatorY(south);
  let worldSize = Math.min((width - 2 * padding) / (right - left), (height - 2 * padding) / (bottom - top));
  let cx = (left + right) / 2;
  let cy = (top + bottom) / 2;

  const [minLon, minLat, maxLon, maxLat] = extent;
  const mx0 = mercatorX(minLon);
  const mx1 = mercatorX(maxLon);
  const my0 = mercatorY(maxLat);
  const my1 = mercatorY(minLat);
  // Zoom in until the view fits inside the extent, then keep its edges inside.
  worldSize = Math.max(worldSize, width / (mx1 - mx0), height / (my1 - my0));
  const halfW = width / 2 / worldSize;
  const halfH = height / 2 / worldSize;
  cx = Math.min(Math.max(cx, mx0 + halfW), mx1 - halfW);
  cy = Math.min(Math.max(cy, my0 + halfH), my1 - halfH);
  return {
    zoom: Math.log2(worldSize / TILE_SIZE),
    worldSize,
    x0: cx * worldSize - width / 2,
    y0: cy * worldSize - height / 2,
  };
}
