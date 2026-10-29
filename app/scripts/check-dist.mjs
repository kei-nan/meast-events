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
//     decade's boundaries (in the versioned folder boundaries/v.<BOUNDARIES_VERSION>/,
//     which boundaries/meta.json and the built JavaScript name too, and no other)
//     and the shared geometries they name, the land and its cells;
//   - every local script/stylesheet/icon/preload index.html references exists in dist/;
//   - every event has its page, and each is the app: the same /assets/ as index.html;
//   - the search index (Pagefind) was built into the versioned folder
//     pagefind/meta.json names (scripts/build-search-index.mjs), there is no other,
//     and the built JavaScript names that folder;
//   - 404.html exists (wrangler.jsonc not_found_handling "404-page" serves it);
//   - every file under dist/assets/ is content-hashed (Vite's name-<8 char hash>):
//     each gets an immutable rule in _headers, so an unhashed name there would
//     be cached for a year and never updated;
//   - dist/_headers was expanded (scripts/expand-headers.mjs): no splat rule is
//     immutable (it would apply to the 404 for a missing file too), the entry
//     script has its own immutable rule, and there are no more rules than the
//     host reads;
//   - every inline <script> in the HTML (index.html's "js" class script) has its
//     sha256 hash in the CSP's script-src, or the browser would block it;
//   - the icons index.html links are valid: favicon.ico an ICO, apple-touch-icon.png
//     a 180x180 PNG (scripts/make-icons.mjs), each with a caching rule in _headers,
//     and og-image.png a 1200x630 PNG (scripts/make-og-image.mjs);
//   - each event page preloads its own full-record bucket, and that file exists;
//   - dist/_redirects, when there is one, redirects only ids that are no longer
//     events to ids that are (scripts/redirects.mjs);
//   - dist/ has fewer files than the host allows per deploy (MAX_DIST_FILES,
//     default 20,000: Cloudflare Workers static assets on the free plan,
//     https://developers.cloudflare.com/workers/platform/limits/). Every event
//     adds a page, so this is the limit the dataset reaches first.
// Exits 1 with a list of problems, or prints a one-line summary.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { decodeGeo } from "../src/lib/geoCodec.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fullBucket } from "../src/lib/fullBucket.js";
import { IMMUTABLE, MARKER, MAX_RULES, hasMarker, parseRules } from "./expand-headers.mjs";
import { NO_JS_STYLESHEET, preloadTag } from "./event-page.mjs";
import { checkRedirectsText } from "./redirects.mjs";

// Inline scripts (no src, and not a data block such as JSON-LD) in an HTML page.
export function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && !["module", "text/javascript", "application/javascript"].includes(type)) continue;
    out.push(m[2]);
  }
  return out;
}
export const scriptHash = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

