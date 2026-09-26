import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_ENABLED,
  fetchAllPages,
  loadStaticEvents,
  normalizeEvents,
} from "../lib/dataClient";

const RETRY_MS = 20000;
const MAX_RANGE_PAGES = 20;

// Owns the accumulated event store (every event ever loaded, never evicted, so
// revisiting a range is instant) and fills it for the settled [start,end]
// range. The API caps a response at 1000 events, so a range is paged with
// `offset` until the server reports it complete; if that cannot be achieved
// (page cap, a failing page, an API without paging) the WHOLE range is filled
// from the static chunks instead - a range is never silently half-loaded.
// Ranges completed by the API are remembered and served from the store.
// If the API fails or times out `degraded` turns on; the next range change (or
// the periodic retry) tries the API again and clears it on success.
//
// The store is a ref-held Map (mutating it doesn't re-render), so `version`
// changes whenever it gains entries - use it as a dependency for derived data.
// A "lite" record (no `extract`) is upgraded when a full one arrives.
export default function useRangeEvents(startYear, endYear) {
  const storeRef = useRef(new Map());
  const fetchedRangesRef = useRef([]); // [lo, hi] pairs the API has fully answered
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const forceRefetchRef = useRef(false); // periodic retry must bypass the covered-range shortcut

  const addEvents = useCallback((events) => {
    let changed = false;
    for (const event of normalizeEvents(events)) {
      const existing = storeRef.current.get(event.id);
      if (!existing || (existing.extract === undefined && event.extract !== undefined)) {
        storeRef.current.set(event.id, event);
        changed = true;
      }
    }
    if (changed) setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const lo = Math.min(startYear, endYear);
    const hi = Math.max(startYear, endYear);
    const controller = new AbortController();
    let cancelled = false;

    const covered =
      !forceRefetchRef.current && fetchedRangesRef.current.some(([a, b]) => a <= lo && hi <= b);
    forceRefetchRef.current = false;
    if (API_ENABLED && covered) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const source = API_ENABLED
      ? fetchAllPages(
          { start: lo, end: hi, fields: "lite" },
          { signal: controller.signal, maxPages: MAX_RANGE_PAGES }
        ).then(({ events, truncated }) => {
          if (truncated) throw Object.assign(new Error("range incomplete"), { outage: false });
          fetchedRangesRef.current.push([lo, hi]);
          if (!cancelled) setDegraded(false);
          return events;
        })
      : loadStaticEvents(lo, hi);

    source
      .catch((err) => {
        if (!API_ENABLED || err.aborted) throw err;
        if (err.outage !== false && !cancelled) setDegraded(true);
        return loadStaticEvents(lo, hi);
      })
      .then((events) => {
        addEvents(events);
      })
      .catch((err) => {
        if (!err.aborted) console.warn("Could not load events", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [startYear, endYear, retryTick, addEvents]);

  // While degraded, keep probing the API so the notice clears by itself.
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => {
      forceRefetchRef.current = true;
      setRetryTick((t) => t + 1);
    }, RETRY_MS);
    return () => clearInterval(id);
  }, [degraded]);

  return { storeRef, version, addEvents, loading, degraded, setDegraded };
}
