// Tests for check-dist.mjs, the last gate before a deploy: a small, complete
// dist/ fixture passes, and each kind of broken build is reported.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDist } from "./check-dist.mjs";
import { fullBucket } from "../src/lib/fullBucket.js";

const SCRIPT = fileURLToPath(new URL("./check-dist.mjs", import.meta.url));
const VERSION = "abcdef012345";
const DIR = `v.${VERSION}`;
const BUCKETS = 2;
const IDS = ["suez-crisis", "six-day-war", "oslo-i-accord"];
const ENTRY = "/assets/index-AbCd_-12.js";

const shell = (extra = "") => `<!doctype html><html><head><script type="module" src="${ENTRY}"></script>${extra}</head><body></body></html>`;
const eventPage = (id) =>
  shell(
    `<link rel="stylesheet" href="/event/event.css" media="(scripting: none)">` +
      `<link rel="canonical" href="https://middleeast.events/event/${encodeURIComponent(id)}">`
  );

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
    fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
  };
  fs.writeFileSync(versionFile, `export const DATA_VERSION = "${VERSION}";\nexport const FULL_BUCKETS = ${BUCKETS};\n`);
  write(`data/events/${DIR}/all.json`, IDS.map((id) => ({ id })));
  const buckets = Array.from({ length: BUCKETS }, () => ({}));
  for (const id of IDS) buckets[fullBucket(id, BUCKETS)][id] = { extract: "" };
  buckets.forEach((b, i) => write(`data/events/${DIR}/full/${i}.json`, b));
  write("data/events/meta.json", { version: VERSION, dir: DIR, fullBuckets: BUCKETS, totalEvents: IDS.length });
  write(ENTRY.slice(1), `const DATA_VERSION="${VERSION}";`);
  write("data/boundaries/meta.json", { decades: [1950] });
  write("data/boundaries/1950.json", { features: [{ geometry_ref: "aaaaaaaaaaaa" }, { geometry: null }] });
  write("data/boundaries/shared/aaaaaaaaaaaa.json", "{}");
  write("data/land.json", { features: [], cells: ["n30e030"] });
  write("data/land-far.json", { features: [] });
  write("data/land-cells/n30e030.json", { features: [] });
  write("index.html", shell());
  for (const id of IDS) write(`event/${id}.html`, eventPage(id));
  write("pagefind/pagefind.js", "");
  write("404.html", "");
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

test("boundaries and land: a missing shared geometry, land file or land cell", async () => {
  await assertProblem((f) => f.remove("data/boundaries/shared/aaaaaaaaaaaa.json"), /1950\.json points to missing shared geometry aaaaaaaaaaaa/);
  await assertProblem((f) => f.remove("data/land-far.json"), /data\/land-far\.json is missing/);
  await assertProblem((f) => f.write("data/land-far.json", { type: "Feature" }), /land-far\.json is not a FeatureCollection/);
  await assertProblem((f) => f.remove("data/land-cells/n30e030.json"), /land-cells\/n30e030\.json is missing/);
  await assertProblem((f) => f.write("data/land.json", { features: [], cells: [] }), /lists no land cells/);
});

test("index.html: no entry script, or a reference to a file not in dist/", async () => {
  await assertProblem((f) => f.write("index.html", "<html></html>"), /references no \/assets\/index-\*\.js entry script/);
  await assertProblem((f) => f.write("index.html", shell(`<link rel="icon" href="/favicon.svg">`)), /references \/favicon\.svg, which is not in dist\//);
});

test("event pages: missing, other assets, no no-JS stylesheet, no canonical, a leftover region marker", async () => {
  const id = IDS[1];
  await assertProblem((f) => f.remove(`event/${id}.html`), new RegExp(`event/${id}\\.html is missing`));
  await assertProblem((f) => f.write(`event/${id}.html`, eventPage(id).replace(ENTRY, "/assets/index-ZZZZZZZZ.js")), /does not load the same \/assets\/ files as index\.html/);
  await assertProblem((f) => f.write(`event/${id}.html`, eventPage(id).replace(`media="(scripting: none)"`, "")), /lacks its no-JavaScript stylesheet/);
  await assertProblem((f) => f.write(`event/${id}.html`, eventPage(id).replace("https://middleeast.events/event/", "https://example.org/")), /does not name itself as canonical/);
  await assertProblem((f) => f.write(`event/${id}.html`, eventPage(id) + "<!-- page-body -->"), /still has an index\.html region marker/);
});

test("search index and 404 page missing", async () => {
  await assertProblem((f) => f.remove("pagefind"), /pagefind\/pagefind\.js is missing/);
  await assertProblem((f) => f.remove("404.html"), /404\.html is missing/);
});

test("an unhashed file under assets/ (it would be cached as immutable)", async () => {
  await assertProblem((f) => f.write("assets/maplibre-gl-worker.js", ""), /no content hash.*maplibre-gl-worker\.js/);
  await assertProblem((f) => f.write("assets/fonts/inter-latin-AbCdEf12.woff2", ""), /no content hash.*fonts\/inter-latin-AbCdEf12\.woff2/);
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
