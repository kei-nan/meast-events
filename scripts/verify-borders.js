// Checks the drawn borders against independent reference points (Wikidata border
// crossings, checkpoints and tripoints in data/border-reference-points.json, fetched by
// scripts/fetch-border-references.js). A crossing sits ON a border, so the nearest drawn
// land border should pass close to it. For one year of the map (default: the current
// year) every point gets: the distance to the nearest drawn land border - an edge where
// two shapes meet, so coastlines do not count - and the two shapes that meet there.
//
//   node scripts/verify-borders.js [--year=2026] [--report=docs/border-verification.md]
//   node scripts/verify-borders.js --write-baseline   (years in BASELINE_YEARS -> data/border-check-baseline.json)
//   node scripts/verify-borders.js --check            (fails if any independent point moved
//                                                      more than ${TOLERANCE_KM} km further from the border than in the baseline)
//
// It reports; it does not decide which source is right. A large distance means the drawn
// line, the Wikidata coordinate, or both are off - each listed point links to Wikidata.
// Points bulk-imported from one border-crossings dataset ("bulk") sit exactly on a border
// line, often CShapes' own, so they are shown but not counted as independent evidence.
import { readFile, writeFile } from "node:fs/promises";
import * as turf from "@turf/turf";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const YEAR = Number(arg("year") ?? new Date().getUTCFullYear());
const REPORT = arg("report");
const BASELINE_YEARS = [1930, 1960, 1990, 2026];
const TOLERANCE_KM = 0.25; // how much further from a reference point a border may move before --check fails
const SEARCH_KM = 10; // look for borders within this distance of a point
const SHARED_KM = 0.3; // an edge counts as a land border if another shape is this close to it
export const BANDS = [
  { max: 1, label: "within 1 km" },
  { max: 3, label: "1-3 km" },
  { max: SEARCH_KM, label: `3-${SEARCH_KM} km` },
  { max: Infinity, label: `no land border within ${SEARCH_KM} km` },
];

const read = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf-8"));

// A shape we changed or added (not plain CShapes): the borders that most need checking.
export const isModified = (f) => /Not in CShapes|fitted|corrected per|its "West Bank" record/.test(f.properties.source ?? "");

// Distance (km) from a point to a polygon's outline, for Polygon and MultiPolygon alike.
function distanceToEdge(pt, feature) {
  let best = Infinity;
  for (const line of turf.flatten(turf.polygonToLine(feature)).features) best = Math.min(best, turf.pointToLineDistance(pt, line));
  return best;
}

function segmentsNear(feature, area) {
  const out = [];
  for (const line of turf.flatten(turf.polygonToLine(feature)).features) {
    const coords = turf.getCoords(line);
    for (let i = 0; i < coords.length - 1; i++) {
      const seg = turf.lineString([coords[i], coords[i + 1]]);
      if (turf.booleanIntersects(seg, area)) out.push(seg);
    }
  }
  return out;
}

export function measure(point, features) {
  const p = turf.point([point.lon, point.lat]);
  const area = turf.buffer(p, SEARCH_KM);
  const near = features.filter((f) => turf.booleanIntersects(f, area));
  let best = null;
  for (const a of near) {
    for (const seg of segmentsNear(a, area)) {
      const mid = turf.midpoint(...turf.getCoords(seg).map((c) => turf.point(c)));
      const other = near.find((b) => b !== a && (turf.booleanPointInPolygon(mid, b) || distanceToEdge(mid, b) <= SHARED_KM));
      if (!other) continue; // coastline or the edge of the mapped region
      const d = turf.pointToLineDistance(p, seg);
      if (!best || d < best.km) best = { km: d, a, b: other };
    }
  }
  return best;
}

function measureYear(points, all, year) {
  const features = all.filter((f) => f.properties.start_year <= year && year <= f.properties.end_year);
  return points.map((pt) => {
    const m = measure(pt, features);
    return {
      ...pt,
      km: m ? m.km : Infinity,
      between: m ? [m.a.properties.name, m.b.properties.name].sort() : [],
      modified: m ? isModified(m.a) || isModified(m.b) : false,
    };
  });
}

