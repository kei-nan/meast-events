// One-off extraction/computation step producing data/corrections-geometry.json - the
// polygon shapes our own corrections need that don't already exist in raw CShapes.
// Unlike data/raw/*, this file's inputs are OUR choice of sources and OUR computation
// (e.g. a polygon difference), so it's not upstream data - it's authored by us, same as
// boundary-corrections.js, just too large/computed to write out by hand as coordinates.
//
// Requires @turf/turf and shapefile, NEITHER of which is a project dependency (both are
// only needed to regenerate this file) - run `npm install --no-save @turf/turf shapefile`
// before running this script, and don't commit either to package.json.
//
// Sources:
//
// 1. Natural Earth (public domain) - ne_10m_admin_0_countries, ne_10m_admin_1_states_provinces:
//      https://github.com/nvkelso/natural-earth-vector
//    Download commands:
//      curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson -o data/raw/ne10-countries.geojson
//      curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson -o data/raw/ne10-admin1.geojson
//
// 2. UN OCHA occupied Palestinian territory (oPt), "State of Palestine - Oslo Agreement in
//    the West Bank" (source: Palestinian Authority Ministry of Planning), published on the
//    Humanitarian Data Exchange:
//      https://data.humdata.org/dataset/state-of-palestine-other-0-0-0-0-0
//    Download commands:
//      curl -sL -A "Mozilla/5.0" https://data.humdata.org/dataset/d3a843df-a640-4e9d-b867-8ca974c2aa74/resource/86f2707a-dc64-46af-bd41-b31e95611b45/download/osloagreement.zip -o data/raw/oslo-agreement.zip
//      unzip -o -d data/raw/oslo-agreement data/raw/oslo-agreement.zip
//    License: HDX lists it under the legacy HumanitarianResponse.info terms, which grant
//    permission to download and copy the material for non-commercial use and permit
//    derivative works "subject to the inclusion of credit to the source of the Materials
//    used" (archived at
//    https://web.archive.org/web/20260728185723/https://data.humdata.org/about/license/legacy_hrinfo).
//    That is compatible with this project, which is already non-commercial-only because of
//    CShapes' CC BY-NC-SA 4.0 terms. Note this is NOT the same as the more restrictive
//    terms on the ochaopt.org website itself, which forbid derivative works; the HDX
//    dataset page is the one we took the data from and is the license that applies to it.
import { readFile, writeFile } from "node:fs/promises";
import * as turf from "@turf/turf";
import * as shapefile from "shapefile";

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

