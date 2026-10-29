// Tests for check-dist.mjs, the last gate before a deploy: a small, complete
// dist/ fixture passes, and each kind of broken build is reported.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDist, scriptHash } from "./check-dist.mjs";
import { NO_JS_STYLESHEET, preloadTag } from "./event-page.mjs";
import { topology } from "topojson-server";
import { fullBucket } from "../src/lib/fullBucket.js";
import { encodeGeo } from "../src/lib/geoCodec.js";

const SCRIPT = fileURLToPath(new URL("./check-dist.mjs", import.meta.url));
const VERSION = "abcdef012345";
const DIR = `v.${VERSION}`;
const BUCKETS = 2;
const IDS = ["suez-crisis", "six-day-war", "oslo-i-accord"];
const ENTRY = "/assets/index-AbCd_-12.js";
const SEARCH_DIR = "v.0123456789ab";
const BVERSION = "fedcba987654";
const BDIR = `v.${BVERSION}`;
const VERSION_JS = `export const DATA_VERSION = "${VERSION}";\nexport const FULL_BUCKETS = ${BUCKETS};\nexport const BOUNDARIES_VERSION = "${BVERSION}";\n`;
// A geometry file (.tbin) holding `doc`.
const tbin = (doc) => encodeGeo(doc, { topology });
const fc = (features = [], extra = {}) => ({ type: "FeatureCollection", ...extra, features });
const polygon = { type: "Polygon", coordinates: [[[35, 31], [36, 31], [36, 32], [35, 31]]] };

