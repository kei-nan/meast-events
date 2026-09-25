import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView";
import Timeline, { MIN_YEAR, MAX_YEAR } from "./components/Timeline";
import EventDetail from "./components/EventDetail";
import useDebouncedValue from "./hooks/useDebouncedValue";
import {
  decadesInRange,
  loadEventDecade,
  loadEventsIndex,
  prefetchEventDecade,
} from "./lib/dataClient";
import "./App.css";

const RANGE_DEBOUNCE_MS = 150;

function eventYearRange(e) {
  const start = Number(e.date_start.slice(0, 4));
  const end = e.date_end ? Number(e.date_end.slice(0, 4)) : start;
  return [start, end];
}

export default function App() {
  const [startYear, setStartYear] = useState(MIN_YEAR);
  const [endYear, setEndYear] = useState(MAX_YEAR);
  const [selectedEventId, setSelectedEventId] = useState(null);

  // Per-year event counts for the timeline density chart. This is a small,
  // precomputed index (public/data/events/index.json) covering the whole
  // MIN_YEAR-MAX_YEAR span, loaded once - it must not depend on which decade
  // chunks of full event data happen to be loaded, since the density chart
  // always shows the entire timeline regardless of the current range.
  const [eventCountsByYear, setEventCountsByYear] = useState({});
  useEffect(() => {
    let cancelled = false;
    loadEventsIndex().then((counts) => {
      if (!cancelled) setEventCountsByYear(counts);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Accumulates every event object ever fetched, across every decade chunk
  // loaded so far - entries are never evicted, so re-widening the range back
  // over an already-visited decade is instant (no re-fetch). `version` just
  // exists to force a re-render when the ref's contents change, since mutating
  // a Map in place doesn't trigger React state updates on its own.
  const eventsByIdRef = useRef(new Map());
  const [eventsVersion, setEventsVersion] = useState(0);

  // Only the settled range triggers new network requests; the slider itself
  // still updates startYear/endYear (and therefore the UI) on every input event.
  const debouncedStartYear = useDebouncedValue(startYear, RANGE_DEBOUNCE_MS);
  const debouncedEndYear = useDebouncedValue(endYear, RANGE_DEBOUNCE_MS);

  useEffect(() => {
    const decades = decadesInRange(debouncedStartYear, debouncedEndYear);
    let cancelled = false;

    Promise.all(decades.map((d) => loadEventDecade(d))).then((chunks) => {
      if (cancelled) return;
      let changed = false;
      for (const chunk of chunks) {
        for (const event of chunk) {
          if (!eventsByIdRef.current.has(event.id)) {
            eventsByIdRef.current.set(event.id, event);
            changed = true;
          }
        }
      }
      if (changed) setEventsVersion((v) => v + 1);
    });

    // Warm the cache for the decades just outside the current range so
    // dragging the slider one more notch rarely has to wait on a fresh fetch.
    const allDecades = decadesInRange(MIN_YEAR, MAX_YEAR);
    const minD = Math.min(...decades);
    const maxD = Math.max(...decades);
    const before = Math.max(...allDecades.filter((d) => d < minD), -Infinity);
    const after = Math.min(...allDecades.filter((d) => d > maxD), Infinity);
    if (Number.isFinite(before)) prefetchEventDecade(before);
    if (Number.isFinite(after)) prefetchEventDecade(after);

    return () => {
      cancelled = true;
    };
  }, [debouncedStartYear, debouncedEndYear]);

  const visibleEvents = useMemo(() => {
    const events = [...eventsByIdRef.current.values()];
    return events.filter((e) => {
      const [eStart, eEnd] = eventYearRange(e);
      return eStart <= endYear && eEnd >= startYear;
    });
    // eventsVersion is a deliberate dependency: it's the signal that the
    // (mutable) eventsByIdRef map has new entries worth re-filtering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startYear, endYear, eventsVersion]);

  const selectedEvent = eventsByIdRef.current.get(selectedEventId) ?? null;

  function handleChangeRange(nextStart, nextEnd) {
    setStartYear(nextStart);
    setEndYear(nextEnd);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Middle East, 1900–present</h1>
        <p>A map and timeline of major regional events, sourced from Wikipedia.</p>
      </header>
      <div className="app-body">
        <MapView
          events={visibleEvents}
          year={endYear}
          onSelectEvent={setSelectedEventId}
          selectedEventId={selectedEventId}
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
