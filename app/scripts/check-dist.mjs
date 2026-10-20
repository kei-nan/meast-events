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
//   - every geometry file (.tbin) the app is pointed to exists and decodes: each
//     decade's boundaries and the shared geometries they name, the land and its cells;
//   - every local script/stylesheet/icon/preload index.html references exists in dist/;
//   - every event has its page, and each is the app: the same /assets/ as index.html;
//   - the search index (Pagefind) was built;
//   - 404.html exists (wrangler.jsonc not_found_handling "404-page" serves it);
//   - every file under dist/assets/ is content-hashed (Vite's name-<8 char hash>):
//     public/_headers marks all of /assets/* immutable, so an unhashed
//     name there would be cached for a year and never updated;
//   - dist/ has fewer files than the host allows per deploy (MAX_DIST_FILES,
//     default 20,000: Cloudflare Workers static assets on the free plan,
//     https://developers.cloudflare.com/workers/platform/limits/). Every event
//     adds a page, so this is the limit the dataset reaches first.
// Exits 1 with a list of problems, or prints a one-line summary.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { decodeGeo } from "../src/lib/geoCodec.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fullBucket } from "../src/lib/fullBucket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(process.env.DIST_DIR ?? path.join(__dirname, "..", "dist"));
const VERSION_FILE = path.join(__dirname, "..", "src", "lib", "dataVersion.js");
const MAX_DIST_FILES = Number(process.env.MAX_DIST_FILES) || 20000;

