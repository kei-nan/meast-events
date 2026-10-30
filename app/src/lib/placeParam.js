// The point "What was this place?" describes, in the URL (lib/urlState.js:
// place=lon,lat) and in words. Kept apart from lib/placeHistory.js so the URL
// state does not load the lookup.

// Five decimals (~1 m): finer than any border here is drawn to matter for a
// click, short enough for a link.
const PLACE_DECIMALS = 5;
const PLACE_RE = /^(-?\d{1,3}(?:\.\d{1,12})?),(-?\d{1,2}(?:\.\d{1,12})?)$/;

/** {lon, lat} from "lon,lat", or null for anything malformed or out of range. */
export function parsePlace(raw) {
  const m = PLACE_RE.exec(typeof raw === "string" ? raw : "");
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) return null;
  return { lon, lat };
}

/** A point rounded as the URL keeps it: {lon, lat}. */
export function roundPlace({ lon, lat }) {
  const r = (n) => Math.round(n * 10 ** PLACE_DECIMALS) / 10 ** PLACE_DECIMALS;
  return { lon: r(lon) || 0, lat: r(lat) || 0 };
}

/** "lon,lat" for the URL, or null. */
export function placeToParam(place) {
  if (!place || !Number.isFinite(place.lon) || !Number.isFinite(place.lat)) return null;
  const { lon, lat } = roundPlace(place);
  return `${lon},${lat}`;
}

/** The same point (as the URL keeps it), for comparing two places. */
export function samePlace(a, b) {
  if (!a || !b) return a === b;
  return placeToParam(a) === placeToParam(b);
}

/** "31.78° N, 35.23° E": the point in words, for the view's heading. */
export function placeLabel({ lon, lat }) {
  const f = (n) => Math.abs(n).toFixed(2);
  return `${f(lat)}° ${lat < 0 ? "S" : "N"}, ${f(lon)}° ${lon < 0 ? "W" : "E"}`;
}
