// Fetches event/boundary data from the Redis-backed API in ../../../server
// (RediSearch + RedisJSON) instead of the static chunked JSON files
// scripts/split-data.mjs used to produce. That static pipeline (and its
// output under public/data/) is left in place as a fallback/reference - see
// app/scripts/split-data.mjs - but the running app no longer reads from it
// by default.
//
// Caching/prefetch philosophy is carried over unchanged from the static-file
// version: concurrent callers for the same URL share one in-flight request,
// and every successful response is cached in memory for the life of the
// page. Events and boundaries are still fetched in decade-aligned chunks for
// the primary, year-range-driven browsing path (loadEventDecade /
// loadBoundaryDecade below) - even though the backend can now answer any
// arbitrary [start,end] range directly, keeping the decade grid preserves
// the proven "scrubbing back and forth within an already-visited decade is
// instant" UX, and it's what the rest of App.jsx/MapView.jsx already expect.
//
// New, on top of that: fetchEvents() below is an uncached, arbitrary-range +
// bbox + full-text query function - the genuinely new capability a static
// file pipeline couldn't support. It backs two real features:
//   - live full-text search (see the search box in App.jsx)
//   - map-viewport-based event counting as the user pans/zooms (see the
//     moveend handling in MapView.jsx)

export const DECADE_SIZE = 10;

export function decadeFloor(year) {
  return Math.floor(year / DECADE_SIZE) * DECADE_SIZE;
}

// Every decade chunk key a [startYear, endYear] span needs, inclusive.
export function decadesInRange(startYear, endYear) {
  const lo = decadeFloor(Math.min(startYear, endYear));
  const hi = decadeFloor(Math.max(startYear, endYear));
  const decades = [];
  for (let d = lo; d <= hi; d += DECADE_SIZE) decades.push(d);
  return decades;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const inFlight = new Map(); // url -> Promise<data>, so concurrent callers share one fetch

function fetchJSONCached(url) {
  if (!inFlight.has(url)) {
    const promise = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
      return res.json();
    });
    // A failed fetch shouldn't be cached forever - let a later retry try again.
    promise.catch(() => inFlight.delete(url));
    inFlight.set(url, promise);
  }
  return inFlight.get(url);
}

function apiUrl(path, params = {}) {
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

const dataUrl = (relPath) => `${import.meta.env.BASE_URL}data/${relPath}`;

// Pure physical geography (land/water silhouette) with no time dimension and
// nothing to query it by - stays a plain static asset rather than moving
// into Redis, since a database index would add complexity with no benefit
// here (see app/public/data/land.json / scripts/split-data.mjs).
export function loadLand() {
  return fetchJSONCached(dataUrl("land.json"));
}

// One-time fetch of the whole dataset's events, used only to build the
// timeline density chart's per-start-year counts, which need to cover the
// entire MIN_YEAR-MAX_YEAR span regardless of which decades are currently
// browsed. The curated dataset (114 events) is small enough that computing
// this client-side from one unfiltered request is simpler than standing up
// a dedicated aggregation endpoint.
let eventsIndexPromise = null;
export function loadEventsIndex() {
  if (!eventsIndexPromise) {
    eventsIndexPromise = fetch(apiUrl("/api/events"))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load events index: ${res.status}`);
        return res.json();
      })
      .then(({ events }) => {
        const counts = {};
        for (const e of events) {
          const year = Number(e.date_start.slice(0, 4));
          counts[year] = (counts[year] ?? 0) + 1;
        }
        return counts;
      });
    eventsIndexPromise.catch(() => {
      eventsIndexPromise = null;
    });
  }
  return eventsIndexPromise;
}

export function loadBoundaryDecade(decade) {
  const url = apiUrl("/api/boundaries", { start: decade, end: decade + DECADE_SIZE - 1 });
  return fetchJSONCached(url);
}

export function loadEventDecade(decade) {
  const url = apiUrl("/api/events", { start: decade, end: decade + DECADE_SIZE - 1 });
  return fetchJSONCached(url).then((r) => r.events);
}

// Fire-and-forget: warms the cache for a decade without callers waiting on it
// or an error in it propagating anywhere. Used to prefetch neighboring
// decades so crossing a decade boundary while scrubbing the timeline rarely
// has to wait on a fresh network request.
export function prefetchBoundaryDecade(decade) {
  loadBoundaryDecade(decade).catch(() => {});
}

export function prefetchEventDecade(decade) {
  loadEventDecade(decade).catch(() => {});
}

// --- New capabilities the static-file pipeline couldn't support ---
//
// Arbitrary [start,end] x bbox x full-text query straight against Redis -
// not decade-aligned, and not cached forever (a live map-viewport bbox is
// far less likely to repeat exactly than a fixed decade, and search queries
// are user-driven one-offs), though identical repeat calls still dedupe via
// fetchJSONCached. `start`/`end` are optional - omit both to search across
// the whole timeline.
export function fetchEvents({ start, end, bbox, q } = {}) {
  const url = apiUrl("/api/events", {
    start,
    end,
    bbox: bbox ? bbox.join(",") : undefined,
    q,
  });
  return fetchJSONCached(url); // { total, events }
}
