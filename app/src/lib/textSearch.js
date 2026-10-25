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
// All of it (engine, index, ids.json) is in one versioned folder,
// pagefind/v.<version>/ (scripts/build-search-index.mjs), cached immutably. The
// bundle names its build's folder (__SEARCH_DIR__, vite.config.js). Without one
// (the dev server), or after a load failed (a page older than the deploy, whose
// folder is gone), the current folder is read from pagefind/meta.json.

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
    enginePromise = import(/* @vite-ignore */ engineUrl(base)).then(async (pf) => {
      await pf.options({ basePath: base });
      await pf.init();
      return pf;
    });
    // A failed load is retried on the next search.
    enginePromise.catch(() => {
      enginePromise = null;
      engineFailures++;
      failed();
    });
  }
  if (!idsPromise) {
    // {pagefind result id: event id}; replaces a fragment request per result.
    idsPromise = fetch(`${base}ids.json`).then((res) => {
      if (!res.ok) throw new Error(`Failed to load search ids: ${res.status}`);
      return res.json();
    });
    idsPromise.catch(() => {
      idsPromise = null;
      failed();
    });
  }
  return Promise.all([enginePromise, idsPromise]);
}

// Event ids matching every word of q (the last word also as a prefix, for
// search-as-you-type), most relevant first.
export async function searchEventIds(q) {
  const [pf, ids] = await load();
  const res = await pf.search(q);
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
