import { useCallback, useEffect, useRef, useState } from "react";
import { API_ENABLED, fetchEvents, loadStaticEvents } from "../lib/dataClient";

const RETRY_MS = 20000;

// Owns the accumulated event store (every event ever loaded, never evicted, so
// revisiting a range is instant) and fills it for the settled [start,end]
// range with ONE API request per range. Ranges already covered by a previous
// successful fetch are served from the store without a request. If the API
// fails or times out, the range is filled from the static chunks instead and
// `degraded` turns on; the next range change (or a periodic retry) tries the
// API again and clears it on success.
//
// The store is a ref-held Map (mutating it doesn't re-render), so `version`
// changes whenever it gains entries - use it as a dependency for derived data.
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
    for (const event of events) {
      if (!storeRef.current.has(event.id)) {
        storeRef.current.set(event.id, event);
        changed = true;
      }
    }
    if (changed) setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const lo = Math.min(startYear, endYear);
    const hi = Math.max(startYear, endYear);
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
      ? fetchEvents({ start: lo, end: hi }).then(({ events }) => {
          fetchedRangesRef.current.push([lo, hi]);
          if (!cancelled) setDegraded(false);
          return events;
        })
      : loadStaticEvents(lo, hi);

    source
      .catch((err) => {
        if (!API_ENABLED) throw err;
        if (!cancelled) setDegraded(true);
        return loadStaticEvents(lo, hi);
      })
      .then((events) => {
        addEvents(events);
      })
      .catch((err) => console.warn("Could not load events", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
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
