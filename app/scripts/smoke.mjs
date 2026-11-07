// Runtime smoke test of the built site: serves dist/ the way production does and
// drives it in a real browser. check-dist.mjs proves the files are there; this
// proves the page works with them, under the production response headers (the
// Content-Security-Policy in public/_headers can break the map, its worker or the
// search engine's WebAssembly without any file being missing).
//
//   npm run build && npm run smoke        (in app/)
//
// Server: `wrangler dev` on the wrangler.jsonc assets (./dist), which applies
// dist/_headers and not_found_handling like the deployed Worker (Vite's preview
// and scale-test/serve.mjs apply neither). Local only: no account, no network.
// Browser: playwright-core with an installed browser, no download. SMOKE_BROWSER
// picks the channel: "chrome" (default; preinstalled on GitHub's Ubuntu runners)
// or "msedge" (the default on Windows).
// SMOKE_PORT (default 8793) and SMOKE_INSPECTOR_PORT (wrangler's devtools port,
// default 5183) set the two local ports.
//
// Checks, in order:
//   1. the response carries the CSP from _headers (so the checks below run under it);
//   2. the map's canvas draws (MapLibre's own canvas, not the stand-in, and not blank);
//   3. a full-text search finds an event by a word that is in no title or
//      summary, so only Pagefind (its engine, WebAssembly and index) can answer;
//   4. clicking that result opens the event panel;
//   5. "Sources & licences" opens the About dialog at the credits;
//   6. /event/<id> loads the app with that event open;
//   7. throughout: no console error, uncaught exception, CSP violation, failed
//      request or same-origin HTTP error;
//   8. the failure states: a lost search index chunk, a two-word search with one
//      word's chunk gone after a deploy (HTTP 404) or failing once, matches only outside the
//      selected years, the full text failing to load, no WebGL 2;
//   9. an event page on a phone shifts its layout by no more than CLS_BUDGET.
// Exits 1 with the failures listed, or prints one line per check.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(APP, "dist");
const PORT = Number(process.env.SMOKE_PORT) || 8793;
const INSPECTOR_PORT = Number(process.env.SMOKE_INSPECTOR_PORT) || 5183;
const CHANNEL = process.env.SMOKE_BROWSER || (process.platform === "win32" ? "msedge" : "chrome");
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TIMEOUT = 45000;

const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const ok = (msg) => console.log(`smoke: ok - ${msg} (${elapsed()})`);

// --- what to look for, from the built data --------------------------------
const readDist = (rel) => JSON.parse(readFileSync(path.join(DIST, ...rel.split("/")), "utf8"));
const meta = readDist("data/events/meta.json");
const lite = readDist(`data/events/${meta.dir}/all.json`);
const full = {};
for (let b = 0; b < meta.fullBuckets; b++) Object.assign(full, readDist(`data/events/${meta.dir}/full/${b}.json`));

// A word of exactly one event's full lead that no title or summary (what the
// list matches locally) contains: a result for it can only come from Pagefind.
function pickFullTextQuery() {
  const listed = lite.map((e) => `${e.title} ${e.snippet}`.toLowerCase()).join("\n");
  const owners = new Map();
  for (const [id, r] of Object.entries(full)) {
    for (const w of new Set((r.extract ?? "").toLowerCase().match(/\b[a-z]{8,}\b/g) ?? [])) {
      owners.set(w, owners.has(w) ? null : id);
    }
  }
  const byId = new Map(lite.map((e) => [e.id, e]));
  const words = [...owners].filter(([w, id]) => id && !listed.includes(w)).sort(([a], [b]) => a.localeCompare(b));
  if (!words.length) throw new Error("no word of a full lead is absent from every title and summary");
  const [word, id] = words[0];
  return { word, event: byId.get(id) };
}
const query = pickFullTextQuery();
// An event with a map position, for the /event/<id> page.
const pageEvent = lite.find((e) => e.coordinates) ?? lite[0];

// --- the server ------------------------------------------------------------
function startServer() {
  const child = spawn(
    process.execPath,
    [
      path.join(APP, "node_modules", "wrangler", "bin", "wrangler.js"),
      "dev",
      "--ip", "127.0.0.1",
      "--port", String(PORT),
      "--inspector-port", String(INSPECTOR_PORT),
      "--show-interactive-dev-session=false",
      "--log-level", "warn",
    ],
    {
      cwd: APP,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
      // Its own process group on POSIX, so stopServer can end wrangler's workerd children too.
      detached: process.platform !== "win32",
    }
  );
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  return { child, log: () => log };
}

