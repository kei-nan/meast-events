// Writes one HTML page per curated event into dist/ after the Vite build (wired
// in as "postbuild"), plus the /event/ index and sitemap.xml:
//
//   dist/event/<id>.html  served at /event/<id>  (Workers static assets,
//                         html_handling "auto-trailing-slash", the default:
//                         /event/<id>.html and /event/<id>/ redirect there)
//   dist/event/index.html served at /event/
//   dist/sitemap.xml      home + /event/ + every event page
//   dist/404.html         served with status 404 for any other path
//                         (wrangler.jsonc not_found_handling "404-page")
//
// An event's page is the app: dist/index.html, as Vite just built it (the same
// hashed script and styles), with the event's own <head> tags and the event as
// plain HTML for readers without JavaScript (event-page.mjs fillAppShell). The
// app reads the event from the path and opens it on the map. That HTML's
// stylesheet, public/event/event.css, applies only without JavaScript. The
// /event/ index and 404.html are plain pages with no script.
//
// The input is the data the build just shipped (dist/data/, written by
// split-data.mjs and copied by Vite): the lite record from events/v.<version>/all.json
// merged with the full record from events/v.<version>/full/<bucket>.json, the same merge
// the app's detail view does. So a page shows exactly what the app shows,
// including the framing review (the app shows it under every summary). Rendering
// is in event-page.mjs. The search index (build-search-index.mjs) is built from
// custom records, not by crawling dist/, so these pages are never indexed a
// second time.
//
// Run via `npm run build` or `node scripts/build-event-pages.mjs` after `vite build`.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fullBucket } from "../src/lib/fullBucket.js";
import { renderEventPage, renderIndexPage, renderNotFoundPage, renderSitemap } from "./event-page.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.EVENT_PAGES_DIST ? path.resolve(process.env.EVENT_PAGES_DIST) : path.join(__dirname, "..", "dist");
const DATA = path.join(DIST, "data", "events");
const OUT = path.join(DIST, "event");

const readJSON = async (file) => JSON.parse(await readFile(file, "utf8"));

async function main() {
  const meta = await readJSON(path.join(DATA, "meta.json"));
  const dir = path.join(DATA, meta.dir);
  const lite = await readJSON(path.join(dir, "all.json"));
  const template = await readFile(path.join(DIST, "index.html"), "utf8");
  const buckets = new Map();
  const full = async (id) => {
    const b = fullBucket(id, meta.fullBuckets);
    if (!buckets.has(b)) buckets.set(b, await readJSON(path.join(dir, "full", `${b}.json`)));
    return buckets.get(b)[id];
  };

  const seen = new Set();
  const events = [];
  for (const e of lite) {
    if (seen.has(e.id)) throw new Error(`duplicate event id ${e.id}`);
    seen.add(e.id);
    const f = await full(e.id);
    if (!f) throw new Error(`event ${e.id}: no full-lead record`);
    events.push({ ...e, ...f });
  }

  // Keep the stylesheet Vite copied from public/event/; replace only the pages.
  await mkdir(OUT, { recursive: true });
  let bytes = 0;
  for (const e of events) {
    const html = renderEventPage(e, template);
    bytes += Buffer.byteLength(html);
    await writeFile(path.join(OUT, `${e.id}.html`), html);
  }
  const index = renderIndexPage(events);
  await writeFile(path.join(OUT, "index.html"), index);
  await writeFile(path.join(DIST, "sitemap.xml"), renderSitemap(events));
  await writeFile(path.join(DIST, "404.html"), renderNotFoundPage());
  if (events.length !== meta.totalEvents) throw new Error(`event pages: ${events.length} pages for ${meta.totalEvents} events`);
  console.log(
    `event pages: ${events.length} pages + index -> ${path.relative(process.cwd(), OUT)} ` +
      `(${((bytes + Buffer.byteLength(index)) / 1024).toFixed(0)}KB), sitemap.xml with ${events.length + 2} URLs, 404.html`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
