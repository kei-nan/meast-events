// Filters the CShapes 2.0 dataset (data/raw/cshapes-2.0.geojson, downloaded separately
// from https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson) down to our region and
// 1900-present, then applies our own corrections (scripts/boundary-corrections.js) to
// produce data/boundaries.json for the map's time-driven border layer.
//
// CShapes 2.0 by Schvitz et al., ETH Zurich - CC BY-NC-SA 4.0. Non-commercial use only;
// see https://icr.ethz.ch/data/cshapes/ before any commercial reuse of this project.
//
// data/raw/cshapes-2.0.geojson is untouched upstream data and should never be hand-edited.
// Every historical correction/addition this project makes lives in boundary-corrections.js
// instead, and is carried through to every output feature's `source`/`status`/`note`
// properties, so the generated file is self-documenting about what came from where.
import { readFile, writeFile } from "node:fs/promises";
import { CORRECTIONS } from "./boundary-corrections.js";
import { stringifyFeatureCollection } from "./lib/json-lines.js";

const CSHAPES_CITATION = "CShapes 2.0 (Schvitz et al., ETH Zurich, CC BY-NC-SA 4.0)";

const REGION_ENTITIES = [
  "Turkey (Ottoman Empire)",
  "Iran (Persia)",
  "Iraq",
  "Syria",
  "Lebanon",
  "Jordan",
  "Palestine",
  "Israel",
  "Egypt",
  "Saudi Arabia",
  "Yemen (Arab Republic of Yemen)",
  "Yemen, People's Republic of",
  "Kuwait",
  "Bahrain",
  "Qatar",
  "United Arab Emirates",
  "Oman",
];

// The map works in whole years, but CShapes records start and end on exact dates, so a
// predecessor and its successor both "cover" the changeover year. Each year is given to
// the record in force on 1 July, so exactly one record per entity is shown per year.
// A record that spans no 1 July (the 10-day Iraq record of 1932, two Balkan-war Ottoman
// snapshots) gets an empty range and is skipped.
const REFERENCE_DAY = "-07-01";
const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function activeYears(p) {
  const start = isoDate(p.gwsyear, p.gwsmonth, p.gwsday);
  const end = isoDate(p.gweyear, p.gwemonth, p.gweday);
  const startYear = start <= `${p.gwsyear}${REFERENCE_DAY}` ? p.gwsyear : p.gwsyear + 1;
  // CShapes ends in 2019; treat each country's last record as still current, since
  // none of these recognized sovereign borders have changed since (corrections that
  // extend into the present, like Israel's, rely on this too).
  if (p.gweyear >= 2019) return [startYear, 9999];
  const endYear = end >= `${p.gweyear}${REFERENCE_DAY}` ? p.gweyear : p.gweyear - 1;
  return [startYear, endYear];
}

function defaultName(cntry_name) {
  const openParen = cntry_name.indexOf(" (");
  return openParen >= 0 ? cntry_name.slice(0, openParen) : cntry_name;
}

// Every year strictly between startYear and endYear where either a split-phase
// boundary or a flag window edge falls - these are where we need to cut the raw
// CShapes feature into separate output features.
function cutPoints(cntry_name, startYear, endYear) {
  const cuts = new Set();
  for (const c of CORRECTIONS) {
    if (c.target !== cntry_name) continue;
    if (c.type === "split") {
      for (const phase of c.phases) {
        if (phase.until > startYear && phase.until <= endYear) cuts.add(phase.until);
      }
    } else if (c.type === "flag") {
      if (c.fromYear > startYear && c.fromYear <= endYear) cuts.add(c.fromYear);
      if (c.toYear + 1 > startYear && c.toYear + 1 <= endYear) cuts.add(c.toYear + 1);
    }
  }
  return [...cuts].sort((a, b) => a - b);
}

