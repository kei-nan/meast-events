// Fetches independent reference points for checking the map's borders: every Wikidata item
// that is a border checkpoint (Q757292), border crossing (Q55599109) or tripoint
// (Q316655) - or a subclass of one - with coordinates (P625), in the map's countries. Such points
// sit ON a border by definition, so the drawn border should pass close to them.
// scripts/verify-borders.js measures that. The result is committed, so the check runs
// without network access and a reader can look up every point by its QID.
//
//   node scripts/fetch-border-references.js   -> data/border-reference-points.json
import { writeFile } from "node:fs/promises";
import { runSparql, qidFromUri } from "./lib/wdqs.js";

// The map's countries (checked: each QID's English label is the country). Looking items up
// by country is far cheaper for the query service than scanning a map rectangle.
const COUNTRIES = ["Q43", "Q858", "Q822", "Q801", "Q219060", "Q810", "Q79", "Q796", "Q794", "Q851", "Q817", "Q398", "Q846", "Q878", "Q842", "Q805"];

// Step 1: every subclass of the three classes (37 classes on 2026-10-01).
const classRows = await runSparql(`SELECT DISTINCT ?c WHERE { VALUES ?root { wd:Q757292 wd:Q55599109 wd:Q316655 } ?c wdt:P279* ?root }`);
const classes = classRows.map((r) => `wd:${qidFromUri(r.c.value)}`).join(" ");

// Step 2: items of those classes in those countries, with coordinates.
const query = `
SELECT ?item ?itemLabel ?coord ?classLabel (GROUP_CONCAT(DISTINCT ?countryLabel; separator="|") AS ?countries)
       (GROUP_CONCAT(DISTINCT ?refUrl; separator="|") AS ?refUrls) WHERE {
  VALUES ?class { ${classes} }
  VALUES ?inCountry { ${COUNTRIES.map((q) => `wd:${q}`).join(" ")} }
  ?item wdt:P31 ?class ; wdt:P17 ?inCountry ; wdt:P625 ?coord .
  ?item wdt:P17 ?country . ?country rdfs:label ?countryLabel . FILTER(LANG(?countryLabel) = "en")
  ?class rdfs:label ?classLabel . FILTER(LANG(?classLabel) = "en")
  # Where the coordinate itself came from (reference URL on the P625 statement), if given.
  OPTIONAL { ?item p:P625/prov:wasDerivedFrom/pr:P854 ?refUrl . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?item ?itemLabel ?coord ?classLabel`;

const rows = await runSparql(query);
const byId = new Map();
for (const r of rows) {
  const id = qidFromUri(r.item.value);
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r.coord.value);
  if (!m) continue;
  const prev = byId.get(id);
  const point = {
    id,
    label: r.itemLabel?.value ?? id,
    lon: Number(Number(m[1]).toFixed(5)),
    lat: Number(Number(m[2]).toFixed(5)),
    kind: r.classLabel?.value ?? "",
    countries: (r.countries?.value ?? "").split("|").filter(Boolean).sort(),
    // Bulk-imported points from one border-crossings dataset: they sit exactly on a border
    // line (0.00 km from CShapes' in most cases), so they are not independent evidence.
    bulk: /worldmap.harvard.edu/.test(r.refUrls?.value ?? ""),
    coordinate_source: (r.refUrls?.value ?? "").split("|").filter(Boolean)[0] ?? null,
    source: `https://www.wikidata.org/wiki/${id}`,
  };
  // An item with two coordinates or two matching classes appears twice; keep the first.
  if (!prev) byId.set(id, point);
}
const points = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
const out = {
  retrieved: new Date().toISOString().slice(0, 10),
  source: "Wikidata (CC0), via query.wikidata.org; query in scripts/fetch-border-references.js",
  points,
};
await writeFile(new URL("../data/border-reference-points.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${points.length} reference points to data/border-reference-points.json`);
