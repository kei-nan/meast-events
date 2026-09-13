// Filters the CShapes 2.0 dataset (data/raw/cshapes-2.0.geojson, downloaded separately
// from https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson) down to our region and
// 1900-present, producing data/boundaries.json for the map's time-driven border layer.
//
// CShapes 2.0 by Schvitz et al., ETH Zurich - CC BY-NC-SA 4.0. Non-commercial use only;
// see https://icr.ethz.ch/data/cshapes/ before any commercial reuse of this project.
import { readFile, writeFile } from "node:fs/promises";

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

// Known cases where a CShapes polygon reflects de facto administration rather than
// internationally recognized sovereignty. Flagged so the UI can render these borders
// distinctly instead of presenting them with the same certainty as settled borders.
const DISPUTED_NOTES = [
  {
    cntry_name: "Israel",
    fromYear: 1967,
    toYear: 2019,
    note:
      "This shape includes territory occupied in the 1967 Six-Day War (West Bank, Golan Heights, and until 1979 Sinai and Gaza). Israeli sovereignty over the West Bank and Golan Heights is not internationally recognized.",
  },
];

function findDisputedNote(cntry_name, gwsyear) {
  return DISPUTED_NOTES.find(
    (d) => d.cntry_name === cntry_name && gwsyear >= d.fromYear && gwsyear <= d.toYear
  );
}

async function main() {
  const sourcePath = new URL("../data/raw/cshapes-2.0.geojson", import.meta.url);
  const outPath = new URL("../data/boundaries.json", import.meta.url);

  const raw = JSON.parse(await readFile(sourcePath, "utf-8"));
  const filtered = raw.features.filter(
    (f) => REGION_ENTITIES.includes(f.properties.cntry_name) && f.properties.gweyear >= 1900
  );

  const features = filtered.map((f) => {
    const p = f.properties;
    const disputed = findDisputedNote(p.cntry_name, p.gwsyear);
    return {
      type: "Feature",
      properties: {
        name: p.cntry_name,
        start_year: p.gwsyear,
        // CShapes ends in 2019; treat each country's last record as still current,
        // since none of these recognized sovereign borders have changed since.
        end_year: p.gweyear >= 2019 ? 9999 : p.gweyear,
        disputed: disputed ? disputed.note : null,
      },
      geometry: f.geometry,
    };
  });

  const out = {
    type: "FeatureCollection",
    source: "CShapes 2.0 (Schvitz et al., ETH Zurich), CC BY-NC-SA 4.0, https://icr.ethz.ch/data/cshapes/",
    features,
  };

  await writeFile(outPath, JSON.stringify(out));
  console.log(`Wrote ${features.length} boundary features to data/boundaries.json`);

  const byName = {};
  for (const f of features) {
    byName[f.properties.name] = (byName[f.properties.name] ?? 0) + 1;
  }
  console.log(byName);
}

main();
