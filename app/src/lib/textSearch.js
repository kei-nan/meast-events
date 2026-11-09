// Full-text search over every event's title and full lead, in the browser:
// a static Pagefind index (public/pagefind/, built by
// scripts/build-search-index.mjs) instead of a search server. Pagefind's
// engine and index are fetched on the first search, and a query loads only
// the index chunks its words fall in.
//
// Answers only WHICH events match, as event ids in Pagefind's relevance order;
// filters, drawn areas and the final ranking are applied by the caller from
// the static store (hooks/useEventSearch.js).
//
// All of it (engine, index, ids.json, words.json) is in one versioned folder,
// pagefind/v.<version>/ (scripts/build-search-index.mjs), cached immutably. The
// bundle names its build's folder (__SEARCH_DIR__, vite.config.js). Without one
// (the dev server), or after a load failed (a page older than the deploy, whose
// folder is gone), the current folder is read from pagefind/meta.json.
//
// Pagefind (1.6.0, loadChunk) does not report an index chunk it could not load
// (a dropped connection, or a folder a deploy removed): it logs it and answers
// as if the chunk's words were in no event. A word on its own then finds
// nothing, and in a query of several words it is ignored: measured (2026-11,
// one chunk aborted) "jerusalem suez" answered the 29 "suez" events instead of
// 2. So each word the word list says the index holds is also searched alone;
// one that finds nothing means a lost chunk, and the search fails as an outage.
// Since 1.6.0 (Pagefind PR #1329) the engine forgets the failed load and asks
// for the chunk again on the next search, so it is kept (1.5.2 kept the failure
// for good, and the engine had to be replaced); only meta.json is read again
// before the next try, in case a deploy removed the folder (load() then moves
// to the new folder's engine).

import { everyTermIndexed, pagefindQuery, queryTerms } from "./searchTerms.js";

const ROOT = `${import.meta.env.BASE_URL}pagefind/`;
/* global __SEARCH_DIR__ */
const BUILD_DIR = typeof __SEARCH_DIR__ === "string" ? __SEARCH_DIR__ : null;

let dirPromise = BUILD_DIR ? Promise.resolve(BUILD_DIR) : null;
let loadedDir = null; // the folder enginePromise and idsPromise come from
let enginePromise = null;
let idsPromise = null;
let engineFailures = 0;

function currentDir() {
  if (!dirPromise) {
    dirPromise = fetch(`${ROOT}meta.json`, { cache: "no-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load the search folder: ${res.status}`);
        return res.json();
      })
      .then(({ dir } = {}) => {
        if (typeof dir !== "string" || !/^v\.[\w-]+$/.test(dir)) throw new Error("pagefind/meta.json names no folder");
        return dir;
      });
    dirPromise.catch(() => {
      dirPromise = null;
    });
  }
  return dirPromise;
}

// A browser remembers a failed module import by URL and rejects a second
// import of it at once, without a request (lib/importOr.js), so each retry
// asks for a new URL. Pagefind finds its own files (worker, wasm, index) from
// basePath, not from this URL, and the query is still same-origin for the CSP.
const engineUrl = (base) => `${base}pagefind.js${engineFailures ? `?r=${engineFailures}` : ""}`;

