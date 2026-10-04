// Validates data/boundaries.json: required properties, per-name year continuity, and areas
// that two features shown in the same year both cover. Reports only; never changes the file.
// Exits non-zero only on structural errors; gaps and unexpected overlaps are warnings.
//   node scripts/validate-boundaries.js [path]
// Needs the repo-root dependencies (`npm ci` at the root) for @turf/turf.
import { readFile } from "node:fs/promises";
import * as turf from "@turf/turf";
import { checkBoundaries, OVERLAP_MIN_KM2, INTENTIONAL_OVERLAY_STATUSES } from "./lib/boundary-checks.js";

const path = process.argv[2] ?? new URL("../data/boundaries.json", import.meta.url);
const shown = process.argv[2] ?? "data/boundaries.json";

let geojson;
try {
  geojson = JSON.parse(await readFile(path, "utf-8"));
} catch (e) {
  console.error(`FAIL ${shown}: cannot read/parse (${e.message})`);
  process.exit(1);
}

const { errors, warnings, overlaps, slivers } = checkBoundaries(geojson, { turf });
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
  process.exit(1);
}
console.log(`ok   ${shown}: ${geojson.features.length} features valid (${warnings.length} warning(s))`);