async function main() {
  const { points, retrieved } = await read("../data/border-reference-points.json");
  const all = (await read("../data/boundaries.json")).features;
  const baselineUrl = new URL("../data/border-check-baseline.json", import.meta.url);
  if (process.argv.includes("--write-baseline") || process.argv.includes("--check")) {
    const now = Object.fromEntries(BASELINE_YEARS.map((y) => [y, Object.fromEntries(
      measureYear(points.filter((p) => !p.bulk), all, y).map((r) => [r.id, Number.isFinite(r.km) ? Number(r.km.toFixed(3)) : null])
    )]));
    if (process.argv.includes("--write-baseline")) {
      await writeFile(baselineUrl, JSON.stringify({ tolerance_km: TOLERANCE_KM, years: now }, null, 2) + "\n");
      console.log(`Wrote data/border-check-baseline.json (${BASELINE_YEARS.join(", ")})`);
      return;
    }
    const base = JSON.parse(await readFile(baselineUrl, "utf-8")).years;
    const worse = [];
    for (const y of BASELINE_YEARS) for (const [id, km] of Object.entries(now[y])) {
      const was = base[y]?.[id];
      if (was == null) continue; // new point, or no land border near it before
      if (km == null || km > was + TOLERANCE_KM) worse.push(`${y} ${id} ${points.find((p) => p.id === id).label}: ${was} km -> ${km ?? "no border nearby"} km`);
    }
    if (worse.length) {
      console.error(`${worse.length} reference point(s) are now further from the drawn border than the baseline allows (${TOLERANCE_KM} km):\n  ${worse.join("\n  ")}`);
      console.error("If the change is intended and checked, update the baseline: node scripts/verify-borders.js --write-baseline");
      process.exit(1);
    }
    console.log(`ok: no independent reference point moved more than ${TOLERANCE_KM} km further from the drawn border (${BASELINE_YEARS.join(", ")})`);
    return;
  }
  const rows = measureYear(points, all, YEAR);
  const band = (km) => BANDS.find((b) => km <= b.max).label;
  const tally = (list) => BANDS.map((b) => `${b.label}: ${list.filter((r) => band(r.km) === b.label).length}`).join(", ");
  const indep = rows.filter((r) => !r.bulk);
  const modified = indep.filter((r) => r.modified);
  const fmt = (r) =>
    `| ${Number.isFinite(r.km) ? r.km.toFixed(2) : "-"} | [${r.label}](${r.source}) (${r.id}) | ${r.kind} | ${r.countries.join(", ")} | ${r.between.join(" / ")} |`;
  const lines = [
    `# Border check against Wikidata reference points (map year ${YEAR})`,
    "",
    `Generated by \`node scripts/verify-borders.js --year=${YEAR}\` from data/boundaries.json and ` +
      `data/border-reference-points.json (${points.length} Wikidata border crossings, checkpoints and tripoints, retrieved ${retrieved}).`,
    "Distance = from the point to the nearest drawn land border (an edge where two shapes meet; coasts excluded).",
    "A large distance means the drawn line, the Wikidata coordinate, or both are off: follow the link to check the point.",
    "",
    `**Independent points (${indep.length}):** ${tally(indep)}.`,
    "",
    `**Independent points whose nearest border involves a shape this project changed or added (${modified.length}):** ${tally(modified)}.`,
    "(\"Changed\" is broad: any border of a shape the corrections touched, e.g. all of Israel's or Jordan's borders.)",
    "",
    `**Bulk points (${rows.length - indep.length}, not counted above):** coordinates from one border-crossings dataset (worldmap.harvard.edu); they sit exactly on a border line, often CShapes' own, so they are not independent evidence. Listed last.`,
    "",
    "Not every point is a valid reference for every year: a crossing on a border drawn later (e.g. the 1969 Kuwait-Saudi " +
      "partition line, for 1960) is expected to be far off, and some checkpoints are not on an international border " +
      "(e.g. on the Jerusalem barrier).",
    "",
    "## Borders this project changed or added",
    "",
    "| km | Reference point | Kind | Wikidata countries | Nearest drawn border between |",
    "|---:|---|---|---|---|",
    ...modified.sort((a, b) => b.km - a.km).map(fmt),
    "",
    "## All other independent points (CShapes borders as published), farthest first",
    "",
    "| km | Reference point | Kind | Wikidata countries | Nearest drawn border between |",
    "|---:|---|---|---|---|",
    ...indep.filter((r) => !r.modified).sort((a, b) => b.km - a.km).map(fmt),
    "",
    "## Bulk points (not independent evidence), farthest first",
    "",
    "| km | Reference point | Kind | Wikidata countries | Nearest drawn border between |",
    "|---:|---|---|---|---|",
    ...rows.filter((r) => r.bulk).sort((a, b) => b.km - a.km).map(fmt),
    "",
  ];
  if (REPORT) await writeFile(REPORT, lines.join("\n"));
  console.log(`year ${YEAR}: independent points (${indep.length}) - ${tally(indep)}`);
  console.log(`  on changed/added borders (${modified.length}) - ${tally(modified)}`);
  for (const r of modified.sort((a, b) => b.km - a.km).slice(0, 15)) console.log(`  ${Number.isFinite(r.km) ? r.km.toFixed(2) : "-"} km  ${r.label} (${r.id})  [${r.between.join(" / ")}]`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("verify-borders.js")) await main();