// Ends wrangler and the processes it started (workerd), and nothing else.
function stopServer({ child }) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

async function waitForServer(server) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) throw new Error(`wrangler dev exited (${server.child.exitCode}):\n${server.log()}`);
    try {
      const res = await fetch(`${ORIGIN}/`);
      if (res.ok) return res;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`wrangler dev did not answer on ${ORIGIN} within 60 s:\n${server.log()}`);
}

// --- the browser checks ----------------------------------------------------
const problems = [];

// Collects everything that must not happen on a page.
async function watchedPage(context) {
  const page = await context.newPage();
  const where = () => new URL(page.url() || ORIGIN).pathname;
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console error on ${where()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`uncaught exception on ${where()}: ${e.message}`));
  page.on("requestfailed", (r) => {
    // A navigation away (or the test ending) aborts what is still loading.
    if (r.failure()?.errorText !== "net::ERR_ABORTED") problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`);
  });
  page.on("response", (r) => {
    if (r.url().startsWith(ORIGIN) && r.status() >= 400) problems.push(`HTTP ${r.status()} for ${r.url().slice(ORIGIN.length)}`);
  });
  await page.exposeFunction("__smokeCsp", (v) => problems.push(`CSP violation on ${where()}: ${v}`));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      window.__smokeCsp(`${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"}${e.sourceFile ? ` from ${e.sourceFile}:${e.lineNumber}` : ""}`)
    );
  });
  return page;
}

// MapLibre's canvas has drawn the land: its stand-in is gone and a screenshot of
// it has many colours (a blank or sea-only canvas has one or two).
async function assertMapDrawn(page) {
  const canvas = page.locator("canvas.maplibregl-canvas");
  await canvas.waitFor({ state: "visible", timeout: TIMEOUT });
  await page.locator(".map-cover").waitFor({ state: "detached", timeout: TIMEOUT });
  const png = await canvas.screenshot();
  const colours = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4 * 7) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return seen.size;
  }, `data:image/png;base64,${png.toString("base64")}`);
  if (colours < 16) throw new Error(`the map canvas looks blank (${colours} distinct colours)`);
  return colours;
}

