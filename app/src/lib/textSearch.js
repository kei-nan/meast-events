// Full-text search over every event's title and full lead, in the browser:
// a static Pagefind index (public/pagefind/, built by
// scripts/build-search-index.mjs) instead of a search server. Pagefind's
// engine and index are fetched on the first search, and a query loads only
// the index chunks its words fall in.
//
// Answers only WHICH events match, as event ids in Pagefind's relevance order;
// filters, drawn areas and the final ranking are applied by the caller from
// the static store (hooks/useEventSearch.js), as they were for the API.

const BASE = `${import.meta.env.BASE_URL}pagefind/`;

let enginePromise = null;
let idsPromise = null;

function load() {
  if (!enginePromise) {
    enginePromise = import(/* @vite-ignore */ `${BASE}pagefind.js`).then(async (pf) => {
      await pf.options({ basePath: BASE });
      await pf.init();
      return pf;
    });
    // A failed load is retried on the next search.
    enginePromise.catch(() => {
      enginePromise = null;
    });
  }
  if (!idsPromise) {
    // {pagefind result id: event id}; replaces a fragment request per result.
    idsPromise = fetch(`${BASE}ids.json`).then((res) => {
      if (!res.ok) throw new Error(`Failed to load search ids: ${res.status}`);
      return res.json();
    });
    idsPromise.catch(() => {
      idsPromise = null;
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
