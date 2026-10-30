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
// The land as ONE opaque colour: LAND_COLOR at LAND_OPACITY over the sea (nothing else is
// drawn below the land). Opaque, pieces of land that meet along a cut (cells, tiles) show
// no seam: a translucent fill darkens or lightens the antialiased pixels on a shared edge.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const LAND_ON_SEA = (() => {
  const land = rgb(LAND_COLOR);
  const sea = rgb(SEA_COLOR);
  const mixed = land.map((c, i) => Math.round(c * LAND_OPACITY + sea[i] * (1 - LAND_OPACITY)));
  return `rgb(${mixed.join(",")})`;
})();

// Default view: the Middle East. Shared by the initial view and "Reset view"
// (on maps NARROW_MAP_PX wide and up; narrower ones: NARROW_BOUNDS below).
export const DEFAULT_BOUNDS = [
  [8, 6],
  [72, 50],
];
export const DEFAULT_PADDING = 20;

// On a narrow map (a phone held upright) DEFAULT_BOUNDS is fitted by its width:
// at 390px the region is a small patch in the middle, the rest Europe, Africa
// and the sea, and the events one big cluster. There the opening view is the
// tracked countries themselves (lib/fallbackPoint.js FALLBACK_PLACES: Egypt's
// western border at 25°E to Iran's eastern at ~63.3°E, Yemen's and Oman's coasts
// near 12°N to Turkey's Black Sea coast near 42°N), with a little air.
export const NARROW_BOUNDS = [
  [25, 12],
  [63.5, 42.5],
];
// Below this map width the opening view (and "Reset view") is NARROW_BOUNDS:
// the line MapView's event zoom also draws between a phone and a wider map.
export const NARROW_MAP_PX = 700;

/** The opening view's bounds for a map `width` px wide. Pure. */
export const defaultBounds = (width) => (width > 0 && width < NARROW_MAP_PX ? NARROW_BOUNDS : DEFAULT_BOUNDS);

// Below this much height left above the phone sheet the opening view ignores it.
const MIN_OPENING_PX = 80;

/**
 * The opening view's fit padding (MapLibre fitBoundsOptions.padding): on a
 * phone, where the lowered sheet covers `sheetPx` of the bottom of a map
 * `height` px tall, the bounds go above the sheet; else (and when that leaves
 * too little) DEFAULT_PADDING all round. The controls along the top are left
 * out: on a short screen (200% zoom) keeping clear of them too left the region
 * a sliver, and the view could no longer centre it (maxBounds). Pure.
 */
export function openingPadding(height, sheetPx) {
  if (!(sheetPx > 0)) return DEFAULT_PADDING;
  const bottom = sheetPx + DEFAULT_PADDING;
  if (height - DEFAULT_PADDING - bottom < MIN_OPENING_PX) return DEFAULT_PADDING;
  return { top: DEFAULT_PADDING, right: DEFAULT_PADDING, bottom, left: DEFAULT_PADDING };
}

// MapLibre's tile size: at zoom z the world is 512 * 2^z pixels wide.
const TILE_SIZE = 512;

// Web Mercator, as MapLibre computes it: [0, 1] across the world, y down.
export const mercatorX = (lon) => (180 + lon) / 360;
export const mercatorY = (lat) =>
  (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;

/**
 * The camera MapLibre settles on for `new Map({bounds: defaultBounds(width),
 * fitBoundsOptions: {padding}, maxBounds: MAP_EXTENT})` in a width x height
 * container: fit the bounds inside the padding (cameraForBounds; a number, or
 * {top, right, bottom, left}, which puts them in the middle of what the padding
 * leaves), then zoom in
 * and shift as needed so the view stays inside maxBounds (the transform's
 * constrain step). Returns {zoom, worldSize, x0, y0}: a [lon, lat] point is
 * drawn at (mercatorX(lon) * worldSize - x0, mercatorY(lat) * worldSize - y0).
 */
export function defaultCamera(width, height, { bounds = defaultBounds(width), padding = DEFAULT_PADDING, extent = MAP_EXTENT } = {}) {
  const [[west, south], [east, north]] = bounds;
  const left = mercatorX(west);
  const right = mercatorX(east);
  const top = mercatorY(north);
  const bottom = mercatorY(south);
  const pad = typeof padding === "number" ? { top: padding, right: padding, bottom: padding, left: padding } : padding;
  let worldSize = Math.min(
    (width - pad.left - pad.right) / (right - left),
    (height - pad.top - pad.bottom) / (bottom - top)
  );
  let cx = (left + right) / 2 - (pad.left - pad.right) / 2 / worldSize;
  let cy = (top + bottom) / 2 - (pad.top - pad.bottom) / 2 / worldSize;

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
