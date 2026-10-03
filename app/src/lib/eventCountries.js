// Which border shapes stand for an event's listed countries, per year.
//
// Events without a precise location (location_quality "approximate": pinned at
// a capital; "none": no marker) are shown on the map by shading the countries
// the data lists for them. That shading must never invent a location, so the
// match is an explicit, reviewed table from the event `countries` vocabulary
// (data/events.json) to exact boundary feature names (data/boundaries.json),
// with the years each name is drawn. eventCountries.test.js checks every entry
// against data/boundaries.json, so a renamed or re-dated shape fails the tests
// instead of silently shading the wrong thing.
//
// Rule for an entry: the shape must be the same country/territory under its
// name for that period (a predecessor state with the same extent, or a part of
// it drawn as its own shape). A shape that also covers OTHER present-day
// countries is never used - e.g. the Ottoman Empire before 1920 (it spans
// Iraq, Syria, the Levant and Arabia), so a 1915 event in "Iraq" is not shaded.
//
// Deliberately NOT mapped (no shading):
// - "regional": not a country.
// - Any country in years where our border data has no shape for it: Iraq,
//   Syria, Lebanon, Jordan, Israel/Palestine before 1920 (inside the Ottoman
//   Empire); Turkey before 1920; Saudi Arabia before 1933 (Hejaz/Nejd are not
//   drawn); Kuwait before 1961; Bahrain before 1972; Qatar before 1917; Yemen
//   before 1919 (and South Yemen before 1968).
// - Shared or disputed extras: the Saudi-Iraqi and Saudi-Kuwaiti Neutral Zones,
//   Abu Musa and the Tunbs, the Sanjak of Alexandretta, and the Golan Heights
//   (Syrian territory under Israeli occupation/annexation) are not added to any
//   country. Note the map's own "Israel" shape for 1967-1978 includes Sinai and,
//   from 1967 on, the Golan (see its note in boundaries.json), so shading
//   "Israel/Palestine" covers whatever that shape covers.
//
// Each entry is [feature name, first year, last year] (inclusive; 9999 = still
// drawn, as in boundaries.json).

const NOW = 9999;

export const COUNTRY_SHAPES = {
  "Israel/Palestine": [
    ["Mandatory Palestine", 1920, 1947],
    ["Israel", 1948, NOW],
    ["West Bank (Jordanian military administration)", 1948, 1949],
    ["West Bank (annexed by Jordan)", 1950, 1966],
    ["West Bank (Israeli military occupation)", 1967, 1994],
    ["West Bank (Israeli occupation, phased Oslo transfers)", 1995, 1999],
    ["West Bank Area A (Palestinian Authority)", 2000, NOW],
    ["West Bank Area B (Palestinian civil, joint security)", 2000, NOW],
    ["West Bank Area C (Israeli control)", 2000, NOW],
    ["Gaza Strip (Egyptian military administration)", 1948, 1966],
    ["Gaza Strip (Israeli military occupation)", 1967, 1993],
    ["Gaza Strip (Palestinian Authority, Israeli settlements retained)", 1994, 2004],
    ["Gaza Strip (Palestinian Authority, post-disengagement)", 2005, 2006],
    ["Gaza Strip (Hamas government, under blockade)", 2007, 2022],
    ["Gaza Strip (Israeli ground offensive)", 2023, 2025],
    ["Gaza Strip (ceasefire, divided at the Yellow Line)", 2026, NOW],
  ],
  Iraq: [
    ["British Mandate of Mesopotamia", 1920, 1921],
    ["Kingdom of Iraq (British Mandate)", 1922, 1932],
    ["Kingdom of Iraq", 1933, 1958],
    ["Iraq", 1959, NOW],
  ],
  Turkey: [
    // From 1920 the Ottoman shape is only Anatolia and Eastern Thrace (the same
    // extent as Turkey's 1924 shape); before that it covers the Arab provinces too.
    ["Ottoman Empire", 1920, 1923],
    ["Turkey", 1924, NOW],
  ],
  Syria: [
    ["French Mandate of Syria", 1920, 1945],
    ["Syria", 1946, NOW],
  ],
  Egypt: [["Egypt", 1899, NOW]],
  Iran: [
    ["Persia", 1886, 1934],
    ["Iran", 1935, NOW],
  ],
  Lebanon: [
    ["Lebanon (French Mandate)", 1920, 1943],
    ["Lebanon", 1944, NOW],
  ],
  "Saudi Arabia": [["Saudi Arabia", 1933, NOW]],
  Jordan: [
    ["Transjordan", 1920, 1945],
    ["Jordan", 1946, NOW],
  ],
  // The data's "Yemen" is the present-day country, so both North and South
  // Yemen are its territory before unification in 1990.
  Yemen: [
    ["Mutawakkilite Kingdom of Yemen", 1919, 1962],
    ["Yemen Arab Republic", 1963, 1989],
    ["People's Republic of South Yemen", 1968, 1970],
    ["People's Democratic Republic of Yemen", 1971, 1989],
    ["Yemen", 1990, NOW],
  ],
  Kuwait: [
    ["Kuwait", 1961, 1989],
    ["Kuwait (annexed by Iraq)", 1990, 1991],
    ["Kuwait", 1992, NOW],
  ],
  UAE: [
    ["Trucial States", 1892, 1971],
    ["United Arab Emirates", 1972, NOW],
  ],
  Qatar: [["Qatar", 1917, NOW]],
  Bahrain: [["Bahrain", 1972, NOW]],
  Oman: [
    ["Muscat and Oman", 1886, 1970],
    ["Oman", 1971, NOW],
  ],
  regional: [],
};

