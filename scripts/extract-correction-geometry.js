// One-off extraction/computation step producing data/corrections-geometry.json - the
// polygon shapes our own corrections need that don't already exist in raw CShapes.
// Unlike data/raw/*, this file's inputs are OUR choice of sources and OUR computation
// (e.g. a polygon difference), so it's not upstream data - it's authored by us, same as
// boundary-corrections.js, just too large/computed to write out by hand as coordinates.
//
// Requires @turf/turf, which is NOT a project dependency (only needed to regenerate this
// file) - run `npm install --no-save @turf/turf` before running this script, and don't
// commit it to package.json.
//
// Sources (both public domain, Natural Earth):
//   https://github.com/nvkelso/natural-earth-vector - ne_10m_admin_0_countries.geojson,
//   ne_10m_admin_1_states_provinces.geojson
// Download commands:
//   curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson -o data/raw/ne10-countries.geojson
//   curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson -o data/raw/ne10-admin1.geojson
import { readFile, writeFile } from "node:fs/promises";
import * as turf from "@turf/turf";

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

  const out = {
    turkeyPre1939: turkeyMinusHatay.geometry,
    hatay: hatayFeature.geometry,
    westBank: { type: "Polygon", coordinates: westBankPart },
    gaza: { type: "Polygon", coordinates: gazaPart },
  };

  await writeFile(new URL("../data/corrections-geometry.json", import.meta.url), JSON.stringify(out));
  console.log("Wrote data/corrections-geometry.json:", Object.keys(out));
}

main();
