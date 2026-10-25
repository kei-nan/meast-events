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
//      request or same-origin HTTP error.
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

const server = startServer();
let browser;
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
} catch (err) {
  failed = true;
  problems.unshift(err.message);
} finally {
  await browser?.close();
  stopServer(server);
}

if (failed || problems.length) {
  console.error(`smoke: ${problems.length} problem(s) (${elapsed()})`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`smoke: OK - ${elapsed()} (browser channel ${CHANNEL})`);
