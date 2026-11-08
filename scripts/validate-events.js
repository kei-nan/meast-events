// Validates data/events.json (curated) and, if present, data/events.proposed.json.
// Exits non-zero on any violation so CI fails. Structural checks only - see lib/validate.js.
//   node scripts/validate-events.js [file ...] [--write-warnings-baseline] [--warnings-report=<file.md>]
// Warnings are compared with data/validation-warnings-baseline.json (lib/warnings-baseline.js): a warning not in it is
// listed as NEW and fails the run; a baseline entry that no longer occurs is listed as GONE (not a failure).
//   --write-warnings-baseline  rewrite the baseline from this run (for the files it validated); new warnings then
//                              do not fail. Errors still do, and then nothing is written.
//   --warnings-report=<path>   also write the new/gone warnings as Markdown (the monthly refresh's PR lists it).
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEventsDetailed, checkFramingCoverage, checkDataNotes, PIN_OUTSIDE_COUNTRIES } from "./lib/validate.js";
import { BASELINE_PATH, baselineKey, compareWithBaseline, formatBaseline, parseBaseline, warningsReport } from "./lib/warnings-baseline.js";

const root = new URL("../", import.meta.url);
const rootDir = fileURLToPath(root);
// Both files are validated strictly (since 2026-11-03 the curated file passes without the "lenient" mode, which turned a
// missing wikidata_qid or null coordinates with a location_quality other than "none" into warnings). `curated` only
// decides the cross-file parts: the framing-review coverage (curated) and the curated ids hints may point at (proposed).
const defaults = [
  { path: "data/events.json", curated: true, required: true },
  { path: "data/events.proposed.json", curated: false, required: false },
];
const args = process.argv.slice(2);
const writeBaseline = args.includes("--write-warnings-baseline");
const reportPath = args.find((a) => a.startsWith("--warnings-report="))?.slice("--warnings-report=".length);
const unknownFlags = args.filter((a) => a.startsWith("--") && a !== "--write-warnings-baseline" && !a.startsWith("--warnings-report="));
if (unknownFlags.length || reportPath === "") {
  console.error(`unknown or empty option ${unknownFlags.join(" ") || "--warnings-report="}`);
  process.exit(2);
}
const cliFiles = args.filter((a) => !a.startsWith("--"));
const targets = cliFiles.length
  ? cliFiles.map((p) => ({ path: p, curated: !/proposed/.test(p), required: true }))
  : defaults;
// The baseline names files from the repo root ("data/events.json"), however the file was given ("../data/events.json").
const repoPath = (p) => relative(rootDir, cliFiles.length ? resolve(p) : resolve(rootDir, p)).replace(/\\/g, "/");

// Pin-in-country check (warnings): needs data/boundaries.json and @turf/turf, a repo-root
// devDependency. Without `npm ci` at the root the check is skipped, not failed.
const turf = await import("@turf/turf").catch(() => null);
const boundariesUrl = new URL("data/boundaries.json", root);
const boundaries = turf && existsSync(boundariesUrl) ? JSON.parse(await readFile(boundariesUrl, "utf-8")) : null;
if (!boundaries) {
  console.log(`skip pin-in-country check (${turf ? "data/boundaries.json missing" : "@turf/turf not installed: run npm ci at the repo root"})`);
}

