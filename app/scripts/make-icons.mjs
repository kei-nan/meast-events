// Renders the raster icons from public/favicon.svg into public/ (committed, so
// the build needs no browser; run again only when favicon.svg changes):
//
//   public/favicon.ico           16, 32 and 48 px PNGs in one ICO, for browsers
//                                that do not take the SVG icon and for the
//                                /favicon.ico they request on their own
//   public/apple-touch-icon.png  180x180, opaque and square (iOS rounds the
//                                corners itself and shows transparency as black)
//
// The SVG is drawn by an installed Chromium-family browser through playwright-core
// (as scripts/smoke.mjs does; ICON_BROWSER picks the channel, default msedge on
// Windows, chrome elsewhere). check-dist.mjs checks the results' sizes and format.
//
// Run: node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const CHANNEL = process.env.ICON_BROWSER || (process.platform === "win32" ? "msedge" : "chrome");
const ICO_SIZES = [16, 32, 48];
const TOUCH_SIZE = 180;

const svg = readFileSync(path.join(PUBLIC, "favicon.svg"), "utf8");
// The touch icon fills its square: the background rect without rounded corners.
const squareSvg = svg.replace(/(<rect\b[^>]*?)\s+rx="[^"]*"/, "$1");
if (squareSvg === svg) throw new Error("make-icons: no rounded <rect> found in favicon.svg");

const dataUrl = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;

async function render(page, source, size, { transparent }) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent"><img src="${dataUrl(source)}" width="${size}" height="${size}" style="display:block"></body></html>`
  );
  await page.waitForFunction(() => document.images[0]?.complete);
  return page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
}

// An ICO file holding PNG images (supported by every browser that reads ICO).
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, png } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // no palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.png)]);
}

const browser = await chromium.launch({ channel: CHANNEL });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const pngs = [];
  for (const size of ICO_SIZES) pngs.push({ size, png: await render(page, svg, size, { transparent: true }) });
  writeFileSync(path.join(PUBLIC, "favicon.ico"), ico(pngs));
  writeFileSync(path.join(PUBLIC, "apple-touch-icon.png"), await render(page, squareSvg, TOUCH_SIZE, { transparent: false }));
  console.log(`make-icons: favicon.ico (${ICO_SIZES.join(", ")} px), apple-touch-icon.png (${TOUCH_SIZE} px) -> ${PUBLIC}`);
} finally {
  await browser.close();
}
