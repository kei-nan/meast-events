// Coordinates given only to whole degrees or tenths of a degree. Pure; no imports, shared
// by the app's build (scripts/split-data.mjs, scripts/event-page.mjs) and the data
// checks (scripts/lib/validate.js, scripts/lib/flags.js).
//
// Some "precise" pins come from a Wikipedia or Wikidata coordinate that is only rounded
// to the area: Al-Anfal campaign 33, 43 (Wikidata P625), Operation Crusader 30, 24
// (Wikipedia). One decimal place of latitude is about 11 km, a whole degree about 111 km,
// so such a point marks a region, not the site. The stored coordinates are kept as the
// source gives them; the site shows these markers as approximate (rule:
// docs/DATA_POLICY.md, "Location quality").

/** Decimal places of a number as JavaScript writes it (33 -> 0, 30.5 -> 1, 31.36 -> 2). */
export function decimalPlaces(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const s = String(n);
  if (/e/i.test(s)) return null; // 1e-7 and the like: not a hand-rounded value
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

// At most this many decimal places in BOTH latitude and longitude.
export const LOW_PRECISION_MAX_DECIMALS = 1;

/**
 * True for a precise pin whose latitude and longitude both have at most one decimal
 * place. Approximate (capital) and coordinate-less events are never "low precision":
 * they already say they are not a site.
 */
export function isLowPrecisionPin(e) {
  if (e?.location_quality !== "precise") return false;
  const lat = decimalPlaces(e.coordinates?.lat);
  const lon = decimalPlaces(e.coordinates?.lon);
  return lat !== null && lon !== null && lat <= LOW_PRECISION_MAX_DECIMALS && lon <= LOW_PRECISION_MAX_DECIMALS;
}