let failed = false;
// This run's warnings for the baseline: [file, id, code] entries, and their lines by entry.
const entries = [];
const messages = new Map();
const validatedFiles = [];
const record = (file, id, code, text) => {
  const entry = [file, id ?? "", code];
  entries.push(entry);
  const k = baselineKey(entry);
  if (!messages.has(k)) messages.set(k, []);
  messages.get(k).push(text);
};

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
  const file = repoPath(t.path);
  validatedFiles.push(file);
  // The proposed file's possible_duplicates hints may point at curated events.
  const curatedUrl = new URL("data/events.json", root);
  const otherIds =
    !t.curated && existsSync(curatedUrl)
      ? new Set(JSON.parse(await readFile(curatedUrl, "utf-8")).map((e) => e?.id))
      : new Set();
  const result = validateEventsDetailed(events, { name: t.path, otherIds, boundaries, turf });
  const errors = result.errors.map((x) => x.text);
  for (const w of result.warnings) {
    console.warn(`warn ${w.text}`);
    record(file, w.id, w.code, w.text);
  }
  if (errors.length) {
    failed = true;
    console.error(`FAIL ${t.path}: ${errors.length} violation(s)`);
    for (const e of errors.slice(0, 50)) console.error(`  ${e}`);
    if (errors.length > 50) console.error(`  ... and ${errors.length - 50} more`);
  } else {
    console.log(`ok   ${t.path}: ${events.length} events valid (${result.warnings.length} warning(s))`);
  }
  // The curated file must have a current framing review per event (warnings only: a refreshed
  // summary stays "stale" until it is re-reviewed).
  if (t.curated && /(^|[\\/])events\.json$/.test(t.path) && Array.isArray(events)) {
    const reviewFile = "data/framing-review.json";
    validatedFiles.push(reviewFile);
    const reviewUrl = new URL(reviewFile, root);
    if (!existsSync(reviewUrl)) {
      console.warn("warn data/framing-review.json missing: no framing reviews");
      record(reviewFile, null, "framing_review_file_missing", "data/framing-review.json missing: no framing reviews");
      continue;
    }
    const review = JSON.parse(await readFile(reviewUrl, "utf-8"));
    const cov = checkFramingCoverage(events, review, { name: reviewFile });
    const notes = checkDataNotes(events, review, { name: reviewFile });
    for (const w of [...cov.items, ...notes.items]) {
      console.warn(`warn ${w.text}`);
      record(reviewFile, w.id, w.code, w.text);
    }
    console.log(
      `ok   data/framing-review.json: ${events.length - cov.missing - cov.stale} of ${events.length} events have a current review (${cov.missing} missing, ${cov.stale} stale, ${cov.orphans} orphaned)`
    );
  }
}

// ---- The warnings baseline ----
const baselineUrl = new URL(BASELINE_PATH, root);
let baseline = [];
if (existsSync(baselineUrl)) {
  try {
    baseline = parseBaseline(JSON.parse(await readFile(baselineUrl, "utf-8")));
  } catch (e) {
    console.error(`FAIL ${BASELINE_PATH}: ${e.message}`);
    process.exit(1);
  }
} else if (!writeBaseline) {
  console.error(`FAIL ${BASELINE_PATH} missing: create it with node scripts/validate-events.js --write-warnings-baseline`);
  failed = true;
}
// The pin check's warnings are not "gone" when it did not run.
const skippedCodes = boundaries ? [] : [PIN_OUTSIDE_COUNTRIES];
const { fresh, gone, next } = compareWithBaseline(entries, baseline, { files: validatedFiles, skippedCodes });
const show = (e) => `${e[0]} ${e[1] || "(file)"} ${e[2]}`;
if (gone.length) {
  console.log(`gone ${gone.length} baseline warning(s) no longer occur${writeBaseline ? " (removed from the baseline)" : "; prune them with --write-warnings-baseline"}:`);
  for (const e of gone) console.log(`  ${show(e)}`);
}
if (fresh.length) {
  const out = writeBaseline ? console.log : console.error;
  const how = writeBaseline ? "written into the baseline" : `not in ${BASELINE_PATH}; check them, then run node scripts/validate-events.js --write-warnings-baseline`;
  out(`${writeBaseline ? "new " : "FAIL"} ${fresh.length} new warning(s) (${how}):`);
  for (const e of fresh) for (const m of messages.get(baselineKey(e))) out(`  NEW ${m}`);
  if (!writeBaseline) failed = true;
} else {
  console.log(`ok   ${BASELINE_PATH}: no new warning (${new Set(entries.map(baselineKey)).size} known)`);
}
let written = false;
if (writeBaseline) {
  if (!boundaries) {
    // Without the pin check its warnings would drop out of the baseline.
    console.error(`FAIL --write-warnings-baseline needs the pin-in-country check (npm ci at the repo root); ${BASELINE_PATH} not written`);
    failed = true;
  } else if (failed) {
    console.error(`${BASELINE_PATH} not written: fix the errors above first`);
  } else {
    await writeFile(baselineUrl, formatBaseline(next));
    written = true;
    console.log(`Wrote ${BASELINE_PATH} (${next.length} entries)`);
  }
}
if (reportPath) await writeFile(reportPath, warningsReport({ fresh, gone, messages, written }));
process.exit(failed ? 1 : 0);
