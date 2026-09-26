import { useCallback, useEffect, useMemo, useState } from "react";
import MapView from "./components/MapView";
import Timeline, { MIN_YEAR, MAX_YEAR } from "./components/Timeline";
import EventDetail from "./components/EventDetail";
import useDebouncedValue from "./hooks/useDebouncedValue";
import useRangeEvents from "./hooks/useRangeEvents";
import useEventSearch from "./hooks/useEventSearch";
import useViewportCount from "./hooks/useViewportCount";
import { API_ENABLED, eventOverlapsRange, loadEventsIndex } from "./lib/dataClient";
import "./App.css";

const RANGE_DEBOUNCE_MS = 150;

export default function App() {
  const [startYear, setStartYear] = useState(MIN_YEAR);
  const [endYear, setEndYear] = useState(MAX_YEAR);
  const [selectedEventId, setSelectedEventId] = useState(null);

  // Per-year event counts for the timeline density chart: a small precomputed
  // static index covering the whole MIN_YEAR-MAX_YEAR span, loaded once.
  const [eventCountsByYear, setEventCountsByYear] = useState({});
  useEffect(() => {
    let cancelled = false;
    loadEventsIndex()
      .then((counts) => {
        if (!cancelled) setEventCountsByYear(counts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Only the settled range triggers loading; the slider itself still updates
  // startYear/endYear (and therefore the UI) on every input event.
  const debouncedStartYear = useDebouncedValue(startYear, RANGE_DEBOUNCE_MS);
  const debouncedEndYear = useDebouncedValue(endYear, RANGE_DEBOUNCE_MS);
  const { storeRef, version, addEvents, loading, degraded, setDegraded } = useRangeEvents(
    debouncedStartYear,
    debouncedEndYear
  );
  const live = API_ENABLED && !degraded;
  const markOutage = useCallback(() => setDegraded(true), [setDegraded]);

  const visibleEvents = useMemo(
    () =>
      [...storeRef.current.values()].filter((e) => eventOverlapsRange(e, startYear, endYear)),
    // version is the signal that the (mutable) store has new entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startYear, endYear, version]
  );

  // Full-text search over the whole timeline; overrides the range-based event
  // set while a query is active.
  const [searchQuery, setSearchQuery] = useState("");
  const searchResultIds = useEventSearch(searchQuery, { live, addEvents, onOutage: markOutage });

  const [viewportBbox, setViewportBbox] = useState(null);
  const viewportEventCount = useViewportCount({
    bbox: viewportBbox,
    startYear: debouncedStartYear,
    endYear: debouncedEndYear,
    live,
    rangeEvents: visibleEvents,
    onOutage: markOutage,
  });

  const selectedEvent = storeRef.current.get(selectedEventId) ?? null;

  const displayedEvents = useMemo(() => {
    if (searchResultIds === null) return visibleEvents;
    return searchResultIds.map((id) => storeRef.current.get(id)).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents, searchResultIds, version]);

  function handleChangeRange(nextStart, nextEnd) {
    setStartYear(nextStart);
    setEndYear(nextEnd);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Middle East, 1900–present</h1>
        <p>A map and timeline of major regional events, sourced from Wikipedia.</p>
        <div className="app-search">
          <input
            type="search"
            placeholder={live ? "Search events (full text, whole timeline)…" : "Search (built-in dataset)…"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search events"
          />
          {searchResultIds !== null && (
            <span className="app-search-count">
              {searchResultIds.length} result{searchResultIds.length === 1 ? "" : "s"}
            </span>
          )}
          {viewportEventCount !== null && (
            <span className="app-viewport-count">{viewportEventCount} events in current map view</span>
          )}
          {loading && (
            <span className="app-loading" role="status">
              <span className="app-loading-spinner" aria-hidden="true" />
              Loading events…
            </span>
          )}
          {degraded && (
            <span className="app-notice" role="status">
              Live search is unavailable - showing the built-in dataset
            </span>
          )}
        </div>
      </header>
      <div className="app-body">
        <MapView
          events={displayedEvents}
          year={endYear}
          onSelectEvent={setSelectedEventId}
          selectedEventId={selectedEventId}
          onViewportBounds={setViewportBbox}
        />
        <EventDetail event={selectedEvent} onClose={() => setSelectedEventId(null)} />
      </div>
      <Timeline
        startYear={startYear}
        endYear={endYear}
        onChangeRange={handleChangeRange}
        eventCountsByYear={eventCountsByYear}
      />
      <footer className="app-footer">
        Event summaries from Wikipedia (CC BY-SA 4.0). Borders adapted from{" "}
        <a href="https://icr.ethz.ch/data/cshapes/" target="_blank" rel="noreferrer">
          CShapes 2.0
        </a>{" "}
        (Schvitz et al., ETH Zurich, CC BY-NC-SA 4.0) — non-commercial use only —{" "}
        <strong>with corrections and additions by this project</strong>; every changed
        or added shape cites its own source (see <code>scripts/boundary-corrections.js</code>).
        Dashed borders mark territory under a mandate, occupation, unrecognized
        annexation, or a since-resolved sovereignty dispute.
      </footer>
    </div>
  );
}
