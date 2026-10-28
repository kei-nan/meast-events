// Validates data/boundaries.json: required properties, per-name year continuity, and areas
// that two features shown in the same year both cover. Reports only; never changes the file.
// Exits non-zero on structural errors, on ring crossings not in ACCEPTED_RING_CROSSINGS, and
// on any feature with fewer vertices or coarser coordinates than in
// data/border-geometry-baseline.json (borders are never simplified); gaps and unexpected
// overlaps are warnings.
//   node scripts/validate-boundaries.js [path]
//   node scripts/validate-boundaries.js --write-geometry-baseline   (only after an approved geometry change)
// Needs the repo-root dependencies (`npm ci` at the root) for @turf/turf.
import { readFile, writeFile } from "node:fs/promises";
import * as turf from "@turf/turf";
import { checkBoundaries, geometryFingerprint, OVERLAP_MIN_KM2, INTENTIONAL_OVERLAY_STATUSES } from "./lib/boundary-checks.js";

const pathArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const path = pathArg ?? new URL("../data/boundaries.json", import.meta.url);
const shown = pathArg ?? "data/boundaries.json";
const baselineUrl = new URL("../data/border-geometry-baseline.json", import.meta.url);

let geojson;
try {
  geojson = JSON.parse(await readFile(path, "utf-8"));
} catch (e) {
  console.error(`FAIL ${shown}: cannot read/parse (${e.message})`);
  process.exit(1);
}

if (process.argv.includes("--write-geometry-baseline")) {
  const fp = geometryFingerprint(geojson.features);
  await writeFile(baselineUrl, JSON.stringify(fp, null, 2) + "\n");
  console.log(`Wrote data/border-geometry-baseline.json (${Object.keys(fp).length} features)`);
  process.exit(0);
}

const geometryBaseline = JSON.parse(await readFile(baselineUrl, "utf-8"));
const { errors, warnings, overlaps, slivers } = checkBoundaries(geojson, { turf, geometryBaseline });
for (const w of warnings) console.warn(`warn ${w}`);
const intentional = (overlaps ?? []).filter((o) => o.intentional);
if (intentional.length) {
  console.log(
    `info ${intentional.length} intentional overlay overlap(s) (status ${INTENTIONAL_OVERLAY_STATUSES.join(" / ")} containing a flagged shape drawn on top), not listed`
  );
}
if (overlaps) console.log(`info ${slivers} border sliver(s) under ${OVERLAP_MIN_KM2} km2 between neighbouring shapes, not listed`);
if (errors.length) {
  console.error(`FAIL ${shown}: ${errors.length} violation(s)`);
  for (const e of errors) console.error(`  ${e}`);
  if (errors.some((e) => /simplified|coarsened|geometry baseline/.test(e))) {
    console.error("Borders are never simplified (DATA_POLICY.md). Only for an approved geometry change: node scripts/validate-boundaries.js --write-geometry-baseline");
  }
  process.exit(1);
}
console.log(`ok   ${shown}: ${geojson.features.length} features valid, none simplified or coarsened vs data/border-geometry-baseline.json (${warnings.length} warning(s))`);
