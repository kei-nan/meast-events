// Writes data/missing-coordinates-report.md from data/events.json and data/events.proposed.json (lib/missing-report.js).
// No network. Re-running on unchanged data gives an identical file.
//   node scripts/build-missing-coordinates-report.js           write the report
//   node scripts/build-missing-coordinates-report.js --check   exit 1 if the committed report is not what the data gives (CI)
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { renderMissingReport } from "./lib/missing-report.js";

const url = (n) => new URL(`../data/${n}`, import.meta.url);
const read = async (n) => (existsSync(url(n)) ? JSON.parse(await readFile(url(n), "utf-8")) : []);
const curated = await read("events.json");
const proposed = await read("events.proposed.json");
const { md, curated: nc, proposed: np } = renderMissingReport({ curated, proposed });
const out = url("missing-coordinates-report.md");

if (process.argv.includes("--check")) {
  const current = existsSync(out) ? await readFile(out, "utf-8") : "";
  if (current.replace(/\r\n/g, "\n") !== md) {
    console.error("FAIL data/missing-coordinates-report.md is stale: run node scripts/build-missing-coordinates-report.js and commit the result");
    process.exit(1);
  }
  console.log(`ok   data/missing-coordinates-report.md is current (${nc} curated, ${np} proposed)`);
} else {
  await writeFile(out, md);
  console.log(`Wrote data/missing-coordinates-report.md: ${nc} curated, ${np} proposed not yet curated`);
}