async function run(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  context.setDefaultTimeout(TIMEOUT);
  const page = await watchedPage(context);
  const pagefind = new Set();
  page.on("response", (r) => {
    const u = new URL(r.url());
    // The build's versioned folder (pagefind/v.<version>/) is written as v.*.
    if (u.pathname.startsWith("/pagefind/") && r.ok()) {
      pagefind.add(u.pathname.replace(/^\/pagefind\/v\.[^/]+\//, "/pagefind/v.*/").replace(/\/index\/.*/, "/index/*").replace(/\/fragment\/.*/, "/fragment/*"));
    }
  });

  await page.goto(`${ORIGIN}/`);
  const colours = await assertMapDrawn(page);
  ok(`map canvas drawn (${colours} distinct colours sampled)`);

  const input = page.locator(".sp-searchbox input");
  await input.fill(query.word);
  const row = page.locator("button.sp-row", { has: page.locator(".sp-row-title", { hasText: query.event.title }) });
  // The banner is the app saying the full-text search did not load (it then matches titles and summaries only).
  const banner = page.locator(".sp-banner");
  await row.first().or(banner).waitFor({ state: "visible" });
  if (await banner.isVisible()) throw new Error(`the full-text search did not load: "${await banner.innerText()}"`);
  const engine = ["/pagefind/v.*/pagefind.js", "/pagefind/v.*/ids.json"].filter((p) => !pagefind.has(p));
  if (engine.length || ![...pagefind].some((p) => p.endsWith(".pagefind"))) {
    throw new Error(`Pagefind files not loaded: ${engine.join(", ") || "its WebAssembly"} (loaded: ${[...pagefind].join(", ")})`);
  }
  ok(`full-text search for "${query.word}" found "${query.event.title}" via Pagefind (${[...pagefind].length} kinds of /pagefind/ files)`);

  await row.first().click();
  const heading = page.locator("#event-detail-title");
  await heading.filter({ hasText: query.event.title }).waitFor({ state: "visible" });
  ok("clicking the result opened the event panel");

  await page.locator("button.app-footer-link", { hasText: "Sources & licences" }).click();
  const dialog = page.locator('dialog[aria-labelledby="about-title"]');
  await dialog.waitFor({ state: "visible" });
  await dialog.locator("#about-credits").waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  ok("the About dialog opened at the credits and closed");

  const eventPage = await watchedPage(context);
  const res = await eventPage.goto(`${ORIGIN}/event/${encodeURIComponent(pageEvent.id)}`);
  if (res.status() !== 200) throw new Error(`/event/${pageEvent.id} answered HTTP ${res.status()}`);
  await eventPage.locator("#event-detail-title").filter({ hasText: pageEvent.title }).waitFor({ state: "visible" });
  await assertMapDrawn(eventPage);
  ok(`/event/${pageEvent.id} loaded the app with "${pageEvent.title}" open and the map drawn`);

  // Let anything late (a worker, a lazy chunk) report before judging the console.
  await page.waitForTimeout(500);
  await context.close();
}

// What the reader sees when a part fails. Plain pages, not watchedPage: these
// failures log errors on purpose.
//
// Each in a context of its own, and a failure is listed without skipping the others.
async function failureCheck(browser, check) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  context.setDefaultTimeout(TIMEOUT);
  try {
    await check(context);
  } catch (err) {
    problems.push(`${check.name}: ${err.message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
}

// An index chunk that fails to load (Pagefind only logs it): an outage with its
// notice, not "no events match", and the search recovers once the chunk loads.
async function lostIndexChunk(context) {
  let blocked = true;
  await context.route("**/pagefind/v.*/index/**", (r) => (blocked ? r.abort() : r.fallback()));
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/`);
  await page.locator(".sp-searchbox input").fill(query.word);
  await page.locator(".sp-banner").waitFor({ state: "visible" });
  const lost = await page.locator(".sp-empty").innerText();
  if (lost.includes("in this atlas match")) throw new Error(`a lost index chunk read as no match: "${lost}"`);
  blocked = false;
  await page.locator("button.sp-row", { hasText: query.event.title }).first().waitFor({ state: "visible" });
  await page.locator(".sp-banner").waitFor({ state: "detached" });
  ok("a lost index chunk shows the outage notice, then the search recovers");
}

// Two words, one of whose index chunks a deploy removed (a tab older than the deploy asks
// for its build's folder, and the server answers its 404 page): an outage with its notice,
// not the other word's events, which is what Pagefind answers (#168: "jerusalem suez" gave
// the 29 "suez" events). Each word's chunks are found first, so only a chunk the other word
// does not need is lost.
const TWO_WORDS = ["jerusalem", "suez"];
async function chunksFor(browser, word) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  context.setDefaultTimeout(TIMEOUT);
  const chunks = new Set();
  let pending = 0;
  let last = Date.now();
  try {
    await context.route("**/pagefind/v.*/index/**", async (r) => {
      chunks.add(new URL(r.request().url()).pathname);
      pending++;
      try {
        await r.fulfill({ response: await r.fetch() });
      } finally {
        pending--;
        last = Date.now();
      }
    });
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/?q=${encodeURIComponent(word)}`);
    // The list's own title matches can show before Pagefind has asked for its chunks:
    // wait until it has, and for a second without another.
    const deadline = Date.now() + TIMEOUT;
    while (!(chunks.size && !pending && Date.now() - last > 1000)) {
      if (Date.now() > deadline) throw new Error(`no index chunk was loaded for "${word}"`);
      await page.waitForTimeout(100);
    }
    return chunks;
  } finally {
    await context.close();
  }
}
async function twoWordsOneChunkGone(context) {
  const browser = context.browser();
  const [mine, other] = await Promise.all(TWO_WORDS.map((w) => chunksFor(browser, w)));
  const gone = [...mine].filter((c) => !other.has(c));
  if (!gone.length) throw new Error(`"${TWO_WORDS[0]}" and "${TWO_WORDS[1]}" are in the same index chunks: the check below would prove nothing (${[...mine].join(", ")} / ${[...other].join(", ")})`);
  let blocked = true;
  await context.route("**/pagefind/v.*/index/**", async (r) => {
    if (!blocked || !gone.includes(new URL(r.request().url()).pathname)) return r.fallback();
    // The server's own answer for a file that is no longer there (dist/404.html, status 404).
    return r.fulfill({ response: await r.fetch({ url: `${ORIGIN}/pagefind/v.removed-by-a-deploy/index/gone.pf_index` }) });
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/`);
  await page.locator(".sp-searchbox input").fill(TWO_WORDS.join(" "));
  const banner = page.locator(".sp-banner");
  try {
    await banner.waitFor({ state: "visible" });
  } catch {
    const rows = await page.locator("button.sp-row .sp-row-title").allInnerTexts();
    throw new Error(`with "${TWO_WORDS[0]}"'s index chunk gone, "${TWO_WORDS.join(" ")}" showed no outage notice but ${rows.length} event(s): ${rows.slice(0, 3).join("; ")}`);
  }
  blocked = false;
  await page.locator("button.sp-row").first().waitFor({ state: "visible" });
  await banner.waitFor({ state: "detached" });
  ok(`"${TWO_WORDS.join(" ")}" with an index chunk gone (HTTP 404, as after a deploy) shows the outage notice, then recovers`);
}

// The same chunk failing only once (a dropped request). Pagefind 1.6.0 asks for a failed chunk again on the next
// search, so a check run after the query could pass and show the other word's events: never those.
async function twoWordsChunkFailsOnce(context) {
  const browser = context.browser();
  const [mine, other] = await Promise.all(TWO_WORDS.map((w) => chunksFor(browser, w)));
  const gone = [...mine].filter((c) => !other.has(c));
  if (!gone.length) throw new Error(`"${TWO_WORDS[0]}" and "${TWO_WORDS[1]}" are in the same index chunks`);
  let failed = false;
  await context.route("**/pagefind/v.*/index/**", (r) => {
    if (failed || !gone.includes(new URL(r.request().url()).pathname)) return r.fallback();
    failed = true;
    return r.abort();
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/`);
  await page.locator(".sp-searchbox input").fill(TWO_WORDS.join(" "));
  const banner = page.locator(".sp-banner");
  const rows = page.locator("button.sp-row .sp-row-title");
  try {
    await banner.waitFor({ state: "visible" });
  } catch {
    const titles = await rows.allInnerTexts();
    throw new Error(`with "${TWO_WORDS[0]}"'s index chunk failing once, "${TWO_WORDS.join(" ")}" showed no outage notice but ${titles.length} event(s): ${titles.slice(0, 3).join("; ")}`);
  }
  await banner.waitFor({ state: "detached" });
  await rows.first().waitFor({ state: "visible" });
  ok(`"${TWO_WORDS.join(" ")}" with an index chunk failing once shows the outage notice, then recovers`);
}

// Matches outside the selected years: the empty list says that, as the status line does.
async function matchesOutsideYears(context) {
  const start = Number(String(query.event.date_start).slice(0, 4));
  const years = start < 1950 ? "2020-2021" : "1900-1901";
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/?q=${encodeURIComponent(query.word)}&y=${years}&scope=range`);
  const scoped = page.locator(".sp-empty p").first();
  await scoped.waitFor({ state: "visible" });
  await page.locator(".sp-scope-link", { hasText: "Show all" }).waitFor({ state: "visible" });
  const scopedText = await scoped.innerText();
  if (!scopedText.includes("selected years") || scopedText.includes("in this atlas")) {
    throw new Error(`matches outside the selected years read as: "${scopedText}"`);
  }
  ok("matches outside the selected years are not called no match");
}

// The full text fails to load: a retry in place brings it.
async function fullTextRetry(context) {
  let blocked = true;
  await context.route("**/data/events/v.*/full/**", (r) => (blocked ? r.abort() : r.fallback()));
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/event/${encodeURIComponent(pageEvent.id)}`);
  const retry = page.getByRole("button", { name: "Try again" });
  await retry.waitFor({ state: "visible" });
  blocked = false;
  await retry.click();
  await page.locator(".event-detail-asof").waitFor({ state: "visible" });
  await retry.waitFor({ state: "detached" });
  ok("the event's full text loads with Try again after a failure");
}

// Without WebGL 2 (a browser launched with --disable-3d-apis) the map cannot
// start: it says so in its own area, and the rest works.
async function withoutWebGL(context) {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/?q=${encodeURIComponent(query.word)}`);
  if (await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")))) {
    throw new Error("--disable-3d-apis left WebGL 2 on: the check below would prove nothing");
  }
  await page.locator(".map-view[role=alert]", { hasText: "WebGL" }).waitFor({ state: "visible" });
  await page.locator("button.sp-row", { hasText: query.event.title }).first().waitFor({ state: "visible" });
  await page.locator(".timeline").first().waitFor({ state: "visible" });
  const res = await page.goto(`${ORIGIN}/event/${encodeURIComponent(pageEvent.id)}`);
  if (res.status() !== 200) throw new Error(`/event/${pageEvent.id} answered HTTP ${res.status()}`);
  await page.locator("#event-detail-title").filter({ hasText: pageEvent.title }).waitFor({ state: "visible" });
  await page.locator(".map-view[role=alert]", { hasText: "WebGL" }).waitFor({ state: "visible" });
  ok("without WebGL 2 only the map says so; the panel, search and an event link work");
}

// Layout shift of an event page on a phone. Before #169 a link to an event opened the
// sheet at peek and raised it once the event list arrived: CLS 0.245 measured (2026-11,
// live site, this device, 1.6 Mbps / 150 ms, 4x CPU). The budget is web.dev's "good"
// threshold, well above the 0.03 measured after #169, so it does not flake. The network
// and CPU are slowed as then: on an unslowed local server the list is there before the
// first paint, and a shift it causes would not be seen. Layout shifts are layout, not
// drawing, so a runner without a GPU measures them as a phone does.
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true };
const CLS_BUDGET = 0.1;
async function eventPageLayoutShift(browser) {
  const context = await browser.newContext(PHONE);
  context.setDefaultTimeout(TIMEOUT);
  try {
    const page = await context.newPage();
    // CLS as Chrome reports it: the largest burst of shifts (gaps under 1 s, at most 5 s long)
    // not caused by input (https://web.dev/articles/cls).
    await page.addInitScript(() => {
      const w = (window.__smokeCls = { value: 0, shifts: [] });
      let start = 0;
      let last = 0;
      let sum = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          if (e.startTime - last > 1000 || e.startTime - start > 5000) {
            start = e.startTime;
            sum = 0;
          }
          last = e.startTime;
          sum += e.value;
          w.value = Math.max(w.value, sum);
          const src = (e.sources ?? []).map((s) => s.node?.className || s.node?.nodeName).filter(Boolean);
          w.shifts.push(`${e.value.toFixed(3)} at ${Math.round(e.startTime)} ms (${src.slice(0, 3).join(", ") || "?"})`);
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto(`${ORIGIN}/event/${encodeURIComponent(pageEvent.id)}`);
    await page.locator("#event-detail-title").filter({ hasText: pageEvent.title }).waitFor({ state: "visible" });
    await page.locator(".map-cover").waitFor({ state: "detached" });
    await page.evaluate(() => document.fonts.ready);
    // What comes later (the full text, the map's first frames) can shift the page too.
    await page.waitForTimeout(3000);
    return await page.evaluate(() => window.__smokeCls);
  } finally {
    await context.close();
  }
}
async function layoutShiftCheck(browser) {
  const cls = await eventPageLayoutShift(browser);
  if (cls.value > CLS_BUDGET) {
    problems.push(`layout shift on a phone at /event/${pageEvent.id}: CLS ${cls.value.toFixed(3)} over the ${CLS_BUDGET} budget; shifts: ${cls.shifts.join("; ")}`);
  } else {
    ok(`/event/${pageEvent.id} on a phone (412x823, slowed): CLS ${cls.value.toFixed(3)}, within ${CLS_BUDGET}`);
  }
}

const server = startServer();
let browser;
let noWebGL;
let failed = false;
try {
  const home = await waitForServer(server);
  const csp = home.headers.get("content-security-policy");
  if (!csp) throw new Error("/ has no Content-Security-Policy header: wrangler dev did not apply dist/_headers");
  ok(`wrangler dev serves dist/ with _headers applied (CSP ${csp.length} chars)`);
  browser = await chromium.launch({
    channel: CHANNEL,
    headless: true,
    // A runner has no GPU: let WebGL fall back to software rendering.
    args: ["--enable-unsafe-swiftshader"],
  });
  await run(browser);
  for (const check of [lostIndexChunk, twoWordsOneChunkGone, twoWordsChunkFailsOnce, matchesOutsideYears, fullTextRetry]) await failureCheck(browser, check);
  await layoutShiftCheck(browser).catch((err) => problems.push(`layoutShiftCheck: ${err.message.split("\n")[0]}`));
  noWebGL = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--disable-3d-apis"] });
  await failureCheck(noWebGL, withoutWebGL);
} catch (err) {
  failed = true;
  problems.unshift(err.message);
} finally {
  await browser?.close();
  await noWebGL?.close();
  stopServer(server);
}

if (failed || problems.length) {
  console.error(`smoke: ${problems.length} problem(s) (${elapsed()})`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`smoke: OK - ${elapsed()} (browser channel ${CHANNEL})`);
