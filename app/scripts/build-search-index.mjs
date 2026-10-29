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
// It also writes words.json, every word in the index as Pagefind keys them
// (stemmed and folded; sorted), read from the index chunks. Pagefind answers a
// query word that no indexed word starts with by a fallback (the events of the
// longest indexed word the query word starts with: "aaaaaaaa" finds every event
// with "a"), so src/lib/textSearch.js checks each query word against this list
// first (src/lib/searchTerms.js). The build fails if that check would reject a
// word of the indexed text itself (e.g. a Pagefind upgrade changed its stemmer).
//
// Like the event data (scripts/split-data.mjs, events/v.<version>/), everything
// Pagefind writes (engine, wasm, entry, meta, index chunks) and ids.json lives in
// ONE versioned folder, pagefind/v.<version>/, where <version> is a hash of every
// file in it. So the whole folder is cached immutably by one _headers rule
// (public/_headers; a rule per index chunk ran out of the host's 100 rules at
// about twice the 815 events of October 2026), a page never pairs an engine or index from two builds, and
// a Pagefind upgrade changes the folder name too. pagefind/meta.json (the one
// mutable file, {version, dir}) names the current folder; vite.config.js compiles
// it into the bundle (__SEARCH_DIR__) and lib/textSearch.js falls back to it
// for a page whose folder a deploy removed.
//
// Run via `npm run build` / `npm run dev` (pre-steps) or directly.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import * as pagefind from "pagefind";
import { hasWordWithPrefix, pagefindQuery, queryTerms, stemEnglish } from "../src/lib/searchTerms.js";
import { eventPath } from "../src/lib/urlState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ATLAS_DATA_DIR overrides the repo-root data/ (as in split-data.mjs).
const ROOT_DATA_DIR = process.env.ATLAS_DATA_DIR
  ? path.resolve(process.env.ATLAS_DATA_DIR)
  : path.join(__dirname, "..", "..", "data");
const ROOT_OUT_DIR = path.join(__dirname, "..", "public", "pagefind");
// Written here first, then renamed to v.<version> once the files are final.
const OUT_DIR = path.join(ROOT_OUT_DIR, "staging");

// Every file under `dir`, as sorted paths relative to it (with "/").
async function filesUnder(dir, rel = "") {
  const out = [];
  for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await filesUnder(dir, p)));
    else out.push(p);
  }
  return out.sort();
}

// 12 hex characters of a hash over every file's path and bytes.
async function folderVersion(dir) {
  const hash = createHash("sha256");
  for (const rel of await filesUnder(dir)) hash.update(rel).update("\0").update(await readFile(path.join(dir, rel))).update("\0");
  return hash.digest("hex").slice(0, 12);
}

// Fragment files are gzip; their JSON follows Pagefind's "pagefind_dcd" marker.
const FRAGMENT_MARKER = "pagefind_dcd";

// Pagefind's index chunks too: gzip, the marker, then CBOR.
function unpack(buf) {
  const data = buf.subarray(0, FRAGMENT_MARKER.length).toString() === FRAGMENT_MARKER ? buf : gunzipSync(buf);
  return data.subarray(FRAGMENT_MARKER.length);
}

// Minimal CBOR decoder (definite lengths, which is all Pagefind writes).
function decodeCbor(buf) {
  let i = 0;
  const text = new TextDecoder();
  const uint = (info) => {
    if (info < 24) return info;
    const size = { 24: 1, 25: 2, 26: 4, 27: 8 }[info];
    if (!size) throw new Error(`CBOR: unsupported length ${info} at byte ${i}`);
    let v = 0;
    for (let k = 0; k < size; k++) v = v * 256 + buf[i++];
    return v;
  };
  const item = () => {
    const b = buf[i++];
    const major = b >> 5;
    const info = b & 31;
    if (major === 7) {
      if (info === 20 || info === 21) return info === 21;
      if (info === 22 || info === 23) return null;
      const size = { 25: 2, 26: 4, 27: 8 }[info];
      if (!size) throw new Error(`CBOR: unsupported simple value ${info} at byte ${i}`);
      const view = new DataView(buf.buffer, buf.byteOffset + i, size);
      i += size;
      return size === 2 ? view.getUint16(0) : size === 4 ? view.getFloat32(0) : view.getFloat64(0);
    }
    const n = uint(info);
    if (major === 0) return n;
    if (major === 1) return -1 - n;
    if (major === 2 || major === 3) {
      const bytes = buf.subarray(i, i + n);
      i += n;
      return major === 3 ? text.decode(bytes) : bytes;
    }
    if (major === 4) return Array.from({ length: n }, item);
    if (major === 5) {
      const o = {};
      for (let k = 0; k < n; k++) o[item()] = item();
      return o;
    }
    return item(); // major 6, a tag: its value
  };
  return item();
}

