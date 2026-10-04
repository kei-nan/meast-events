// Validates data/events.json (curated) and, if present, data/events.proposed.json.
// Exits non-zero on any violation so CI fails. Structural checks only - see lib/validate.js.
//   node scripts/validate-events.js [file ...]
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { validateEvents, checkFramingCoverage } from "./lib/validate.js";

const root = new URL("../", import.meta.url);
const defaults = [
  { path: "data/events.json", lenient: true, required: true },
  { path: "data/events.proposed.json", lenient: false, required: false },
];
const cliFiles = process.argv.slice(2);
const targets = cliFiles.length
  ? cliFiles.map((p) => ({ path: p, lenient: !/proposed/.test(p), required: true }))
  : defaults;

let failed = false;
for (const t of targets) {
  const url = new URL(t.path, root);
  if (!cliFiles.length && !existsSync(url)) {
    if (t.required) {
      console.error(`FAIL ${t.path}: file missing`);
      failed = true;
    } else console.log(`skip ${t.path} (not present)`);
    continue;
  }
  let events;
  try {
    events = JSON.parse(await readFile(cliFiles.length ? t.path : url, "utf-8"));
  } catch (e) {
    console.error(`FAIL ${t.path}: cannot parse JSON (${e.message})`);
    failed = true;
    continue;
  }
  // The proposed file's possible_duplicates hints may point at curated events.
  const curatedUrl = new URL("data/events.json", root);
  const otherIds =
    !t.lenient && existsSync(curatedUrl)
      ? new Set(JSON.parse(await readFile(curatedUrl, "utf-8")).map((e) => e?.id))
      : new Set();
  const { errors, warnings } = validateEvents(events, { name: t.path, lenient: t.lenient, otherIds });
  for (const w of warnings) console.warn(`warn ${w}`);
  if (errors.length) {
    failed = true;
    console.error(`FAIL ${t.path}: ${errors.length} violation(s)`);
    for (const e of errors.slice(0, 50)) console.error(`  ${e}`);
    if (errors.length > 50) console.error(`  ... and ${errors.length - 50} more`);
  } else {
    console.log(`ok   ${t.path}: ${events.length} events valid (${warnings.length} warning(s))`);
  }
  // The curated file must have a current framing review per event (warnings only: a refreshed
  // summary stays "stale" until it is re-reviewed).
  if (t.lenient && /(^|[\\/])events\.json$/.test(t.path) && Array.isArray(events)) {
    const reviewUrl = new URL("data/framing-review.json", root);
    if (!existsSync(reviewUrl)) {
      console.warn("warn data/framing-review.json missing: no framing reviews");
      continue;
    }
    const review = JSON.parse(await readFile(reviewUrl, "utf-8"));
    const cov = checkFramingCoverage(events, review, { name: "data/framing-review.json" });
    for (const w of cov.warnings) console.warn(`warn ${w}`);
    console.log(
      `ok   data/framing-review.json: ${events.length - cov.missing - cov.stale} of ${events.length} events have a current review (${cov.missing} missing, ${cov.stale} stale, ${cov.orphans} orphaned)`
    );
  }
}
process.exit(failed ? 1 : 0);
