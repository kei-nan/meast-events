// Renders public/og-image.png, the 1200x630 link-preview image every page names
// (og:image and twitter:image: index.html and scripts/event-page.mjs OG_IMAGE).
// Committed, so the build needs no browser; run again when the name, the title or
// the map's look changes:
//
//   npm run build && node scripts/make-og-image.mjs        (in app/)
//
// The map on the right is a screenshot of the real map: the built site (dist/)
// served by Vite's preview server on 127.0.0.1 (OG_PORT, default 8795; local
// only), the map's own canvas with every control and overlay hidden, at the
// borders of OG_YEARS (default 1930-1939). The text on the left is HTML in the
// site's own fonts (Spectral 600 and Inter, from the Fontsource packages the site
// is built from) and colours (src/index.css). The browser is an installed
// Chromium-family one through playwright-core, as in make-icons.mjs (OG_BROWSER
// picks the channel, default msedge on Windows, chrome elsewhere).
// check-dist.mjs checks the result's size and format.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(APP, "dist");
const OUT = path.join(APP, "public", "og-image.png");
const PORT = Number(process.env.OG_PORT) || 8795;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const YEARS = process.env.OG_YEARS || "1930-1939";
const CHANNEL = process.env.OG_BROWSER || (process.platform === "win32" ? "msedge" : "chrome");
const WIDTH = 1200;
const HEIGHT = 630;

export const BRAND = "middleeast.events";
export const TITLE = ["Middle East,", "1900–present"];
export const SUBTITLE = "An interactive map and timeline of major events, with historical borders.";
export const CREDIT = "Borders: CShapes 2.0 (CC BY-NC-SA 4.0); text: Wikipedia (CC BY-SA 4.0)";

const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(path.join(APP, "node_modules", ...pkg.split("/"), "files", file)).toString("base64")}`;
const escape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The image as one HTML page: the map screenshot (a data: URL) on the right. */
export function ogHtml(mapDataUrl, { spectral, inter }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Spectral"; font-weight: 600; src: url(${spectral}) format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 100 900; src: url(${inter}) format("woff2"); }
html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #1d1a15; }
.map { position: absolute; top: 0; right: 0; width: 820px; height: ${HEIGHT}px;
  background: url(${mapDataUrl}) center / cover no-repeat; }
.shade { position: absolute; inset: 0;
  background: linear-gradient(90deg, #1d1a15 0, #1d1a15 380px, rgba(29, 26, 21, 0.85) 470px, rgba(29, 26, 21, 0) 720px); }
.text { position: absolute; left: 64px; top: 0; bottom: 56px; width: 600px; display: flex; flex-direction: column; justify-content: center; }
.brand { font: 600 22px/1 "Inter", sans-serif; letter-spacing: 0.06em; color: #c99a45; margin: 0 0 22px; }
h1 { font: 600 70px/1.08 "Spectral", serif; color: #ece2c9; margin: 0 0 30px; }
.sub { font: 400 24px/1.45 "Inter", sans-serif; color: #b6a888; margin: 0; max-width: 560px; }
.credit { position: absolute; left: 0; right: 0; bottom: 0; height: 56px; box-sizing: border-box; padding: 0 64px;
  display: flex; align-items: center; background: rgba(29, 26, 21, 0.92);
  font: 400 17px/1 "Inter", sans-serif; color: #ece2c9; }
</style></head><body>
<div class="map"></div><div class="shade"></div>
<div class="text"><p class="brand">${escape(BRAND)}</p><h1>${TITLE.map(escape).join("<br>")}</h1><p class="sub">${escape(SUBTITLE)}</p></div>
<div class="credit">${escape(CREDIT)}</div>
</body></html>`;
}

async function waitForServer(child) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (child.exitCode != null) throw new Error(`make-og-image: the preview server exited (${child.exitCode})`);
    try {
      if ((await fetch(ORIGIN)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`make-og-image: no server at ${ORIGIN} after 30 s`);
}

// The real map, without the app around it: its canvas only (markers and labels
// are drawn in it), every control, tooltip, tip and panel edge over it hidden.
async function mapScreenshot(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${ORIGIN}/?y=${YEARS}`, { waitUntil: "networkidle" });
  await page.locator(".map-view canvas.maplibregl-canvas").waitFor();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500); // the zoom animation and the fade-in of borders and labels
  await page.addStyleTag({
    content: `body * { visibility: hidden !important; }
.map-view .maplibregl-canvas-container, .map-view .maplibregl-canvas-container * { visibility: visible !important; }`,
  });
  await page.waitForTimeout(200);
  const png = await page.locator(".map-view canvas.maplibregl-canvas").screenshot();
  await page.close();
  return png;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(path.join(DIST, "index.html"))) throw new Error("make-og-image: no dist/ (run npm run build first)");
  const server = spawn(
    process.execPath,
    [path.join(APP, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { cwd: APP, stdio: "ignore" }
  );
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ channel: CHANNEL });
    const map = await mapScreenshot(browser);
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    const fonts = {
      spectral: font("@fontsource/spectral", "spectral-latin-600-normal.woff2"),
      inter: font("@fontsource-variable/inter", "inter-latin-wght-normal.woff2"),
    };
    await page.setContent(ogHtml(`data:image/png;base64,${map.toString("base64")}`, fonts));
    await page.evaluate(() => document.fonts.ready);
    writeFileSync(OUT, await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } }));
    console.log(`make-og-image: ${WIDTH}x${HEIGHT} -> ${OUT} (map: borders of ${YEARS})`);
  } finally {
    await browser?.close();
    server.kill();
  }
}
