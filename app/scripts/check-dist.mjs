// Smoke check of a finished build. `npm run build` runs it last (the postbuild
// script in package.json), so a failure here fails the build in CI, in the
// monthly data refresh and on Cloudflare Workers Builds, which then does not
// deploy. It also runs on its own: node scripts/check-dist.mjs. Catches a deploy
// that would load but show nothing, or that the host would refuse:
//   - the versioned folder events/v.<DATA_VERSION>/ the app requests exists, for
//     the DATA_VERSION that split-data.mjs generated (src/lib/dataVersion.js),
//     with the bucket count it names, and the built JavaScript carries both;
//   - events/meta.json agrees with it, the lite list has no duplicate ids, and
//     every event's full record is in the bucket its id hashes to;
//   - every local script/stylesheet/icon/preload index.html references exists in dist/;
//   - the search index (Pagefind) was built;
//   - every file under dist/assets/ is content-hashed (Vite's name-<8 char hash>)
//     or one of the two MapLibre files in the versioned assets/maplibre-gl-<version>/
//     folder: public/_headers marks all of /assets/* immutable, so an unhashed
//     name there would be cached for a year and never updated;
//   - dist/ has fewer files than the host allows per deploy (MAX_DIST_FILES,
//     default 20,000: Cloudflare Workers static assets on the free plan,
//     https://developers.cloudflare.com/workers/platform/limits/). Every event
//     adds a page, so this is the limit the dataset reaches first.
// Exits 1 with a list of problems, or prints a one-line summary.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fullBucket } from "../src/lib/fullBucket.js";

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

// 1. The generated data version and the folder it names.
const versionFile = path.join(__dirname, "..", "src", "lib", "dataVersion.js");
let DATA_VERSION = null;
let FULL_BUCKETS = null;
if (!existsSync(versionFile)) fail("src/lib/dataVersion.js is missing (split-data.mjs did not run)");
else ({ DATA_VERSION, FULL_BUCKETS } = await import(pathToFileURL(versionFile).href));
if (DATA_VERSION !== null && !/^[0-9a-f]{12}$/.test(DATA_VERSION)) fail(`DATA_VERSION ${JSON.stringify(DATA_VERSION)} is not 12 hex characters`);
if (FULL_BUCKETS !== null && !(Number.isInteger(FULL_BUCKETS) && FULL_BUCKETS > 0)) fail(`FULL_BUCKETS ${FULL_BUCKETS} is not a positive integer`);

const dir = `v.${DATA_VERSION}`;
let all = null;
if (DATA_VERSION) {
  if (!existsSync(distFile(`data/events/${dir}/all.json`))) fail(`data/events/${dir}/all.json (named by dataVersion.js) is missing`);
  else all = readJSON(`data/events/${dir}/all.json`);
  const stale = readdirSync(distFile("data/events")).filter((f) => /^(v\..+|all\..+\.json|\d{4}\.json|ids\.json|full)$/.test(f) && f !== dir);
  if (stale.length) fail(`other or old-layout event files in dist/data/events: ${stale.join(", ")}`);
  const assets = readdirSync(distFile("assets")).filter((f) => f.endsWith(".js"));
  if (!assets.some((f) => readFileSync(distFile(`assets/${f}`), "utf8").includes(DATA_VERSION))) {
    fail(`no dist/assets/*.js contains DATA_VERSION ${DATA_VERSION} (the bundle was built against another dataVersion.js)`);
  }
}

