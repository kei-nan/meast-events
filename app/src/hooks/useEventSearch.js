import { useEffect, useState } from "react";
import { fetchEvents, searchStaticEvents } from "../lib/dataClient";
import useDebouncedValue from "./useDebouncedValue";

const SEARCH_DEBOUNCE_MS = 300;

// Debounced text search over the whole timeline, independent of the range
// slider. Uses the server's full-text index when `live`, otherwise (static
// mode, API down, or a failed search request) a client-side substring match
// over the built-in dataset. Returns the matching ids, or null when no search
// is active. Found events are pushed into the shared store via addEvents.
export default function useEventSearch(query, { live, addEvents, onOutage }) {
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [resultIds, setResultIds] = useState(null);

  useEffect(() => {
    const trimmed = debounced.trim();
    if (!trimmed) return;
    let cancelled = false;
    const search = live
      ? fetchEvents({ q: trimmed })
          .then(({ events }) => events)
          .catch((err) => {
            if (err.outage) onOutage();
            return searchStaticEvents(trimmed);
          })
      : searchStaticEvents(trimmed);

    search
      .then((events) => {
        if (cancelled) return;
        addEvents(events);
        setResultIds(events.map((e) => e.id));
      })
      .catch((err) => console.warn("Search failed", err));

    return () => {
      cancelled = true;
    };
  }, [debounced, live, addEvents, onOutage]);

  // Derived (not reset in the effect) so clearing the box drops results at once.
  return debounced.trim() ? resultIds : null;
}
