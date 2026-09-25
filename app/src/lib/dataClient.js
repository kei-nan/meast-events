// Fetches the chunked data files written by scripts/split-data.mjs (served as
// static assets from public/data/, not bundled into the JS) and caches every
// response in memory for the lifetime of the page - re-visiting a decade that's
// already loaded (e.g. scrubbing the timeline back and forth) never re-fetches it.
//
// Boundaries and events are both split into one chunk per decade (see
// scripts/split-data.mjs for exactly how a feature/event is assigned to a
// decade). DECADE_SIZE/decadeFloor here must match the constants there.

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

const dataUrl = (relPath) => `${import.meta.env.BASE_URL}data/${relPath}`;

export function loadLand() {
  return fetchJSONCached(dataUrl("land.json"));
}

export function loadEventsIndex() {
  return fetchJSONCached(dataUrl("events/index.json"));
}

export function loadBoundaryDecade(decade) {
  return fetchJSONCached(dataUrl(`boundaries/${decade}.json`));
}

export function loadEventDecade(decade) {
  return fetchJSONCached(dataUrl(`events/${decade}.json`));
}

// Fire-and-forget: warms the cache for a decade without callers waiting on it
// or an error in it propagating anywhere. Used to prefetch neighboring decades
// so crossing a decade boundary while scrubbing the timeline rarely has to wait
// on a fresh network request.
export function prefetchBoundaryDecade(decade) {
  loadBoundaryDecade(decade).catch(() => {});
}

export function prefetchEventDecade(decade) {
  loadEventDecade(decade).catch(() => {});
}
