// Builds the full-text search index (Pagefind) over every event's title,
// Wikidata aliases and full lead, into public/pagefind/. The app searches it in the browser
// (src/lib/textSearch.js): no server, no database. Like public/data/, it is
// generated on every dev start and build (including Cloudflare's) and not
// committed.
//
// Pagefind identifies each record by a hash and keeps the record's url/meta in
// a per-record "fragment" file, which its API would fetch once per result. The
// app only needs event ids, so this script also writes ids.json, a
// {hash: event id} map read from those fragments: one small file instead of a
// request per result.
//
// Run via `npm run build` / `npm run dev` (pre-steps) or directly.
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import * as pagefind from "pagefind";
import { eventPath } from "../src/lib/urlState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ATLAS_DATA_DIR overrides the repo-root data/ (as in split-data.mjs).
const ROOT_DATA_DIR = process.env.ATLAS_DATA_DIR
  ? path.resolve(process.env.ATLAS_DATA_DIR)
  : path.join(__dirname, "..", "..", "data");
const OUT_DIR = path.join(__dirname, "..", "public", "pagefind");

// Fragment files are gzip; their JSON follows Pagefind's "pagefind_dcd" marker.
const FRAGMENT_MARKER = "pagefind_dcd";

async function main() {
  const events = JSON.parse(await readFile(path.join(ROOT_DATA_DIR, "events.json"), "utf8"));

  const { index, errors } = await pagefind.createIndex({ forceLanguage: "en" });
  if (!index) throw new Error(`pagefind: ${errors.join("; ")}`);
  for (const e of events) {
    // The title and Wikidata's English aliases (wikidata_aliases, so "July War"
    // finds the 2006 Lebanon War) are part of the content, searchable like the
    // lead. Ranking is done by the app (src/lib/ranking.js), which puts title
    // and then alias matches first, so the index needs no weights (a custom
    // record has none; only HTML input does).
    const aliases = Array.isArray(e.wikidata_aliases) ? e.wikidata_aliases : [];
    const res = await index.addCustomRecord({
      url: eventPath(e.id), // unused by the app, which needs only meta.id (ids.json below)
      content: [e.title, aliases.join("\n"), e.extract ?? ""].filter(Boolean).join("\n\n"),
      language: "en",
      meta: { title: e.title, id: e.id },
    });
    if (res.errors.length) throw new Error(`pagefind: ${e.id}: ${res.errors.join("; ")}`);
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  const written = await index.writeFiles({ outputPath: OUT_DIR });
  if (written.errors.length) throw new Error(`pagefind: ${written.errors.join("; ")}`);
  await pagefind.close();

  const ids = {};
  const fragmentDir = path.join(OUT_DIR, "fragment");
  for (const name of await readdir(fragmentDir)) {
    const text = gunzipSync(await readFile(path.join(fragmentDir, name))).toString("utf8");
    const json = JSON.parse(text.startsWith(FRAGMENT_MARKER) ? text.slice(FRAGMENT_MARKER.length) : text);
    ids[name.replace(/\.pf_fragment$/, "")] = json.meta.id;
  }
  if (Object.keys(ids).length !== events.length) {
    throw new Error(`pagefind: ${Object.keys(ids).length} fragments for ${events.length} events`);
  }
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "ids.json"), JSON.stringify(ids));

  // Not served: the fragments (replaced by ids.json; one file per event would
  // eat into the host's file-count limit as events grow) and Pagefind's
  // prebuilt search UIs (the app has its own).
  await rm(fragmentDir, { recursive: true });
  for (const name of await readdir(OUT_DIR)) {
    if (/^pagefind-(component-ui|modular-ui|ui|highlight)\./.test(name)) await rm(path.join(OUT_DIR, name));
  }
  console.log(`search index: ${events.length} events -> ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