// Shading is only for events without a precise marker.
export function needsCountryShading(event) {
  const q = event?.location_quality;
  return q === "approximate" || q === "none";
}

// Feature names that draw `country` in `year` ([] if none).
export function shapeNamesFor(country, year) {
  const entries = Object.hasOwn(COUNTRY_SHAPES, country) ? COUNTRY_SHAPES[country] : [];
  return entries.filter(([, from, to]) => from <= year && year <= to).map(([name]) => name);
}

// For a list of event countries in a year: which can be shaded, which cannot,
// and the set of feature names to shade.
export function countryShading(countries, year) {
  const shaded = [];
  const unshaded = [];
  const names = new Set();
  for (const c of countries ?? []) {
    const n = shapeNamesFor(c, year);
    if (n.length) {
      shaded.push(c);
      for (const x of n) names.add(x);
    } else {
      unshaded.push(c);
    }
  }
  return { shaded, unshaded, names };
}

// The year whose borders an opened event is shown on: its START year, clamped
// to the timeline. For a multi-year event (Lebanese Civil War 1975-1990, Iraq
// War 2003-2011) the start shows the map the event began on - the borders it
// was fought over - and matches the year the list sorts and deep links resolve
// by; the end year would show the outcome instead.
export function eventBorderYear(event, minYear, maxYear) {
  const y = Number(String(event?.date_start ?? "").slice(0, 4));
  if (!Number.isFinite(y) || !event?.date_start) return null;
  return Math.min(maxYear, Math.max(minYear, y));
}

// Active features of `year` (from the loaded decade chunk) that draw the
// event's countries, as a FeatureCollection; empty when nothing matches.
export function countryHighlightFeatures(event, year, features) {
  const fc = { type: "FeatureCollection", features: [] };
  if (!event || year == null || !features) return fc;
  const { names } = countryShading(event.countries, year);
  if (!names.size) return fc;
  fc.features = features.filter(
    (f) => names.has(f.properties.name) && f.properties.start_year <= year && year <= f.properties.end_year
  );
  return fc;
}

// [minLon, minLat, maxLon, maxLat] of a FeatureCollection's polygons, or null.
export function featuresBbox(fc) {
  let b = null;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      if (!b) b = [c[0], c[1], c[0], c[1]];
      else {
        if (c[0] < b[0]) b[0] = c[0];
        if (c[1] < b[1]) b[1] = c[1];
        if (c[0] > b[2]) b[2] = c[0];
        if (c[1] > b[3]) b[3] = c[1];
      }
      return;
    }
    for (const x of c) walk(x);
  };
  for (const f of fc?.features ?? []) if (f.geometry?.coordinates) walk(f.geometry.coordinates);
  return b;
}