// 2. meta.json and the files it implies.
const meta = readJSON("data/events/meta.json");
if (DATA_VERSION && meta.version !== DATA_VERSION) fail(`meta.json version ${meta.version} != DATA_VERSION ${DATA_VERSION}`);
if (DATA_VERSION && meta.dir !== dir) fail(`meta.json dir ${meta.dir} != ${dir}`);
if (FULL_BUCKETS && meta.fullBuckets !== FULL_BUCKETS) fail(`meta.json fullBuckets ${meta.fullBuckets} != FULL_BUCKETS ${FULL_BUCKETS}`);
const buckets = [];
for (let b = 0; b < meta.fullBuckets; b++) {
  const rel = `data/events/${meta.dir}/full/${b}.json`;
  if (!existsSync(distFile(rel))) fail(`${rel} is missing (meta.json fullBuckets ${meta.fullBuckets})`);
  else buckets.push(readJSON(rel));
}
if (all) {
  if (!Array.isArray(all)) fail(`${dir}/all.json is not an array`);
  else {
    if (all.length !== meta.totalEvents) fail(`${dir}/all.json has ${all.length} events, meta.json totalEvents is ${meta.totalEvents}`);
    const allIds = all.map((e) => e.id);
    if (new Set(allIds).size !== allIds.length) fail(`${dir}/all.json has duplicate ids`);
    if (buckets.length === meta.fullBuckets) {
      const missing = allIds.filter((id) => !Object.hasOwn(buckets[fullBucket(id, meta.fullBuckets)], id));
      if (missing.length) fail(`${missing.length} events have no full record in their bucket (first: ${missing[0]})`);
      const records = buckets.reduce((n, b) => n + Object.keys(b).length, 0);
      if (records !== allIds.length) fail(`${records} full records for ${allIds.length} events`);
    }
  }
}

// Boundary chunks: every shared geometry a chunk points to exists.
const bmeta = readJSON("data/boundaries/meta.json");
for (const d of bmeta.decades) {
  for (const f of readJSON(`data/boundaries/${d}.json`).features) {
    if (f.geometry_ref && !existsSync(distFile(`data/boundaries/shared/${f.geometry_ref}.json`))) {
      fail(`data/boundaries/${d}.json points to missing shared geometry ${f.geometry_ref}`);
    }
  }
}

// Land: the opening view's file and the rest (lib/mapExtent.js NEAR_LAND_EXTENT).
for (const name of ["land.json", "land-far.json"]) {
  if (!existsSync(distFile(`data/${name}`))) fail(`data/${name} is missing`);
  else if (!Array.isArray(readJSON(`data/${name}`).features)) fail(`data/${name} is not a FeatureCollection`);
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

// 5. Every asset's URL changes when its content does (public/_headers: /assets/* is
// immutable). Vite names emitted files "<name>-<hash>.<ext>" with an 8-character
// base64url hash (vite.config.js assetFileNames, Rollup's default chunk names). The
// only exception is vite.config.js UNHASHED_ASSET_NAMES, kept by name inside a folder
// named after the MapLibre version.
const HASHED_ASSET = /^[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;
const VERSIONED_ASSET = /^maplibre-gl-\d+\.\d+\.\d+[^/]*\/maplibre-gl-(worker|shared)\.mjs$/;
const listFiles = (d, prefix = "") =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(path.join(d, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]
  );
const unhashed = existsSync(distFile("assets"))
  ? listFiles(distFile("assets")).filter((f) => !HASHED_ASSET.test(f) && !VERSIONED_ASSET.test(f))
  : [];
if (unhashed.length) {
  fail(
    `dist/assets/ has files with no content hash outside the versioned MapLibre folder ` +
      `(they would be cached as immutable): ${unhashed.join(", ")}`
  );
}

// 6. File count against the host's per-deploy limit. _headers and _redirects are
// configuration, not assets, but counting them keeps the margin honest.
const MAX_DIST_FILES = Number(process.env.MAX_DIST_FILES) || 20000;
const countFiles = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? countFiles(path.join(d, e.name)) : 1), 0);
const fileCount = countFiles(DIST);
if (fileCount >= MAX_DIST_FILES) fail(`dist/ has ${fileCount} files; the host allows ${MAX_DIST_FILES} per deploy (see docs/SCALING.md)`);
else if (fileCount >= MAX_DIST_FILES * 0.75) console.warn(`check-dist: warning - ${fileCount} files, ${Math.round((100 * fileCount) / MAX_DIST_FILES)}% of the ${MAX_DIST_FILES}-file limit`);

if (problems.length) {
  console.error(`check-dist: ${problems.length} problem(s) in ${DIST}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `check-dist: OK - ${dir}, ${meta.totalEvents} events, ${meta.fullBuckets} full-record buckets, ` +
    `${refs.length} index.html references, search index present, assets/ hashed, ${fileCount} files (limit ${MAX_DIST_FILES})`
);
