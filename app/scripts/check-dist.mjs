// Smoke check of a finished build (run after `npm run build`, in CI and in the
// monthly data refresh). Catches a deploy that would load but show nothing:
//   - the content-hashed events/all.<DATA_VERSION>.json the app requests exists,
//     for the DATA_VERSION that split-data.mjs generated (src/lib/dataVersion.js),
//     and the built JavaScript carries that same version;
//   - events/meta.json agrees with it, and every decade chunk, full-lead bucket
//     and ids.json entry it implies exists and is consistent;
//   - every local script/stylesheet/icon index.html references exists in dist/;
//   - the search index (Pagefind) was built.
// Exits 1 with a list of problems, or prints a one-line summary.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(process.env.DIST_DIR ?? path.join(__dirname, "..", "dist"));
const problems = [];
const fail = (msg) => problems.push(msg);
const distFile = (rel) => path.join(DIST, ...rel.split("/"));
const readJSON = (rel) => JSON.parse(readFileSync(distFile(rel), "utf8"));

if (!existsSync(DIST)) {
  console.error(`check-dist: ${DIST} does not exist; run npm run build first`);
  process.exit(1);
}

// 1. The generated data version and the file it names.
const versionFile = path.join(__dirname, "..", "src", "lib", "dataVersion.js");
let DATA_VERSION = null;
if (!existsSync(versionFile)) fail("src/lib/dataVersion.js is missing (split-data.mjs did not run)");
else ({ DATA_VERSION } = await import(pathToFileURL(versionFile).href));
if (DATA_VERSION !== null && !/^[0-9a-f]{12}$/.test(DATA_VERSION)) fail(`DATA_VERSION ${JSON.stringify(DATA_VERSION)} is not 12 hex characters`);

const allFile = `all.${DATA_VERSION}.json`;
let all = null;
if (DATA_VERSION) {
  if (!existsSync(distFile(`data/events/${allFile}`))) fail(`data/events/${allFile} (named by dataVersion.js) is missing`);
  else all = readJSON(`data/events/${allFile}`);
  const stale = readdirSync(distFile("data/events")).filter((f) => /^all\..+\.json$/.test(f) && f !== allFile);
  if (stale.length) fail(`other events/all.*.json files in dist: ${stale.join(", ")}`);
  const assets = readdirSync(distFile("assets")).filter((f) => f.endsWith(".js"));
  if (!assets.some((f) => readFileSync(distFile(`assets/${f}`), "utf8").includes(DATA_VERSION))) {
    fail(`no dist/assets/*.js contains DATA_VERSION ${DATA_VERSION} (the bundle was built against another dataVersion.js)`);
  }
}

// 2. meta.json, ids.json and the chunks they name.
const meta = readJSON("data/events/meta.json");
const ids = readJSON("data/events/ids.json");
if (DATA_VERSION && meta.version !== DATA_VERSION) fail(`meta.json version ${meta.version} != DATA_VERSION ${DATA_VERSION}`);
if (DATA_VERSION && meta.allFile !== allFile) fail(`meta.json allFile ${meta.allFile} != ${allFile}`);
if (all) {
  if (!Array.isArray(all)) fail(`${allFile} is not an array`);
  else {
    if (all.length !== meta.totalEvents) fail(`${allFile} has ${all.length} events, meta.json totalEvents is ${meta.totalEvents}`);
    const allIds = all.map((e) => e.id);
    if (new Set(allIds).size !== allIds.length) fail(`${allFile} has duplicate ids`);
    const missing = allIds.filter((id) => !(id in ids));
    if (missing.length) fail(`${missing.length} events in ${allFile} are not in ids.json (first: ${missing[0]})`);
  }
  if (all.length !== Object.keys(ids).length) fail(`ids.json has ${Object.keys(ids).length} ids, ${allFile} has ${all.length} events`);
}
// An event spanning several decades sits in each of their chunks; ids.json names
// the chunk a deep link loads (the first), which must hold it.
const inChunk = new Map(); // decade -> Set(id)
for (const d of meta.decades) {
  const rel = `data/events/${d}.json`;
  if (!existsSync(distFile(rel))) fail(`${rel} (listed in meta.json decades) is missing`);
  else inChunk.set(d, new Set(readJSON(rel).map((e) => e.id)));
}
const notInChunk = Object.entries(ids).filter(([id, d]) => !inChunk.get(d)?.has(id));
if (notInChunk.length) fail(`${notInChunk.length} ids.json entries are not in the decade chunk they name (first: ${notInChunk[0].join(" -> ")})`);
const chunkIds = new Set([...inChunk.values()].flatMap((s) => [...s]));
const unlisted = [...chunkIds].filter((id) => !(id in ids));
if (unlisted.length) fail(`${unlisted.length} events in decade chunks are not in ids.json (first: ${unlisted[0]})`);
for (let b = 0; b < meta.fullBuckets; b++) {
  if (!existsSync(distFile(`data/events/full/${b}.json`))) fail(`data/events/full/${b}.json is missing (meta.json fullBuckets ${meta.fullBuckets})`);
}

// 3. index.html's local references.
const html = readFileSync(distFile("index.html"), "utf8");
const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.startsWith("/") && !u.startsWith("//"));
if (!refs.some((u) => /^\/assets\/index-.*\.js$/.test(u))) fail("index.html references no /assets/index-*.js entry script");
for (const u of refs) {
  const rel = decodeURIComponent(u.split(/[?#]/)[0]).replace(/^\//, "");
  if (rel && !existsSync(distFile(rel))) fail(`index.html references ${u}, which is not in dist/`);
}

// 4. Search index.
if (!existsSync(distFile("pagefind/pagefind.js"))) fail("pagefind/pagefind.js is missing (build-search-index.mjs did not run)");

if (problems.length) {
  console.error(`check-dist: ${problems.length} problem(s) in ${DIST}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `check-dist: OK - ${allFile}, ${meta.totalEvents} events in ${meta.decades.length} decade chunks, ` +
    `${meta.fullBuckets} full-lead buckets, ${refs.length} index.html references, search index present`
);