// Every check below, on the build in `dist` against the generated `versionFile`
// (exported for scripts/check-dist.test.mjs, which runs it on small fixtures).
// Returns { problems, warnings, summary }: the build is good iff problems is empty.
// A dist/ that lacks a file every build has (events/meta.json, index.html, ...)
// throws instead, as reading it would.
export async function checkDist({ dist = DIST, versionFile = VERSION_FILE, maxFiles = MAX_DIST_FILES } = {}) {
  const problems = [];
  const warnings = [];
  const fail = (msg) => problems.push(msg);
  const distFile = (rel) => path.join(dist, ...rel.split("/"));
  const readJSON = (rel) => JSON.parse(readFileSync(distFile(rel), "utf8"));

  if (!existsSync(dist)) {
    fail(`${dist} does not exist; run npm run build first`);
    return { problems, warnings, summary: null, missing: true };
  }

  // 1. The generated data version and the folder it names.
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

  // Geometry files (.tbin, src/lib/geoCodec.js): the decoded file, or null after
  // reporting it missing or undecodable.
  const readGeo = (rel) => {
    if (!existsSync(distFile(rel))) return fail(`${rel} is missing`), null;
    try {
      return decodeGeo(readFileSync(distFile(rel)));
    } catch (err) {
      return fail(`${rel} does not decode: ${err.message}`), null;
    }
  };
  // Boundary chunks, and every shared geometry a chunk points to ("<file>#<index>").
  const bmeta = readJSON("data/boundaries/meta.json");
  for (const d of bmeta.decades) {
    for (const f of readGeo(`data/boundaries/${d}.tbin`)?.features ?? []) {
      if (!f.geometry_ref) continue;
      const [file, index = "0"] = f.geometry_ref.split("#");
      const rel = `data/boundaries/shared/${file}.tbin`;
      if (!existsSync(distFile(rel))) fail(`data/boundaries/${d}.tbin points to missing shared geometry ${f.geometry_ref}`);
      else if (!readGeo(rel)?.features?.[Number(index)]?.geometry) fail(`${rel} has no geometry ${index} (named by ${d}.tbin)`);
    }
  }

  // Land: the opening view's file and the rest (lib/mapExtent.js NEAR_LAND_EXTENT).
  const land = {};
  for (const name of ["land", "land-far"]) {
    land[name] = readGeo(`data/${name}.tbin`);
    if (land[name] && !Array.isArray(land[name].features)) fail(`data/${name}.tbin is not a FeatureCollection`);
  }
  // ...and the Middle East's 1:10m cells land.tbin lists (lib/landStore.js).
  if (land.land) {
    const cells = land.land.cells;
    if (!Array.isArray(cells) || !cells.length) fail("data/land.tbin lists no land cells");
    else for (const c of cells) readGeo(`data/land-cells/${c}.tbin`);
  }

  // 3. index.html's local references.
  const html = readFileSync(distFile("index.html"), "utf8");
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.startsWith("/") && !u.startsWith("//"));
  if (!refs.some((u) => /^\/assets\/index-.*\.js$/.test(u))) fail("index.html references no /assets/index-*.js entry script");
  for (const u of refs) {
    const rel = decodeURIComponent(u.split(/[?#]/)[0]).replace(/^\//, "");
    if (rel && !existsSync(distFile(rel))) fail(`index.html references ${u}, which is not in dist/`);
  }

  // 3b. Every event's page is the app (scripts/event-page.mjs fillAppShell): it
  // loads exactly the /assets/ files index.html loads, plus the stylesheet for its
  // plain-HTML copy of the event, names itself as canonical, and kept none of
  // index.html's region markers.
  const assetRefs = (page) => [...new Set(page.match(/\/assets\/[^"'\s)]+/g) ?? [])].sort().join(" ");
  const shellAssets = assetRefs(html);
  let eventPages = 0;
  for (const e of Array.isArray(all) ? all : []) {
    const rel = `event/${e.id}.html`;
    if (!existsSync(distFile(rel))) {
      fail(`${rel} is missing (build-event-pages.mjs)`);
      continue;
    }
    const page = readFileSync(distFile(rel), "utf8");
    const where = `${rel} (an event page is index.html filled in, scripts/event-page.mjs)`;
    if (assetRefs(page) !== shellAssets) fail(`${where} does not load the same /assets/ files as index.html`);
    if (!page.includes(`href="/event/event.css" media="(scripting: none)"`)) fail(`${where} lacks its no-JavaScript stylesheet`);
    if (!page.includes(`<link rel="canonical" href="https://middleeast.events/event/${encodeURIComponent(e.id)}">`)) {
      fail(`${where} does not name itself as canonical`);
    }
    if (/<!-- \/?page-(meta|body) -->/.test(page)) fail(`${where} still has an index.html region marker`);
    eventPages++;
  }

  // 4. Search index.
  if (!existsSync(distFile("pagefind/pagefind.js"))) fail("pagefind/pagefind.js is missing (build-search-index.mjs did not run)");

  // 5. The page the host serves for a missing path (wrangler.jsonc not_found_handling
  // "404-page"), written by build-event-pages.mjs.
  if (!existsSync(distFile("404.html"))) fail("404.html is missing (build-event-pages.mjs did not run)");

  // 6. Every asset's URL changes when its content does (public/_headers: /assets/* is
  // immutable). Vite names emitted files "<name>-<hash>.<ext>" with an 8-character
  // base64url hash (Vite's and Rollup's default asset and chunk names), MapLibre's
  // worker included: it is self-contained since MapLibre 6.13.0, so its name need not
  // be fixed.
  const HASHED_ASSET = /^[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;
  const listFiles = (d, prefix = "") =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? listFiles(path.join(d, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]
    );
  const unhashed = existsSync(distFile("assets"))
    ? listFiles(distFile("assets")).filter((f) => !HASHED_ASSET.test(f))
    : [];
  if (unhashed.length) {
    fail(`dist/assets/ has files with no content hash (they would be cached as immutable): ${unhashed.join(", ")}`);
  }

  // 7. File count against the host's per-deploy limit. _headers and _redirects are
  // configuration, not assets, but counting them keeps the margin honest.
  const countFiles = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? countFiles(path.join(d, e.name)) : 1), 0);
  const fileCount = countFiles(dist);
  if (fileCount >= maxFiles) fail(`dist/ has ${fileCount} files; the host allows ${maxFiles} per deploy (see docs/SCALING.md)`);
  else if (fileCount >= maxFiles * 0.75) warnings.push(`${fileCount} files, ${Math.round((100 * fileCount) / maxFiles)}% of the ${maxFiles}-file limit`);

  const summary =
    `${dir}, ${meta.totalEvents} events, ${meta.fullBuckets} full-record buckets, ` +
    `${refs.length} index.html references, ${eventPages} event pages, search index present, 404.html, assets/ hashed, ${fileCount} files (limit ${maxFiles})`;
  return { problems, warnings, summary };
}

// The CLI: node scripts/check-dist.mjs (DIST_DIR and MAX_DIST_FILES override the defaults).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problems, warnings, summary, missing } = await checkDist();
  if (missing) {
    console.error(`check-dist: ${problems[0]}`);
    process.exit(1);
  }
  for (const w of warnings) console.warn(`check-dist: warning - ${w}`);
  if (problems.length) {
    console.error(`check-dist: ${problems.length} problem(s) in ${DIST}`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`check-dist: OK - ${summary}`);
}
