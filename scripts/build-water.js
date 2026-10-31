// Builds the map's water names and its two lakes (app/src/data/water.json): physical
// geography only, like the land (scripts/build-land.js), so nothing on it changes with the
// year shown.
//
//  - Names of seas, gulfs and straits: label points, each with the English Wikipedia
//    title of its Wikidata item as the name (the source the event titles use) and the
//    item's coordinate (P625) as the place, unless SEAS gives `at` and says why.
//  - The Dead Sea and the Sea of Galilee: Natural Earth 1:10m lake outlines, source
//    vertices unchanged, with a label point (the item's P625) inside each. The Dead Sea is
//    two outlines, the northern basin and the southern one: lake until the 1970s and salt
//    evaporation ponds since, water in every year either way. Natural Earth's
//    land counts both as land, so the map drew them as land. They are drawn over the land
//    in the sea's colour; the land itself, and data/land-mask.json the borders are fitted
//    to, do not change. No other lake: reservoirs did not exist for much of 1900-present,
//    and other lakes' shores moved far (Urmia), so one outline would be wrong for some years.
//
// The names are a choice of which water to name; the wording is the source's. Where a
// body of water has other names (the Persian Gulf is also called the Arabian Gulf, the
// Gulf of Aqaba the Gulf of Eilat, the Sea of Galilee Lake Kinneret or Lake Tiberias),
// the map shows English Wikipedia's title, as it does for every event.
//
// Checks (the build fails): every item has an English Wikipedia article and a coordinate;
// every sea label is in the sea (outside data/land-mask.json) and every lake label inside
// its lake; every name is Basic Latin (the map's label font holds Basic Latin for any
// text, app/scripts/subset-fonts.mjs, but other characters only from border names).
//
// Source, pinned to the commit the land is built from (Natural Earth 5.1.x, public domain):
//   curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ace5fed0eaf3c6c03c951e75b439ba8fffbc218e/geojson/ne_10m_lakes.geojson -o data/raw/ne10-lakes.geojson
// Wikidata (CC0): one wbgetentities request (lib/wd-entities.js).
//
// CLI (optional): --raw-dir=DIR  read the source from DIR (default data/raw)
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { fetchEntities } from "./lib/wd-entities.js";
import { stringifyFeatureCollection } from "./lib/json-lines.js";
import { geometryBbox, geometryContains } from "../app/src/lib/placeHistory.js";

// Which water is named, and from which zoom (`minzoom`). The map opens at zoom ~2.1-2.7
// on a phone and ~3.0-3.6 on a desktop (lib/mapBase.js defaultCamera). There only the
// open seas have room for a name; the Red Sea and the Persian Gulf are ~80 px wide, and
// their names lost to the state names and cluster counts beside them on some screens and
// not others (water names are placed last, mapInstallLayers.js), so they come at zoom 4
// with the other gulfs. Then the straits. Like a state's name, a water name that would
// overlap a label placed before it is not drawn (it returns on zoom), so where it sits matters:
// `at` [lon, lat] replaces the item's P625 where that point is off the view or crowded.
const SEAS = [
  // Wikidata's point (38N 17E) is west of Greece, off the map's view of the region: the
  // map's part of the sea is the eastern basin. Drawn in the opening view on a desktop; on
  // a phone the basin is narrower than the name there, and it comes on zooming in.
  { qid: "Q4918", minzoom: 0, at: [28, 33.6] },
  { qid: "Q166", minzoom: 0 }, // Black Sea
  { qid: "Q5484", minzoom: 0 }, // Caspian Sea
  { qid: "Q23406", minzoom: 4 }, // Red Sea
  // Wikidata's point (26N 52E) is beside Qatar and the UAE's coast, where their names and
  // the cluster counts of their events take the space: the open middle of the gulf is
  // north-west of it.
  { qid: "Q34675", minzoom: 4, at: [50.3, 27.6] },
  // Wikidata's point (16N 64E) is on the phone's opening view's eastern edge (63.5E).
  { qid: "Q58705", minzoom: 0, at: [61, 17] },
  { qid: "Q41837", minzoom: 4 }, // Gulf of Aden
  { qid: "Q79948", minzoom: 4 }, // Gulf of Oman
  { qid: "Q34575", minzoom: 4 }, // Aegean Sea
  { qid: "Q187274", minzoom: 4 }, // Gulf of Sidra
  { qid: "Q35367", minzoom: 5.5 }, // Sea of Marmara
  { qid: "Q168277", minzoom: 5.5 }, // Gulf of Suez
  { qid: "Q81611", minzoom: 5.5 }, // Gulf of Aqaba
  { qid: "Q83318", minzoom: 5.5 }, // Bab-el-Mandeb
  { qid: "Q79883", minzoom: 5.5 }, // Strait of Hormuz
  { qid: "Q35958", minzoom: 7 }, // Bosporus
  { qid: "Q6514", minzoom: 7 }, // Dardanelles
  { qid: "Q208157", minzoom: 7 }, // Straits of Tiran
];
const LAKES = [
  { qid: "Q23883", minzoom: 7 }, // Dead Sea
  { qid: "Q126982", minzoom: 7 }, // Sea of Galilee
];

