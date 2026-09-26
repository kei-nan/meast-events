export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
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

export function countryFallbackCoordinates(countries) {
  const country = countries?.find((c) => COUNTRY_CAPITALS[c]);
  return country ? { ...COUNTRY_CAPITALS[country], approximate_for: country } : null;
}