// A stalled download fails after this long, like a failed one: the search then
// falls back as for an outage and the next search tries again.
const LOAD_TIMEOUT_MS = 30000;
function withTimeout(promise, what) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out loading search ${what}`)), LOAD_TIMEOUT_MS);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

async function load() {
  const dir = await currentDir();
  // Engine, index and ids must come from the same build.
  if (dir !== loadedDir) {
    loadedDir = dir;
    enginePromise = null;
    idsPromise = null;
  }
  const base = `${ROOT}${dir}/`;
  // After a failure, read meta.json before the next try: the folder may be gone.
  const failed = () => {
    dirPromise = null;
  };
  if (!enginePromise) {
    const p = withTimeout(import(/* @vite-ignore */ engineUrl(base)).then(async (pf) => {
      await pf.options({ basePath: base });
      await pf.init();
      return pf;
    }), "engine");
    enginePromise = p;
    // A failed load is retried on the next search. A load from a folder that
    // has since been replaced may still settle; it must not reset the new one.
    p.catch(() => {
      if (enginePromise !== p) return;
      enginePromise = null;
      engineFailures++;
      failed();
    });
  }
  if (!idsPromise) {
    // ids.json: {pagefind result id: event id}, replacing a fragment request
    // per result. words.json: the index's sorted word list (searchTerms.js).
    const json = (name, what) =>
      fetch(`${base}${name}`).then((res) => {
        if (!res.ok) throw new Error(`Failed to load search ${what}: ${res.status}`);
        return res.json();
      });
    const p = withTimeout(Promise.all([json("ids.json", "ids"), json("words.json", "words")]).then(([ids, words]) => {
      if (!Array.isArray(words)) throw new Error("search words.json is not a list");
      return { ids, words };
    }), "index");
    idsPromise = p;
    p.catch(() => {
      if (idsPromise !== p) return;
      idsPromise = null;
      failed();
    });
  }
  return Promise.all([enginePromise, idsPromise]);
}

// Every word of a query that the word list holds finds something on its own,
// unless Pagefind lost the chunk it is in. The engine is kept (it asks for a
// failed chunk again on the next search); meta.json is read again before the
// next try, as the folder may be gone.
//
// A word that once found something alone has its chunks loaded in that engine,
// and Pagefind keeps a loaded chunk for the engine's life (only a failed load
// is forgotten), so the word is not searched alone again: a settled query of
// several words then costs one extra search per word new to this engine, not
// per word. Kept per engine instance: a new engine (another folder, or a
// failed engine load retried) has loaded nothing and checks every word again.
const confirmedByEngine = new WeakMap();

async function assertChunksLoaded(pf, terms) {
  let confirmed = confirmedByEngine.get(pf);
  if (!confirmed) confirmedByEngine.set(pf, (confirmed = new Set()));
  const unchecked = [...new Set(terms)].filter((t) => !confirmed.has(t));
  if (!unchecked.length) return false;
  const answers = await Promise.all(unchecked.map((t) => pf.search(t)));
  // Only a word that found something is confirmed; one that found nothing
  // (null is no answer, not a lost chunk, as before) is checked again next time.
  unchecked.forEach((t, i) => {
    if (answers[i]?.results?.length > 0) confirmed.add(t);
  });
  if (answers.some((a) => a?.results?.length === 0)) {
    dirPromise = null;
    throw new Error("Failed to load part of the search index");
  }
  return true;
}

// Event ids matching every word of q (each word, stemmed, also as a prefix, so
// search-as-you-type works), most relevant first. A word the index does not
// hold means no events: Pagefind would instead answer it with the events of a
// shorter indexed word ("jerusalemxyz" -> "jerusalem"), or ignore it in a
// longer query (searchTerms.js). Rejects if part of the index could not be
// loaded (see the top of this file).
export async function searchEventIds(q) {
  const [pf, { ids, words }] = await load();
  const query = pagefindQuery(q);
  if (!everyTermIndexed(query, words)) return [];
  // Several words are checked word by word BEFORE the query: Pagefind 1.6.0
  // asks for a failed chunk again on each search, so a check run after the
  // query could load the chunk the query went without, pass, and leave the
  // query's answer short of that word. Once each word has found something, its
  // chunks are loaded and the query runs on all of them. One word is checked
  // only if it found nothing, and then searched again: the check may have
  // loaded its chunk. Words each found, but never in one event, are a real
  // "no match". A word already confirmed in this engine is not checked again
  // (assertChunksLoaded), and one word already confirmed is not searched again.
  const terms = queryTerms(query);
  if (terms.length > 1) await assertChunksLoaded(pf, terms);
  let res = await pf.search(query);
  if (terms.length <= 1 && res?.results?.length === 0) {
    if (await assertChunksLoaded(pf, terms)) res = await pf.search(query);
  }
  const out = [];
  for (const r of res?.results ?? []) {
    const id = ids[r.id];
    if (id) out.push(id);
  }
  return out;
}

// Starts downloading the engine and the id map (e.g. when the search box gets
// focus), so the first search does not wait for them.
export function preloadTextSearch() {
  load().catch(() => {});
}