const argVal = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const RAW_DIR = argVal("raw-dir") ? pathToFileURL(resolve(argVal("raw-dir")) + "/") : new URL("../data/raw/", import.meta.url);
const OUT = new URL("../app/src/data/water.json", import.meta.url);

const items = await fetchEntities([...SEAS, ...LAKES].map((s) => s.qid), { props: "claims|labels|sitelinks/urls" });
const problems = [];
function described({ qid }) {
  const item = items.get(qid);
  if (!item) return problems.push(`${qid}: no such Wikidata item`), null;
  if (item.redirected) problems.push(`${qid}: redirects to ${item.qid}; use that id`);
  if (!item.enwiki) problems.push(`${qid} (${item.label}): no English Wikipedia article`);
  if (!item.p625) problems.push(`${qid} (${item.label}): no coordinate (P625)`);
  if (item.enwiki && !/^[\x20-\x7e]+$/.test(item.enwiki)) problems.push(`${qid}: "${item.enwiki}" is not Basic Latin (subset-fonts.mjs)`);
  return item;
}
const round6 = (v) => Math.round(v * 1e6) / 1e6;
const point = (lon, lat) => ({ type: "Point", coordinates: [round6(lon), round6(lat)] });

const land = JSON.parse(await readFile(new URL("../data/land-mask.json", import.meta.url), "utf-8")).features.map((f) => ({
  geometry: f.geometry,
  box: geometryBbox(f.geometry),
}));
const onLand = ([lon, lat]) =>
  land.some(({ geometry, box }) => lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3] && geometryContains(geometry, lon, lat));

const features = [];
for (const sea of SEAS) {
  const item = described(sea);
  if (!item?.p625 || !item.enwiki) continue;
  const at = sea.at ?? [item.p625.lon, item.p625.lat];
  if (onLand(at)) problems.push(`${sea.qid} (${item.enwiki}): label point ${at.join(", ")} is on land`);
  features.push({ type: "Feature", properties: { kind: "sea", name: item.enwiki, qid: sea.qid, minzoom: sea.minzoom }, geometry: point(...at) });
}

const neLakes = JSON.parse(await readFile(new URL("ne10-lakes.geojson", RAW_DIR), "utf-8")).features;
for (const lake of LAKES) {
  const item = described(lake);
  const outlines = neLakes.filter((f) => f.properties.wikidataid === lake.qid);
  if (!outlines.length) {
    problems.push(`${lake.qid}: no Natural Earth lake has this wikidataid`);
    continue;
  }
  if (!item?.p625 || !item.enwiki) continue;
  const at = [item.p625.lon, item.p625.lat];
  if (!outlines.some((f) => geometryContains(f.geometry, ...at))) problems.push(`${lake.qid} (${item.enwiki}): P625 ${at.join(", ")} is outside its outlines`);
  for (const { geometry } of outlines) features.push({ type: "Feature", properties: { kind: "lake", name: item.enwiki, qid: lake.qid }, geometry });
  features.push({ type: "Feature", properties: { kind: "lake-label", name: item.enwiki, qid: lake.qid, minzoom: lake.minzoom }, geometry: point(...at) });
}

if (problems.length) {
  for (const p of problems) console.error(`- ${p}`);
  throw new Error(`build-water: ${problems.length} problem(s)`);
}
await writeFile(OUT, stringifyFeatureCollection({ type: "FeatureCollection", features }));
const names = features.filter((f) => f.properties.kind !== "lake").map((f) => f.properties.name);
console.log(`water.json: ${names.length} names (${names.join(", ")}); ${features.length - names.length} lake outlines`);
