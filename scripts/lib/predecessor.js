// Predecessor-state rule (docs/DATA_POLICY.md, inclusion rule 2): an item whose country (P17) is a historical
// state that Wikidata links to a tracked country via "replaced by" / "replaces" (P1366 / P1365) counts only when
// the item's own coordinates (P625), or its place's (P276) present-day country, fall in a tracked country; it is
// then tagged with that country. Pure functions here; the queries are in scripts/discover-events.js.
import { COUNTRIES, QID_TO_COUNTRY, ALL_COUNTRY_QIDS } from "./event-classes.js";
// Plain module (no imports of its own), shared with the app: country -> border-shape names per year.
import { shapeNamesFor } from "../../app/src/lib/eventCountries.js";

// The predecessor states of the tracked countries: every entity X with "X replaced by (P1366) <tracked>" or
// "<tracked> replaces (P1365) X". A tracked QID is never its own predecessor (Mandatory Palestine, Q193714, is one
// of the Israel/Palestine QIDs already), and present-day sovereign states are not historical states.
export function predecessorStatesQuery() {
  const values = ALL_COUNTRY_QIDS.map((q) => `wd:${q}`).join(" ");
  return `
SELECT DISTINCT ?pred ?predLabel ?country WHERE {
  VALUES ?country { ${values} }
  { ?pred wdt:P1366 ?country . } UNION { ?country wdt:P1365 ?pred . }
  FILTER NOT EXISTS { ?pred wdt:P31 wd:Q3624078 . FILTER NOT EXISTS { ?pred wdt:P576 ?dissolved } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

// rows: WDQS bindings of predecessorStatesQuery, already reduced to { pred, label, country } (QIDs / tracked name).
// Returns Map(predecessor QID -> { label, successors: [tracked names] }), tracked QIDs left out.
export function predecessorStates(rows) {
  const out = new Map();
  for (const r of rows) {
    if (QID_TO_COUNTRY[r.pred]) continue;
    const e = out.get(r.pred) ?? { label: r.label ?? r.pred, successors: [] };
    if (r.country && !e.successors.includes(r.country)) e.successors.push(r.country);
    out.set(r.pred, e);
  }
  return out;
}

// Items whose P17 is one of the predecessor states and that carry a P585 or P580 from 1900 (a superset of the date
// rule, which discovery's detail query then applies exactly). Cheap: no class tree here.
export function predecessorItemsQuery(predQids) {
  return `
SELECT DISTINCT ?item WHERE {
  VALUES ?pred { ${predQids.map((q) => `wd:${q}`).join(" ")} }
  ?item wdt:P17 ?pred .
  { ?item wdt:P585 ?date } UNION { ?item wdt:P580 ?date }
  FILTER(YEAR(?date) >= 1900)
}`;
}

// Which tracked countries' present-day border shapes (data/boundaries.json, the map's own country -> shape table in
// app/src/lib/eventCountries.js) contain a point. Strict: the point must lie inside a shape, no tolerance.
export function presentDayCountryIndex(boundaries, turf, year) {
  const features = Array.isArray(boundaries) ? boundaries : boundaries?.features ?? [];
  const shapes = Object.keys(COUNTRIES).map((country) => {
    const names = new Set(shapeNamesFor(country, year));
    const fs = features.filter(
      (f) => f?.geometry && names.has(f.properties?.name) && f.properties.start_year <= year && year <= f.properties.end_year
    );
    return { country, fs: fs.map((f) => ({ f, bbox: turf.bbox(f) })) };
  });
  return ({ lat, lon }) => {
    const pt = turf.point([lon, lat]);
    return shapes
      .filter(({ fs }) =>
        fs.some(({ f, bbox }) => lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3] && turf.booleanPointInPolygon(pt, f))
      )
      .map(({ country }) => country);
  };
}

// The rule for one item. entity / places: trimmed records from lib/wd-entities.js (p17, p276, p625 ...).
// preds: Map from predecessorStates. countriesAt: from presentDayCountryIndex.
// Returns null when the item's P17 names no predecessor state; otherwise
//   { countries: [tracked names, possibly empty], predecessors: [QIDs], via: [{ property, value, countries }] }
// A place counts with its present-day country: a tracked P17 of the place that is not itself a predecessor state.
export function predecessorCountryTags(entity, places, preds, countriesAt) {
  const predecessors = (entity?.p17 ?? []).filter((q) => preds.has(q));
  if (!predecessors.length) return null;
  const via = [];
  if (entity.p625 && countriesAt) {
    const cs = countriesAt(entity.p625);
    if (cs.length) via.push({ property: "P625", value: `${entity.p625.lat},${entity.p625.lon}`, countries: cs });
  }
  for (const pq of entity.p276 ?? []) {
    const cs = [
      ...new Set((places.get(pq)?.p17 ?? []).filter((c) => !preds.has(c)).map((c) => QID_TO_COUNTRY[c]).filter(Boolean)),
    ];
    if (cs.length) via.push({ property: "P276", value: pq, countries: cs });
  }
  return { countries: [...new Set(via.flatMap((v) => v.countries))], predecessors, via };
}
