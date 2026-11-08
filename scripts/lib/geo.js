// Great-circle distance between two { lat, lon } objects (event coordinates), in km. The formula is
// app/src/lib/geo.js haversineKm (lon, lat argument order); this wrapper only takes objects, so the
// two argument orders cannot be mixed up. It keeps the 6371 km radius the pipeline has always used
// (the app uses 6371.0088): the coordinate flags print the rounded distance (flags.js
// coordinateFlag) and the duplicate check compares it with 150 km, and the stored flags must not
// change with this refactor.
import { haversineKm } from "../../app/src/lib/geo.js";

export const PIPELINE_EARTH_RADIUS_KM = 6371;

export function latLonDistanceKm(a, b) {
  return haversineKm(a.lon, a.lat, b.lon, b.lat, PIPELINE_EARTH_RADIUS_KM);
}

// Shortest distance in km from a point to the outline of a Polygon/MultiPolygon feature: every
// ring, holes included (turf.pointToLineDistance, geodesic). Used by the pin check
// (validate.js) and the border check (verify-borders.js). `turf` is passed in, not imported:
// validate.js runs where @turf/turf is not installed (Workers Builds) and loads it only when
// it is there.
export function distanceToRingsKm(turf, pt, feature) {
  const g = feature.geometry;
  const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  let best = Infinity;
  for (const rings of polys) {
    for (const ring of rings) best = Math.min(best, turf.pointToLineDistance(pt, turf.lineString(ring), { units: "kilometers" }));
  }
  return best;
}

// Country-level marker points (capitals). Used ONLY as (a) the labelled "approximate"
// fallback pin and (b) a reference for the coordinate sanity flag. Never as a real location.
export const COUNTRY_CAPITALS = {
  Turkey: { lat: 39.9334, lon: 32.8597 },
  Iran: { lat: 35.6892, lon: 51.389 },
  Iraq: { lat: 33.3152, lon: 44.3661 },
  Syria: { lat: 33.5138, lon: 36.2765 },
  Lebanon: { lat: 33.8938, lon: 35.5018 },
  Jordan: { lat: 31.9454, lon: 35.9284 },
  "Israel/Palestine": { lat: 31.7683, lon: 35.2137 },
  Egypt: { lat: 30.0444, lon: 31.2357 },
  "Saudi Arabia": { lat: 24.7136, lon: 46.6753 },
  Yemen: { lat: 15.3694, lon: 44.191 },
  Kuwait: { lat: 29.3759, lon: 47.9774 },
  Bahrain: { lat: 26.2285, lon: 50.586 },
  Qatar: { lat: 25.2854, lon: 51.531 },
  UAE: { lat: 24.4539, lon: 54.3773 },
  Oman: { lat: 23.5859, lon: 58.4059 },
};