// Resolves name/status/note/source for one sub-interval, using its start year to
// decide which split-phase and/or flag (if any) applies. Flags win over splits over
// the untouched default, and combine where they don't overlap (e.g. a flag's note
// doesn't erase a split's name unless the flag also specifies its own name).
function resolveProperties(cntry_name, intervalStartYear) {
  let name = defaultName(cntry_name);
  let status = null;
  let note = null;
  let source = CSHAPES_CITATION;
  let geometryKey = null;

  const split = CORRECTIONS.find((c) => c.type === "split" && c.target === cntry_name);
  const phase = split?.phases.find((p) => intervalStartYear < p.until);
  if (phase) {
    name = phase.name;
    status = phase.status ?? null;
    note = split.note;
    source = phase.geometry
      ? `Geometry corrected per ${split.source} (see data/corrections-geometry.json); ${CSHAPES_CITATION} for the rest`
      : `${CSHAPES_CITATION} geometry, renamed per ${split.source}`;
    geometryKey = phase.geometry ?? null;
  }

  const flag = CORRECTIONS.find(
    (c) =>
      c.type === "flag" &&
      c.target === cntry_name &&
      intervalStartYear >= c.fromYear &&
      intervalStartYear <= c.toYear
  );
  if (flag) {
    if (flag.name) name = flag.name;
    status = flag.status;
    note = flag.note;
    source = `${CSHAPES_CITATION} geometry; ${flag.source}`;
  }

  return { name, status, note, source, geometryKey };
}

async function main() {
  const sourcePath = new URL("../data/raw/cshapes-2.0.geojson", import.meta.url);
  const geometryPath = new URL("../data/corrections-geometry.json", import.meta.url);
  const outPath = new URL("../data/boundaries.json", import.meta.url);

  const raw = JSON.parse(await readFile(sourcePath, "utf-8"));
  const correctionsGeometry = JSON.parse(await readFile(geometryPath, "utf-8"));
  const filtered = raw.features.filter(
    (f) => REGION_ENTITIES.includes(f.properties.cntry_name) && f.properties.gweyear >= 1900
  );

  const features = [];
  for (const f of filtered) {
    const p = f.properties;
    const cntry_name = p.cntry_name;
    const [startYear, endYear] = activeYears(p);
    if (endYear < startYear) continue;

    const cuts = cutPoints(cntry_name, startYear, endYear);
    const boundaries = [startYear, ...cuts, endYear];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const segStart = boundaries[i];
      const segEnd = i === boundaries.length - 2 ? endYear : boundaries[i + 1] - 1;
      if (segEnd < segStart) continue;
      const props = resolveProperties(cntry_name, segStart);
      features.push({
        type: "Feature",
        properties: {
          name: props.name,
          start_year: segStart,
          end_year: segEnd,
          status: props.status,
          source: props.source,
          note: props.note,
        },
        geometry: props.geometryKey ? correctionsGeometry[props.geometryKey] : f.geometry,
      });
    }
  }

  // "add" entries are territories the region filter above doesn't produce. Their geometry is
  // either a computed shape from corrections-geometry.json or, written "cshapes:<cntry_name>",
  // a CShapes record outside REGION_ENTITIES (e.g. its 1948-1967 "West Bank", which includes
  // East Jerusalem).
  const cshapesRecord = (cntry_name) => {
    const hits = raw.features.filter((f) => f.properties.cntry_name === cntry_name);
    if (hits.length !== 1) throw new Error(`expected one CShapes record "${cntry_name}", got ${hits.length}`);
    return hits[0].geometry;
  };
  for (const c of CORRECTIONS) {
    if (c.type !== "add") continue;
    const fromCshapes = c.geometry.startsWith("cshapes:");
    const geometry = fromCshapes ? cshapesRecord(c.geometry.slice("cshapes:".length)) : correctionsGeometry[c.geometry];
    if (!geometry) throw new Error(`no geometry "${c.geometry}" for ${c.name}`);
    features.push({
      type: "Feature",
      properties: {
        name: c.name,
        start_year: c.start_year,
        end_year: c.end_year,
        status: c.status,
        source: fromCshapes
          ? `${CSHAPES_CITATION} geometry (its "${c.geometry.slice("cshapes:".length)}" record); ${c.source}`
          : `Not in CShapes; ${c.source}${c.geometry_source ? `; ${c.geometry_source}` : ""}`,
        note: c.note,
      },
      geometry,
    });
  }

  const out = {
    type: "FeatureCollection",
    source:
      `Derived from ${CSHAPES_CITATION} with corrections and additions by this project - ` +
      "see each feature's `source`/`note` properties, and scripts/boundary-corrections.js " +
      "for the full list of changes with citations.",
    features,
  };

  await writeFile(outPath, stringifyFeatureCollection(out));
  console.log(`Wrote ${features.length} boundary features to data/boundaries.json`);

  const modified = features.filter((f) => f.properties.note);
  console.log(`${modified.length} features carry a correction:`);
  for (const f of modified) {
    console.log(`  ${f.properties.name} (${f.properties.start_year}-${f.properties.end_year})${f.properties.status ? ` [${f.properties.status}]` : ""}`);
  }
}

main();
