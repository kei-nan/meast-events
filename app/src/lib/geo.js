// Pure geometry helpers shared by search, the URL state and the map wiring.
// bbox is always [minLon, minLat, maxLon, maxLat].

export const EARTH_RADIUS_KM = 6371.0088;
export const MAX_RADIUS_KM = 20000;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export function haversineKm(lon1, lat1, lon2, lat2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// The point `km` from [lon, lat] along the initial bearing `bearingDeg`
// (degrees clockwise from north), on the sphere: [lon, lat].
export function destination([lon, lat], bearingDeg, km) {
  const d = km / EARTH_RADIUS_KM;
  const b = toRad(bearingDeg);
  const p1 = toRad(lat);
  const l1 = toRad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 =
    l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [toDeg(l2), toDeg(p2)];
}

// Valid {lon, lat} of an event, or null. Events without coordinates are never
// shown anywhere, so every consumer goes through this.
export function eventCoords(e) {
  const c = e && e.coordinates;
  if (!c || c.lon === null || c.lat === null || c.lon === undefined || c.lat === undefined) return null;
  const lon = Number(c.lon);
  const lat = Number(c.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat };
}

// Smallest lon/lat box containing the circle, clamped to the world. Near a
// pole or across the antimeridian it widens to full longitude (a superset;
// the haversine test trims it afterwards).
export function circleBbox([lon, lat], radiusKm) {
  const angular = radiusKm / EARTH_RADIUS_KM;
  const dLat = toDeg(angular);
  const minLat = Math.max(-90, lat - dLat);
  const maxLat = Math.min(90, lat + dLat);
  let minLon = -180;
  let maxLon = 180;
  if (maxLat < 90 && minLat > -90) {
    const ratio = Math.sin(angular) / Math.cos(toRad(lat));
    if (ratio < 1) {
      const dLon = toDeg(Math.asin(ratio));
      if (lon - dLon >= -180 && lon + dLon <= 180) {
        minLon = lon - dLon;
        maxLon = lon + dLon;
      }
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

export function makeCircleArea(center, radiusKm) {
  return { type: "circle", center, radiusKm, bbox: circleBbox(center, radiusKm) };
}

export function makeRectArea(bbox) {
  return { type: "rect", bbox };
}

export function inBbox(coords, [minLon, minLat, maxLon, maxLat]) {
  return (
    coords.lon >= minLon && coords.lon <= maxLon && coords.lat >= minLat && coords.lat <= maxLat
  );
}

export function inArea(coords, area) {
  if (!area) return true;
  if (!inBbox(coords, area.bbox)) return false;
  if (area.type === "circle") {
    return haversineKm(area.center[0], area.center[1], coords.lon, coords.lat) <= area.radiusKm;
  }
  return true;
}

// Accepts a plain [w,s,e,n] array or a MapLibre LngLatBounds-like object.
export function normalizeBounds(b) {
  if (!b) return null;
  if (Array.isArray(b) && b.length === 4 && b.every(Number.isFinite)) return b;
  if (typeof b.toArray === "function") {
    const [[w, s], [e, n]] = b.toArray();
    return [w, s, e, n];
  }
  if ([b.west, b.south, b.east, b.north].every(Number.isFinite)) return [b.west, b.south, b.east, b.north];
  return null;
}