async function main() {
  const cshapes = JSON.parse(await readFile(new URL("../data/raw/cshapes-2.0.geojson", import.meta.url), "utf-8"));
  const ne10 = JSON.parse(await readFile(new URL("../data/raw/ne10-countries.geojson", import.meta.url), "utf-8"));
  const ne10admin1 = JSON.parse(await readFile(new URL("../data/raw/ne10-admin1.geojson", import.meta.url), "utf-8"));

  // Turkey's current CShapes geometry (single 1923-9999 record) already includes Hatay,
  // correctly, for the post-1939 period - we only need to subtract Hatay to get the
  // pre-1939 shape.
  const turkeyFeature = cshapes.features.find(
    (f) => f.properties.cntry_name === "Turkey (Ottoman Empire)" && f.properties.gwsyear === 1923
  );
  const hatayFeature = ne10admin1.features.find((f) => f.properties.admin === "Turkey" && f.properties.name === "Hatay");
  const turkeyMinusHatay = turf.difference(
    turf.featureCollection([turf.feature(turkeyFeature.geometry), turf.feature(hatayFeature.geometry)])
  );

  // Natural Earth's "Palestine" feature is a MultiPolygon combining the West Bank and
  // Gaza Strip as two disconnected parts - split by testing which part contains a known
  // point in each.
  const palestineFeature = ne10.features.find((f) => f.properties.NAME === "Palestine");
  const gazaCity = [34.4667, 31.5];
  const gazaPart = palestineFeature.geometry.coordinates.find((poly) => pointInRing(gazaCity, poly[0]));
  const westBankPart = palestineFeature.geometry.coordinates.find((poly) => poly !== gazaPart);

  // --- Oslo II Areas A/B/C in the West Bank (OCHA oPt / PA Ministry of Planning) ---
  //
  // The shapefile has 8 features with a CLASS attribute: A (twice), C, "Nature Reserve",
  // "Israeli Declared East Jerusalem", "No Man's Land", H1 and H2. There is no feature
  // labelled B - one of the two CLASS="A" features is in fact Area B, and OCHA's own
  // metadata says the dataset is "categorized into A,B,C", so this looks like a labelling
  // error introduced when the layer was unioned with the Hebron H1/H2 layer (the .shp.xml
  // metadata records exactly such a Union step).
  //
  // Rather than hard-code an OBJECTID, we identify Area A the way the Oslo II Accord
  // defines it - the major Palestinian city centres - and take the other CLASS="A"
  // feature as Area B. Two independent checks confirm the result below: the shapes,
  // (Area A is 15-16 large blocks around the cities, Area B is ~210 small village
  // enclaves), and the resulting area percentages, which match the published figures.
  const oslo = await shapefile.read(
    new URL("../data/raw/oslo-agreement/OsloAgreement.shp", import.meta.url).pathname.slice(1),
    new URL("../data/raw/oslo-agreement/OsloAgreement.dbf", import.meta.url).pathname.slice(1)
  );
  const osloByClass = (cls) => oslo.features.filter((f) => f.properties.CLASS === cls);
  const osloOne = (cls) => {
    const hits = osloByClass(cls);
    if (hits.length !== 1) throw new Error(`expected exactly one OsloAgreement feature of class ${cls}, got ${hits.length}`);
    return hits[0];
  };

  // City centres that Oslo II placed in Area A (Hebron is excluded - the 1997 Hebron
  // Protocol split it into H1/H2, which are their own features in this dataset).
  const AREA_A_CITY_CENTRES = [
    [35.2544, 32.2211], // Nablus
    [35.2042, 31.9038], // Ramallah
    [35.2969, 32.4597], // Jenin
    [35.4444, 31.8569], // Jericho
    [35.0286, 32.3097], // Tulkarm
    [35.2025, 31.7054], // Bethlehem
    [34.9706, 32.1897], // Qalqilya
  ];
  const ambiguousA = osloByClass("A");
  if (ambiguousA.length !== 2) throw new Error(`expected two CLASS="A" features, got ${ambiguousA.length}`);
  const areaAFeature = ambiguousA.find((f) =>
    AREA_A_CITY_CENTRES.every((pt) => turf.booleanPointInPolygon(turf.point(pt), f))
  );
  if (!areaAFeature) throw new Error("no CLASS=\"A\" feature contains all seven Area A city centres");
  const areaBFeature = ambiguousA.find((f) => f !== areaAFeature);

  const unionAll = (feats) =>
    feats.reduce((acc, f) => (acc ? turf.union(turf.featureCollection([acc, f])) : f), null);

  // Groupings, and why each one:
  //   A: Area A + Hebron H1, the part of Hebron under Palestinian control since the 1997
  //      Hebron Protocol - functionally the same control regime as Area A.
  //   B: Area B + the Oslo Nature Reserves, which OCHA keeps as a separate class but which
  //      Oslo II placed under the Area B regime (Palestinian civil control) with building
  //      restricted. Counting them with B is what reproduces the published "~21-22%".
  //   C: Area C + Hebron H2 (Israeli-controlled Hebron) + the two categories that sit
  //      outside the Oslo A/B/C classification altogether but are likewise under Israeli
  //      control - Israeli-declared East Jerusalem (~69 km2) and the 1949-1967 no-man's-
  //      land (~50 km2). Folding those two into C is OUR simplification, made so the three
  //      output shapes tile the West Bank with no holes; it is called out in the note on
  //      the Area C correction entry.
  const osloGroups = {
    westBankAreaA: [areaAFeature, osloOne("H1")],
    westBankAreaB: [areaBFeature, osloOne("Nature Reserve")],
    westBankAreaC: [osloOne("C"), osloOne("H2"), osloOne("Israeli Declared East Jerusalem"), osloOne("No Man's Land")],
  };

  const osloGeometry = {};
  let osloTotalKm2 = 0;
  const osloAreasKm2 = {};
  for (const [key, feats] of Object.entries(osloGroups)) {
    const merged = unionAll(feats);
    osloAreasKm2[key] = turf.area(merged) / 1e6;
    osloTotalKm2 += osloAreasKm2[key];
    // ~0.001 degrees is ~100m, far below anything visible at this map's zoom levels.
    // Keeps the three shapes to ~290KB combined while holding every area to within 0.5%
    // of the unsimplified source (checked below).
    const simplified = turf.simplify(merged, { tolerance: 0.001, highQuality: true, mutate: false });
    osloGeometry[key] = turf.truncate(simplified, { precision: 5, coordinates: 2 }).geometry;
  }

  console.log("Oslo II area shares (computed from the unsimplified OCHA geometry):");
  for (const [key, km2] of Object.entries(osloAreasKm2)) {
    const simplifiedKm2 = turf.area(turf.feature(osloGeometry[key])) / 1e6;
    console.log(
      `  ${key}: ${km2.toFixed(1)} km2 = ${((km2 / osloTotalKm2) * 100).toFixed(1)}% of the West Bank ` +
        `(${simplifiedKm2.toFixed(1)} km2 after simplification)`
    );
  }
  console.log(`  total: ${osloTotalKm2.toFixed(1)} km2`);

  const out = {
    turkeyPre1939: turkeyMinusHatay.geometry,
    hatay: hatayFeature.geometry,
    westBank: { type: "Polygon", coordinates: westBankPart },
    gaza: { type: "Polygon", coordinates: gazaPart },
    ...osloGeometry,
  };

  await writeFile(new URL("../data/corrections-geometry.json", import.meta.url), JSON.stringify(out));
  console.log("Wrote data/corrections-geometry.json:", Object.keys(out));
}

main();