// Every word key in the index chunks under dir, sorted. A chunk is
// [words, ...]; a word is [key, pages, diacritic variants].
async function indexWords(dir) {
  const words = new Set();
  for (const name of await readdir(path.join(dir, "index"))) {
    const chunk = decodeCbor(unpack(await readFile(path.join(dir, "index", name))));
    if (!Array.isArray(chunk?.[0])) throw new Error(`pagefind: unexpected index chunk layout in ${name}`);
    for (const w of chunk[0]) {
      if (typeof w?.[0] !== "string") throw new Error(`pagefind: unexpected word entry in ${name}`);
      words.add(w[0]);
    }
  }
  return [...words].sort();
}

async function main() {
  const events = JSON.parse(await readFile(path.join(ROOT_DATA_DIR, "events.json"), "utf8"));

  const { index, errors } = await pagefind.createIndex({ forceLanguage: "en" });
  if (!index) throw new Error(`pagefind: ${errors.join("; ")}`);
  const contents = [];
  for (const e of events) {
    // The title and Wikidata's English aliases (wikidata_aliases, so "July War"
    // finds the 2006 Lebanon War) are part of the content, searchable like the
    // lead. Ranking is done by the app (src/lib/ranking.js), which puts title
    // and then alias matches first, so the index needs no weights (a custom
    // record has none; only HTML input does).
    const aliases = Array.isArray(e.wikidata_aliases) ? e.wikidata_aliases : [];
    const content = [e.title, aliases.join("\n"), e.extract ?? ""].filter(Boolean).join("\n\n");
    contents.push(content);
    const res = await index.addCustomRecord({
      url: eventPath(e.id), // unused by the app, which needs only meta.id (ids.json below)
      content,
      language: "en",
      meta: { title: e.title, id: e.id },
    });
    if (res.errors.length) throw new Error(`pagefind: ${e.id}: ${res.errors.join("; ")}`);
  }

  await rm(ROOT_OUT_DIR, { recursive: true, force: true });
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

  const words = await indexWords(OUT_DIR);
  if (!words.length) throw new Error("pagefind: no words in the index chunks");
  // Each word of the indexed text, searched for, must pass the app's check.
  const missed = new Set();
  for (const content of contents) {
    for (const t of queryTerms(pagefindQuery(content).replace(/\s+/g, " "))) {
      if (!hasWordWithPrefix(words, stemEnglish(t))) missed.add(t);
    }
  }
  if (missed.size) {
    throw new Error(
      `search words: ${missed.size} words of the indexed text are missing from the index's word list as src/lib/searchTerms.js stems them (did Pagefind's stemmer or tokenizer change?): ${[...missed].slice(0, 20).join(", ")}`
    );
  }
  await writeFile(path.join(OUT_DIR, "words.json"), JSON.stringify(words));

  // Not served: the fragments (replaced by ids.json; one file per event would
  // eat into the host's file-count limit as events grow) and Pagefind's
  // prebuilt search UIs (the app has its own).
  await rm(fragmentDir, { recursive: true });
  for (const name of await readdir(OUT_DIR)) {
    if (/^pagefind-(component-ui|modular-ui|ui|highlight)\./.test(name)) await rm(path.join(OUT_DIR, name));
  }
  const version = await folderVersion(OUT_DIR);
  const dir = `v.${version}`;
  await rename(OUT_DIR, path.join(ROOT_OUT_DIR, dir));
  await writeFile(path.join(ROOT_OUT_DIR, "meta.json"), JSON.stringify({ version, dir }));
  const files = (await filesUnder(path.join(ROOT_OUT_DIR, dir))).length;
  console.log(`search index: ${events.length} events -> ${path.relative(process.cwd(), path.join(ROOT_OUT_DIR, dir))} (${files} files)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