// Width and height of a PNG (its IHDR chunk), or null.
function pngSize(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig) || buf.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Problems with an ICO file: its header and that each image lies inside the file.
function icoProblems(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return ["is not an ICO file"];
  const count = buf.readUInt16LE(4);
  if (!count) return ["holds no image"];
  const problems = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + 16 * i;
    if (at + 16 > buf.length) return ["is truncated"];
    const size = buf.readUInt32LE(at + 8);
    const offset = buf.readUInt32LE(at + 12);
    if (!size || offset + size > buf.length) problems.push(`image ${i} lies outside the file`);
  }
  return problems;
}

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
  let BOUNDARIES_VERSION = null;
  if (!existsSync(versionFile)) fail("src/lib/dataVersion.js is missing (split-data.mjs did not run)");
  else ({ DATA_VERSION, FULL_BUCKETS, BOUNDARIES_VERSION = null } = await import(pathToFileURL(versionFile).href));
  if (DATA_VERSION !== null && !/^[0-9a-f]{12}$/.test(DATA_VERSION)) fail(`DATA_VERSION ${JSON.stringify(DATA_VERSION)} is not 12 hex characters`);
  if (existsSync(versionFile) && !/^[0-9a-f]{12}$/.test(BOUNDARIES_VERSION ?? "")) {
    fail(`BOUNDARIES_VERSION ${JSON.stringify(BOUNDARIES_VERSION)} is not 12 hex characters`);
  }
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
  // Boundary chunks, in the one versioned folder boundaries/v.<BOUNDARIES_VERSION>/
  // that the bundle and boundaries/meta.json both name, and every shared geometry a
  // chunk points to ("<file>#<index>").
  const bmeta = readJSON("data/boundaries/meta.json");
  const bdir = `v.${BOUNDARIES_VERSION}`;
  if (BOUNDARIES_VERSION) {
    if (bmeta.version !== BOUNDARIES_VERSION) fail(`boundaries/meta.json version ${bmeta.version} != BOUNDARIES_VERSION ${BOUNDARIES_VERSION}`);
    if (bmeta.dir !== bdir) fail(`boundaries/meta.json dir ${bmeta.dir} != ${bdir}`);
    const stale = readdirSync(distFile("data/boundaries")).filter((f) => /^(v\..+|\d{4}\.tbin)$/.test(f) && f !== bdir);
    if (stale.length) fail(`other or old-layout boundary files in dist/data/boundaries: ${stale.join(", ")}`);
    const assets = existsSync(distFile("assets")) ? readdirSync(distFile("assets")).filter((f) => f.endsWith(".js")) : [];
    if (!assets.some((f) => readFileSync(distFile(`assets/${f}`), "utf8").includes(BOUNDARIES_VERSION))) {
      fail(`no dist/assets/*.js contains BOUNDARIES_VERSION ${BOUNDARIES_VERSION} (the bundle was built against another dataVersion.js)`);
    }
  }
  for (const d of bmeta.decades) {
    for (const f of readGeo(`data/boundaries/${bdir}/${d}.tbin`)?.features ?? []) {
      if (!f.geometry_ref) continue;
      const [file, index = "0"] = f.geometry_ref.split("#");
      const rel = `data/boundaries/shared/${file}.tbin`;
      if (!existsSync(distFile(rel))) fail(`data/boundaries/${bdir}/${d}.tbin points to missing shared geometry ${f.geometry_ref}`);
      else if (!readGeo(rel)?.features?.[Number(index)]?.geometry) fail(`${rel} has no geometry ${index} (named by ${d}.tbin)`);
    }
  }

  // Land: the opening view's file and the rest (lib/mapExtent.js NEAR_LAND_EXTENT).
  const land = {};
  for (const name of ["land", "land-far"]) {
    land[name] = readGeo(`data/${name}.tbin`);
    if (land[name] && !Array.isArray(land[name].features)) fail(`data/${name}.tbin is not a FeatureCollection`);
  }
  // ...and the Middle East's 1:10m cells land.tbin lists (lib/landStore.js). A cell
  // whose 1:10m land is exactly its light piece is not listed and has no file
  // (split-data.mjs copyLand): a file nobody lists is one the map never fetches.
  if (land.land) {
    const cells = land.land.cells;
    if (!Array.isArray(cells) || !cells.length) fail("data/land.tbin lists no land cells");
    else {
      for (const c of cells) readGeo(`data/land-cells/${c}.tbin`);
      const listed = new Set(cells.map((c) => `${c}.tbin`));
      const dir = distFile("data/land-cells");
      const extra = existsSync(dir) ? readdirSync(dir).filter((f) => !listed.has(f)) : [];
      if (extra.length) fail(`data/land-cells/ has ${extra.length} files land.tbin does not list (${extra.slice(0, 3).join(", ")})`);
    }
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
  const htmlPages = [["index.html", html]];
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
    if (!page.includes(NO_JS_STYLESHEET)) fail(`${where} lacks its no-JavaScript stylesheet`);
    // Its full record's bucket, preloaded as the app fetches it (lib/dataClient.js).
    const bucket = `/data/events/${meta.dir}/full/${fullBucket(e.id, meta.fullBuckets)}.json`;
    if (!page.includes(preloadTag(bucket))) fail(`${where} does not preload its full-record bucket ${bucket}`);
    for (const m of page.matchAll(/<link rel="preload" href="([^"]+)"/g)) {
      if (!existsSync(distFile(decodeURIComponent(m[1]).replace(/^\//, "")))) fail(`${where} preloads ${m[1]}, which is not in dist/`);
    }
    htmlPages.push([rel, page]);
    if (!page.includes(`<link rel="canonical" href="https://middleeast.events/event/${encodeURIComponent(e.id)}">`)) {
      fail(`${where} does not name itself as canonical`);
    }
    if (/<!-- \/?page-(meta|body) -->/.test(page)) fail(`${where} still has an index.html region marker`);
    eventPages++;
  }

  // 4. Search index.
  let searchDir = null;
  if (!existsSync(distFile("pagefind/meta.json"))) fail("pagefind/meta.json is missing (build-search-index.mjs did not run)");
  else {
    ({ dir: searchDir } = readJSON("pagefind/meta.json"));
    if (!/^v\.[0-9a-f]{12}$/.test(searchDir ?? "")) fail(`pagefind/meta.json dir ${JSON.stringify(searchDir)} is not v.<12 hex>`);
    else {
      for (const f of ["pagefind.js", "pagefind-entry.json", "ids.json"]) {
        if (!existsSync(distFile(`pagefind/${searchDir}/${f}`))) fail(`pagefind/${searchDir}/${f} is missing`);
      }
      const other = readdirSync(distFile("pagefind")).filter((f) => f !== "meta.json" && f !== searchDir);
      if (other.length) fail(`other files in dist/pagefind besides meta.json and ${searchDir}: ${other.join(", ")}`);
      const scripts = readdirSync(distFile("assets")).filter((f) => f.endsWith(".js"));
      if (!scripts.some((f) => readFileSync(distFile(`assets/${f}`), "utf8").includes(searchDir))) {
        fail(`no dist/assets/*.js names the search folder ${searchDir} (built against another pagefind/meta.json)`);
      }
    }
  }

  // 5. The page the host serves for a missing path (wrangler.jsonc not_found_handling
  // "404-page"), written by build-event-pages.mjs.
  if (!existsSync(distFile("404.html"))) fail("404.html is missing (build-event-pages.mjs did not run)");

  // 6. Every asset's URL changes when its content does (each file under /assets/
  // gets an immutable rule, 6b). Vite names emitted files "<name>-<hash>.<ext>"
  // with an 8-character base64url hash (Vite's and Rollup's default asset and chunk
  // names), MapLibre's worker included: it is self-contained since MapLibre 6.13.0,
  // so its name need not be fixed.
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

  // 6b. The cache rules (scripts/expand-headers.mjs). Workers matches a rule
  // against the requested path, so a splat rule's headers also go on the 404 for a
  // missing file under it: an immutable splat would keep that 404 for a year. The
  // exceptions are this build's events and search folders: the hash covers all of
  // each, so a file missing there is missing for good.
  let headerRules = 0;
  if (!existsSync(distFile("_headers"))) fail("_headers is missing (Vite copies it from public/)");
  else {
    const text = readFileSync(distFile("_headers"), "utf8");
    const rules = parseRules(text);
    headerRules = rules.length;
    if (hasMarker(text)) fail(`_headers still has "${MARKER}" lines (expand-headers.mjs did not run)`);
    if (rules.length > MAX_RULES) fail(`_headers has ${rules.length} rules; the host reads only the first ${MAX_RULES}`);
    const immutable = (r) => r.headers.some((h) => /^cache-control:.*\bimmutable\b/i.test(h));
    const splat = (r) =>
      r.pattern.includes("*") &&
      r.pattern !== `/data/events/${dir}/*` &&
      r.pattern !== `/data/boundaries/v.${BOUNDARIES_VERSION}/*` &&
      r.pattern !== `/pagefind/${searchDir}/*`;
    for (const r of rules) if (splat(r) && immutable(r)) fail(`_headers: the splat rule ${r.pattern} is immutable, so a missing file's 404 would be too`);
    const entry = refs.find((u) => /^\/assets\/index-.*\.js$/.test(u));
    if (entry && !rules.some((r) => r.pattern === entry && r.headers.includes(`Cache-Control: ${IMMUTABLE}`))) {
      fail(`_headers has no immutable rule for the entry script ${entry}`);
    }
  }

  // 6c. Inline scripts against the CSP: each must have its hash in script-src of
  // the rule for every path (/*), or the browser blocks it.
  const rules = existsSync(distFile("_headers")) ? parseRules(readFileSync(distFile("_headers"), "utf8")) : [];
  const csp = rules.find((r) => r.pattern === "/*")?.headers.find((h) => /^content-security-policy:/i.test(h)) ?? "";
  const scriptSrc = /(?:^|;)\s*script-src\s+([^;]*)/i.exec(csp.replace(/^content-security-policy:\s*/i, ""))?.[1].split(/\s+/) ?? [];
  if (existsSync(distFile("_headers")) && !csp) fail("_headers: the /* rule has no Content-Security-Policy");
  for (const rel of ["404.html", "event/index.html"]) if (existsSync(distFile(rel))) htmlPages.push([rel, readFileSync(distFile(rel), "utf8")]);
  const unlisted = new Map();
  for (const [rel, page] of htmlPages) {
    for (const script of inlineScripts(page)) {
      const hash = scriptHash(script);
      if (!scriptSrc.includes(hash) && !unlisted.has(hash)) unlisted.set(hash, rel);
    }
  }
  for (const [hash, rel] of unlisted) fail(`${rel} has an inline script whose hash ${hash} is not in the CSP's script-src (public/_headers)`);

  // 6d. Icons (scripts/make-icons.mjs), linked by index.html and every page.
  if (!existsSync(distFile("favicon.ico"))) fail("favicon.ico is missing (scripts/make-icons.mjs)");
  else for (const p of icoProblems(readFileSync(distFile("favicon.ico")))) fail(`favicon.ico ${p}`);
  if (!existsSync(distFile("apple-touch-icon.png"))) fail("apple-touch-icon.png is missing (scripts/make-icons.mjs)");
  else {
    const size = pngSize(readFileSync(distFile("apple-touch-icon.png")));
    if (!size) fail("apple-touch-icon.png is not a PNG");
    else if (size.width !== 180 || size.height !== 180) fail(`apple-touch-icon.png is ${size.width}x${size.height}, not 180x180`);
  }
  // The link-preview image every page names (scripts/make-og-image.mjs), at the size og:image:width/height state.
  const og = existsSync(distFile("og-image.png")) ? pngSize(readFileSync(distFile("og-image.png"))) : null;
  if (!og) fail("og-image.png is missing or not a PNG (scripts/make-og-image.mjs)");
  else if (og.width !== 1200 || og.height !== 630) fail(`og-image.png is ${og.width}x${og.height}, not 1200x630`);
  for (const icon of ["/favicon.ico", "/favicon.svg", "/apple-touch-icon.png"]) {
    if (!html.includes(`href="${icon}"`)) fail(`index.html does not link ${icon}`);
    // Cached (public/_headers): with the default, Chromium asks again on every history.replaceState.
    const cache = rules.find((r) => r.pattern === icon)?.headers.find((h) => /^cache-control:/i.test(h));
    if (!cache || !/max-age=[1-9]/.test(cache)) fail(`_headers has no caching rule for ${icon}`);
  }

  // 6e. Redirects for renamed ids (scripts/redirects.mjs).
  let redirectCount = 0;
  if (existsSync(distFile("_redirects"))) {
    const text = readFileSync(distFile("_redirects"), "utf8");
    redirectCount = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).length;
    for (const p of checkRedirectsText(text, new Set(Array.isArray(all) ? all.map((e) => e.id) : []))) fail(p);
  }

  // 7. File count against the host's per-deploy limit. _headers and _redirects are
  // configuration, not assets, but counting them keeps the margin honest.
  const countFiles = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? countFiles(path.join(d, e.name)) : 1), 0);
  const fileCount = countFiles(dist);
  if (fileCount >= maxFiles) fail(`dist/ has ${fileCount} files; the host allows ${maxFiles} per deploy (see docs/SCALING.md)`);
  else if (fileCount >= maxFiles * 0.75) warnings.push(`${fileCount} files, ${Math.round((100 * fileCount) / maxFiles)}% of the ${maxFiles}-file limit`);

  const summary =
    `${dir}, ${meta.totalEvents} events, ${meta.fullBuckets} full-record buckets, ` +
    `${refs.length} index.html references, ${eventPages} event pages, search index present, 404.html, assets/ hashed, ${headerRules} header rules, ` +
    `inline scripts in the CSP, icons, ${redirectCount} redirects, ${fileCount} files (limit ${maxFiles})`;
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
