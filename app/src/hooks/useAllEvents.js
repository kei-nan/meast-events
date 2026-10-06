import { useCallback, useEffect, useRef, useState } from "react";
import { loadAllLite, normalizeEvents } from "../lib/dataClient";

// How often an unreachable source is retried (here and App's full-text index).
export const RETRY_MS = 20000;

// Owns the event store: a ref-held Map of every event (lite records; a record
// gains its full lead when one arrives), filled ONCE from the static
// events/all.<hash>.json - no API call. Everything else (range, viewport,
// filters, drawn areas) is derived from this store locally.
//
// `loading` is true until the lite set has loaded; `error` if it could not be
// loaded (static hosting unreachable) - it is retried every 20 s.
// Mutating the Map doesn't re-render, so `version` changes whenever it gains
// entries: use it as a dependency for derived data.
export default function useAllEvents() {
  const storeRef = useRef(new Map());
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

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
    let cancelled = false;
    loadAllLite()
      .then((events) => {
        if (cancelled) return;
        addEvents(events);
        setError(false);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("Could not load events", err);
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addEvents, retryTick]);

  useEffect(() => {
    if (!error) return;
    const id = setInterval(() => {
      setLoading(true);
      setRetryTick((t) => t + 1);
    }, RETRY_MS);
    return () => clearInterval(id);
  }, [error]);

  return { storeRef, version, addEvents, loading, error };
}