// dist/_headers as expand-headers.mjs leaves it: the splat revalidates, each file is immutable.
const INLINE = 'document.documentElement.classList.add("js")';
const CSP = (extra = "") => `Content-Security-Policy: default-src 'self'; script-src 'self' ${scriptHash(INLINE)}${extra}`;
const HEADERS = (entryRule = ENTRY, csp = CSP()) =>
  [
    "/*",
    `  ${csp}`,
    "",
    "/assets/*",
    "  Cache-Control: public, max-age=0, must-revalidate",
    "",
    entryRule,
    "  ! Cache-Control",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    `/data/events/${DIR}/*`,
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    `/data/boundaries/${BDIR}/*`,
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n");

const ICONS = `<link rel="icon" href="/favicon.ico"><link rel="icon" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">`;
const shell = (extra = "") =>
  `<!doctype html><html><head><script>${INLINE}</script>${ICONS}<script type="module" src="${ENTRY}"></script>${extra}</head><body></body></html>`;
const bucketOf = (id) => `/data/events/${DIR}/full/${fullBucket(id, BUCKETS)}.json`;
const eventPage = (id) =>
  shell(
    NO_JS_STYLESHEET +
      preloadTag(bucketOf(id)) +
      `<link rel="canonical" href="https://middleeast.events/event/${encodeURIComponent(id)}">`
  );

// A PNG's signature and IHDR chunk header for a width x height image (all check-dist reads).
const png = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
// An ICO holding one image (`image`).
const ico = (image = png(32, 32)) => {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  head.writeUInt32LE(image.length, 6 + 8);
  head.writeUInt32LE(22, 6 + 12);
  return Buffer.concat([head, image]);
};

// A minimal build that passes every check. Returns the paths and a writer for
// the tests to break it with.
let counter = 0;
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-dist-test-"));
  const dist = path.join(root, "dist");
  // A fresh name per fixture: checkDist import()s it, and imports are cached by URL.
  const versionFile = path.join(root, `dataVersion-${counter++}.js`);
  const write = (rel, content) => {
    const file = path.join(dist, ...rel.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === "string" || content instanceof Uint8Array ? content : JSON.stringify(content));
  };
  fs.writeFileSync(versionFile, VERSION_JS);
  write(`data/events/${DIR}/all.json`, IDS.map((id) => ({ id })));
  const buckets = Array.from({ length: BUCKETS }, () => ({}));
  for (const id of IDS) buckets[fullBucket(id, BUCKETS)][id] = { extract: "" };
  buckets.forEach((b, i) => write(`data/events/${DIR}/full/${i}.json`, b));
  write("data/events/meta.json", { version: VERSION, dir: DIR, fullBuckets: BUCKETS, totalEvents: IDS.length });
  write(ENTRY.slice(1), `const DATA_VERSION="${VERSION}";const BOUNDARIES_VERSION="${BVERSION}";const SEARCH_DIR="${SEARCH_DIR}";`);
  write("data/boundaries/meta.json", { decades: [1950], version: BVERSION, dir: BDIR });
  write(`data/boundaries/${BDIR}/1950.tbin`, tbin(fc([{ type: "Feature", properties: {}, geometry: null, geometry_ref: "aaaaaaaaaaaa#1" }, { type: "Feature", properties: {}, geometry: polygon }])));
  write("data/boundaries/shared/aaaaaaaaaaaa.tbin", tbin(fc([0, 1].map(() => ({ type: "Feature", properties: {}, geometry: polygon })))));
  write("data/land.tbin", tbin(fc([], { cells: ["n30e030"] })));
  write("data/land-far.tbin", tbin(fc()));
  write("data/land-cells/n30e030.tbin", tbin(fc()));
  write("index.html", shell());
  for (const id of IDS) write(`event/${id}.html`, eventPage(id));
  write("pagefind/meta.json", { version: SEARCH_DIR.slice(2), dir: SEARCH_DIR });
  for (const file of ["pagefind.js", "pagefind-entry.json", "ids.json", "words.json"]) write(`pagefind/${SEARCH_DIR}/${file}`, "{}");
  write("favicon.svg", "<svg/>");
  write("favicon.ico", new Uint8Array(ico()));
  write("apple-touch-icon.png", new Uint8Array(png(180, 180)));
  write("404.html", "");
  write("_headers", HEADERS());
  const remove = (rel) => fs.rmSync(path.join(dist, ...rel.split("/")), { recursive: true, force: true });
  return { root, dist, versionFile, write, remove, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

// Runs checkDist on a fixture after `breakIt` and returns its problems.
async function problemsAfter(breakIt, opts = {}) {
  const f = fixture();
  try {
    breakIt(f);
    const { problems } = await checkDist({ dist: f.dist, versionFile: f.versionFile, maxFiles: 20000, ...opts });
    return problems;
  } finally {
    f.cleanup();
  }
}
async function assertProblem(breakIt, pattern, opts) {
  const problems = await problemsAfter(breakIt, opts);
  assert.ok(problems.some((p) => pattern.test(p)), `expected a problem matching ${pattern}, got ${JSON.stringify(problems)}`);
}

test("a complete build has no problems and a summary", async () => {
  const f = fixture();
  try {
    const r = await checkDist({ dist: f.dist, versionFile: f.versionFile, maxFiles: 20000 });
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.warnings, []);
    assert.match(r.summary, new RegExp(`^${DIR.replace(".", "\\.")}, 3 events, 2 full-record buckets, .*3 event pages`));
  } finally {
    f.cleanup();
  }
});

test("a missing dist/ is reported, not thrown", async () => {
  const r = await checkDist({ dist: path.join(os.tmpdir(), "check-dist-test-does-not-exist"), versionFile: "x" });
  assert.equal(r.missing, true);
  assert.match(r.problems[0], /does not exist; run npm run build first/);
});

test("data version: missing dataVersion.js, a malformed version or bucket count", async () => {
  await assertProblem((f) => fs.rmSync(f.versionFile), /dataVersion\.js is missing/);
  await assertProblem((f) => fs.writeFileSync(f.versionFile, `export const DATA_VERSION = "XYZ";\nexport const FULL_BUCKETS = ${BUCKETS};\n`), /DATA_VERSION "XYZ" is not 12 hex characters/);
  await assertProblem((f) => fs.writeFileSync(f.versionFile, `export const DATA_VERSION = "${VERSION}";\nexport const FULL_BUCKETS = 0.5;\n`), /FULL_BUCKETS 0\.5 is not a positive integer/);
});

test("versioned folder: missing, stale folders beside it, or a bundle built for another version", async () => {
  await assertProblem((f) => f.remove(`data/events/${DIR}/all.json`), /all\.json \(named by dataVersion\.js\) is missing/);
  await assertProblem((f) => f.write("data/events/v.000000000000/all.json", []), /other or old-layout event files in dist\/data\/events: v\.000000000000/);
  await assertProblem((f) => f.write("data/events/all.0123.json", []), /old-layout event files.*all\.0123\.json/);
  await assertProblem((f) => f.write(ENTRY.slice(1), "no version here"), /no dist\/assets\/\*\.js contains DATA_VERSION/);
});

test("meta.json disagreeing with dataVersion.js", async () => {
  const meta = (patch) => (f) => f.write("data/events/meta.json", { version: VERSION, dir: DIR, fullBuckets: BUCKETS, totalEvents: IDS.length, ...patch });
  await assertProblem(meta({ version: "111111111111" }), /meta\.json version 111111111111 != DATA_VERSION/);
  await assertProblem(meta({ dir: "v.x" }), /meta\.json dir v\.x != v\./);
  await assertProblem(meta({ fullBuckets: 4 }), /meta\.json fullBuckets 4 != FULL_BUCKETS 2/);
  await assertProblem(meta({ totalEvents: 99 }), /has 3 events, meta\.json totalEvents is 99/);
});

test("full records: a missing bucket, duplicate ids, a record outside its bucket", async () => {
  await assertProblem((f) => f.remove(`data/events/${DIR}/full/1.json`), /full\/1\.json is missing \(meta\.json fullBuckets 2\)/);
  await assertProblem((f) => {
    f.write(`data/events/${DIR}/all.json`, [...IDS, IDS[0]].map((id) => ({ id })));
    f.write("data/events/meta.json", { version: VERSION, dir: DIR, fullBuckets: BUCKETS, totalEvents: IDS.length + 1 });
  }, /all\.json has duplicate ids/);
  await assertProblem((f) => {
    // Every record in one file: the ids that hash to the other bucket are "missing".
    const all = Object.fromEntries(IDS.map((id) => [id, {}]));
    f.write(`data/events/${DIR}/full/0.json`, all);
    f.write(`data/events/${DIR}/full/1.json`, all);
  }, /events have no full record in their bucket|full records for 3 events/);
  await assertProblem((f) => f.write(`data/events/${DIR}/all.json`, { not: "an array" }), /all\.json is not an array/);
});

test("boundaries and land: a missing or undecodable geometry file, shared geometry, land file or land cell", async () => {
  await assertProblem((f) => f.remove("data/boundaries/shared/aaaaaaaaaaaa.tbin"), /1950\.tbin points to missing shared geometry aaaaaaaaaaaa#1/);
  await assertProblem((f) => f.write("data/boundaries/shared/aaaaaaaaaaaa.tbin", tbin(fc([{ type: "Feature", properties: {}, geometry: polygon }]))), /aaaaaaaaaaaa\.tbin has no geometry 1/);
  await assertProblem((f) => f.remove(`data/boundaries/${BDIR}/1950.tbin`), /data\/boundaries\/v\.fedcba987654\/1950\.tbin is missing/);
  await assertProblem((f) => f.write(`data/boundaries/${BDIR}/1950.tbin`, fc()), /1950\.tbin does not decode: geoCodec: not a \.tbin file/);
  await assertProblem((f) => f.remove("data/land-far.tbin"), /data\/land-far\.tbin is missing/);
  await assertProblem((f) => f.write("data/land-far.tbin", tbin(polygon)), /land-far\.tbin is not a FeatureCollection/);
  await assertProblem((f) => f.remove("data/land-cells/n30e030.tbin"), /land-cells\/n30e030\.tbin is missing/);
  await assertProblem((f) => f.write("data/land-cells/n30e030.tbin", tbin(fc()).slice(0, 9)), /n30e030\.tbin does not decode/);
  await assertProblem((f) => f.write("data/land.tbin", tbin(fc([], { cells: [] }))), /lists no land cells/);
  // A cell left out of the list (its light piece is exact) ships no file either.
  await assertProblem((f) => f.write("data/land-cells/n30e035.tbin", tbin(fc())), /land-cells\/ has 1 files land\.tbin does not list \(n30e035\.tbin\)/);
});

test("index.html: no entry script, or a reference to a file not in dist/", async () => {
  await assertProblem((f) => f.write("index.html", "<html></html>"), /references no \/assets\/index-\*\.js entry script/);
  await assertProblem((f) => f.write("index.html", shell(`<link rel="icon" href="/missing.svg">`)), /references \/missing\.svg, which is not in dist\//);
});

test("event pages: missing, other assets, no no-JS stylesheet, no canonical, a leftover region marker", async () => {
  const id = IDS[1];
  await assertProblem((f) => f.remove(`event/${id}.html`), new RegExp(`event/${id}\\.html is missing`));
  await assertProblem((f) => f.write(`event/${id}.html`, eventPage(id).replace(ENTRY, "/assets/index-ZZZZZZZZ.js")), /does not load the same \/assets\/ files as index\.html/);
  await assertProblem((f) => f.write(`event/${id}.html`, eventPage(id).replace(NO_JS_STYLESHEET, `<link rel="stylesheet" href="/event/event.css">`)), /lacks its no-JavaScript stylesheet/);
  await assertProblem((f) => f.write(`event/${id}.html`, eventPage(id).replace(preloadTag(bucketOf(id)), "")), /does not preload its full-record bucket/);
  await assertProblem((f) => f.write(`event/${id}.html`, eventPage(id) + preloadTag("/data/nope.json")), /preloads \/data\/nope\.json, which is not in dist\//);
  await assertProblem((f) => f.write(`event/${id}.html`, eventPage(id).replace("https://middleeast.events/event/", "https://example.org/")), /does not name itself as canonical/);
  await assertProblem((f) => f.write(`event/${id}.html`, eventPage(id) + "<!-- page-body -->"), /still has an index\.html region marker/);
});

test("an inline script whose hash the CSP does not list, or no CSP at all", async () => {
  await assertProblem((f) => f.write("index.html", shell("<script>alert(1)</script>")), /index\.html has an inline script whose hash 'sha256-.*' is not in the CSP's script-src/);
  await assertProblem((f) => f.write("404.html", "<script>x()</script>"), /404\.html has an inline script/);
  await assertProblem((f) => f.write("_headers", HEADERS(ENTRY, "Content-Security-Policy: script-src 'self'")), /index\.html has an inline script whose hash/);
  await assertProblem((f) => f.write("_headers", HEADERS(ENTRY, "X-Other: 1")), /the \/\* rule has no Content-Security-Policy/);
  // Data blocks (JSON-LD) and external scripts are not inline scripts.
  assert.deepEqual(await problemsAfter((f) => f.write("404.html", '<script type="application/ld+json">{}</script><script src="/a.js"></script>')), []);
});

test("icons: missing, not an ICO, a touch icon of the wrong size, or not linked", async () => {
  await assertProblem((f) => f.remove("favicon.ico"), /favicon\.ico is missing/);
  await assertProblem((f) => f.write("favicon.ico", "<svg/>"), /favicon\.ico is not an ICO file/);
  await assertProblem((f) => f.write("favicon.ico", new Uint8Array(ico().subarray(0, 30))), /favicon\.ico image 0 lies outside the file/);
  await assertProblem((f) => f.write("apple-touch-icon.png", new Uint8Array(png(192, 192))), /apple-touch-icon\.png is 192x192, not 180x180/);
  await assertProblem((f) => f.write("apple-touch-icon.png", "GIF89a"), /apple-touch-icon\.png is not a PNG/);
  await assertProblem((f) => f.remove("apple-touch-icon.png"), /apple-touch-icon\.png is missing/);
  await assertProblem((f) => f.write("index.html", shell().replace('<link rel="apple-touch-icon" href="/apple-touch-icon.png">', "")), /does not link \/apple-touch-icon\.png/);
});

test("_redirects: a redirect from a live event or to a missing one", async () => {
  assert.deepEqual(await problemsAfter((f) => f.write("_redirects", `/event/old-name /event/${IDS[0]} 301\n`)), []);
  await assertProblem((f) => f.write("_redirects", `/event/${IDS[1]} /event/${IDS[0]} 301\n`), /_redirects: redirect from six-day-war: it is still an event/);
  await assertProblem((f) => f.write("_redirects", "/event/old-name /event/gone 301\n"), /_redirects: redirect old-name -> gone: gone is not an event/);
});

test("Pagefind: one versioned search folder, named by meta.json and by the bundle", async () => {
  await assertProblem((f) => f.remove(`pagefind/${SEARCH_DIR}/ids.json`), /pagefind\/v\.0123456789ab\/ids\.json is missing/);
  await assertProblem((f) => f.remove(`pagefind/${SEARCH_DIR}/words.json`), /pagefind\/v\.0123456789ab\/words\.json is missing/);
  await assertProblem((f) => f.write("pagefind/v.ffffffffffff/pagefind.js", ""), /other files in dist\/pagefind besides meta\.json and v\.0123456789ab: v\.ffffffffffff/);
  await assertProblem((f) => f.write("pagefind/meta.json", { dir: "index" }), /pagefind\/meta\.json dir "index" is not/);
  await assertProblem((f) => f.write(ENTRY.slice(1), `const DATA_VERSION="${VERSION}";`), /no dist\/assets\/\*\.js names the search folder v\.0123456789ab/);
});

test("search index and 404 page missing", async () => {
  await assertProblem((f) => f.remove("pagefind"), /pagefind\/meta\.json is missing/);
  await assertProblem((f) => f.remove("404.html"), /404\.html is missing/);
});

test("an unhashed file under assets/ (it would be cached as immutable)", async () => {
  await assertProblem((f) => f.write("assets/maplibre-gl-worker.js", ""), /no content hash.*maplibre-gl-worker\.js/);
  await assertProblem((f) => f.write("assets/fonts/inter-latin-AbCdEf12.woff2", ""), /no content hash.*fonts\/inter-latin-AbCdEf12\.woff2/);
});

test("_headers: missing, not expanded, an immutable splat, no rule for the entry script, too many rules", async () => {
  await assertProblem((f) => f.remove("_headers"), /_headers is missing/);
  await assertProblem((f) => f.write("_headers", "#! immutable-per-file\n" + HEADERS()), /still has "#! immutable-per-file" lines/);
  await assertProblem(
    (f) => f.write("_headers", "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n" + HEADERS()),
    /the splat rule \/assets\/\* is immutable/
  );
  await assertProblem((f) => f.write("_headers", HEADERS("/assets/other-ZZZZZZZZ.js")), /no immutable rule for the entry script \/assets\/index-/);
  const many = Array.from({ length: 100 }, (_, i) => `/p${i}\n  X: 1\n`).join("");
  await assertProblem((f) => f.write("_headers", HEADERS() + many), /_headers has 105 rules; the host reads only the first 100/);
});

test("boundaries folder: the bundle, meta.json and dist/ must agree on boundaries/v.<BOUNDARIES_VERSION>/", async () => {
  await assertProblem(
    (f) => fs.writeFileSync(f.versionFile, `export const DATA_VERSION = "${VERSION}";\nexport const FULL_BUCKETS = ${BUCKETS};\n`),
    /BOUNDARIES_VERSION null is not 12 hex characters/
  );
  await assertProblem((f) => f.write("data/boundaries/meta.json", { decades: [1950], version: "111111111111", dir: BDIR }), /boundaries\/meta\.json version 111111111111 != BOUNDARIES_VERSION/);
  await assertProblem((f) => f.write("data/boundaries/meta.json", { decades: [1950], version: BVERSION, dir: "v.x" }), /boundaries\/meta\.json dir v\.x != v\.fedcba987654/);
  await assertProblem((f) => f.write("data/boundaries/v.000000000000/1950.tbin", tbin(fc())), /other or old-layout boundary files in dist\/data\/boundaries: v\.000000000000/);
  await assertProblem((f) => f.write("data/boundaries/1950.tbin", tbin(fc())), /old-layout boundary files.*1950\.tbin/);
  await assertProblem((f) => f.write(ENTRY.slice(1), `const DATA_VERSION="${VERSION}";const SEARCH_DIR="${SEARCH_DIR}";`), /no dist\/assets\/\*\.js contains BOUNDARIES_VERSION/);
  // The build's own folder may be immutable; any other boundaries splat may not.
  assert.deepEqual(await problemsAfter(() => {}), []);
  await assertProblem(
    (f) => f.write("_headers", HEADERS() + "\n/data/boundaries/v.000000000000/*\n  Cache-Control: public, max-age=31536000, immutable\n"),
    /the splat rule \/data\/boundaries\/v\.000000000000\/\* is immutable/
  );
});

test("file count: a problem at the host's limit, a warning from 75% of it", async () => {
  await assertProblem(() => {}, /dist\/ has \d+ files; the host allows 10 per deploy/, { maxFiles: 10 });
  const f = fixture();
  try {
    const files = fs.readdirSync(f.dist, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;
    const r = await checkDist({ dist: f.dist, versionFile: f.versionFile, maxFiles: files + 1 });
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.warnings, [`${files} files, ${Math.round((100 * files) / (files + 1))}% of the ${files + 1}-file limit`]);
  } finally {
    f.cleanup();
  }
});

test("a dist/ without events/meta.json throws (every build has one)", async () => {
  const f = fixture();
  try {
    f.remove("data/events/meta.json");
    await assert.rejects(checkDist({ dist: f.dist, versionFile: f.versionFile }), /ENOENT/);
  } finally {
    f.cleanup();
  }
});

test("CLI: exits 1 with the problems listed, or on a missing DIST_DIR", () => {
  const missing = spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, DIST_DIR: path.join(os.tmpdir(), "check-dist-test-nope") }, encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^check-dist: .*check-dist-test-nope does not exist; run npm run build first/);
  // The CLI always checks against the real src/lib/dataVersion.js, which a fixture
  // never matches (missing before a build, another version after one).
  const f = fixture();
  try {
    const r = spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, DIST_DIR: f.dist, MAX_DIST_FILES: "" }, encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^check-dist: \d+ problem\(s\) in .*dist\n {2}- /);
  } finally {
    f.cleanup();
  }
});
