import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView";
import SearchPanel from "./components/SearchPanel.jsx";
import Timeline, { MIN_YEAR, MAX_YEAR } from "./components/Timeline";
import useDebouncedValue from "./hooks/useDebouncedValue";
import useRangeEvents from "./hooks/useRangeEvents";
import useEventSearch from "./hooks/useEventSearch";
import useViewportCount from "./hooks/useViewportCount";
import useUrlState from "./hooks/useUrlState";
import {
  API_ENABLED,
  eventOverlapsRange,
  eventYearRange,
  loadEventById,
  loadEventsIndex,
} from "./lib/dataClient";
import { eventCoords, inBbox, normalizeBounds } from "./lib/geo";
import { rankEvents } from "./lib/ranking";
import { parseUrlState } from "./lib/urlState";
import "./App.css";

const RANGE_DEBOUNCE_MS = 150;
const DEEP_LINK_PAD_YEARS = 5;

const clampYear = (y) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, y));

export default function App() {
  // Initial state comes from the (validated) URL so links are shareable.
  const [initial] = useState(() => parseUrlState(window.location.search));
  const [range, setRange] = useState(() => ({
    start: initial.years?.[0] ?? MIN_YEAR,
    end: initial.years?.[1] ?? MAX_YEAR,
  }));
  const startYear = range.start;
  const endYear = range.end;
  const [selectedEventId, setSelectedEventId] = useState(initial.eventId);
  const [hoverId, setHoverId] = useState(null);
  const [focus, setFocus] = useState(null); // {id, lon, lat, nonce}
  const focusNonceRef = useRef(0);
  const pendingFocusRef = useRef(initial.eventId); // deep link awaiting its event
  const [notFound, setNotFound] = useState(false);

  const [query, setQuery] = useState(initial.q);
  const [categories, setCategories] = useState(initial.categories);
  const [countries, setCountries] = useState(initial.countries);
  const [scope, setScope] = useState(initial.scope); // "all" | "range"
  const [inView, setInView] = useState(false); // "only in current map view" (not persisted in the URL)
  const [area, setArea] = useState(initial.area);
  const [areaMode, setAreaMode] = useState("off");

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
  // the range (and therefore the UI) on every input event.
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
      [...storeRef.current.values()].filter(
        (e) => eventCoords(e) && eventOverlapsRange(e, startYear, endYear)
      ),
    // version is the signal that the (mutable) store has new entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startYear, endYear, version]
  );

  const search = useEventSearch({ query, area, categories, countries, live, addEvents, onOutage: markOutage });

  // Results are always computed over the whole timeline; scope only decides
  // which of them are listed/highlighted, and both counts stay visible so
  // nothing is hidden silently.
  const resultsInRange = useMemo(
    () => search.results.filter((e) => eventOverlapsRange(e, startYear, endYear)),
    [search.results, startYear, endYear]
  );
  const [viewportBbox, setViewportBbox] = useState(null);

  // "Only in current map view" is a client-side trim of whatever list is shown.
  const inViewFilter = useCallback(
    (list) => {
      if (!inView || !viewportBbox) return list;
      return list.filter((e) => {
        const c = eventCoords(e);
        return c && inBbox(c, viewportBbox);
      });
    },
    [inView, viewportBbox]
  );
  const scopedResults = useMemo(
    () => inViewFilter(scope === "range" ? resultsInRange : search.results),
    [inViewFilter, scope, resultsInRange, search.results]
  );
  const counts = useMemo(
    () => ({
      all: search.total,
      inRange: resultsInRange.length,
      shown: scopedResults.length,
      truncated: search.truncated,
    }),
    [search.total, search.truncated, resultsInRange.length, scopedResults.length]
  );

  const handleViewportChange = useCallback((bounds) => setViewportBbox(normalizeBounds(bounds)), []);
  const viewportEventCount = useViewportCount({
    bbox: viewportBbox,
    startYear: debouncedStartYear,
    endYear: debouncedEndYear,
    live,
    rangeEvents: visibleEvents,
    onOutage: markOutage,
  });

  const selectedEventRaw = selectedEventId ? (storeRef.current.get(selectedEventId) ?? null) : null;
  const selectedEvent = useMemo(
    () =>
      selectedEventRaw && selectedEventRaw.extract === undefined
        ? { ...selectedEventRaw, extract: selectedEventRaw.snippet ?? "" }
        : selectedEventRaw,
    [selectedEventRaw]
  );

  // Map events: everything in the selected years, plus search matches outside
  // them (scope "all"), plus the selected event. matchIds dims the rest.
  const mapEvents = useMemo(() => {
    const byId = new Map(visibleEvents.map((e) => [e.id, e]));
    for (const e of scopedResults) if (!byId.has(e.id)) byId.set(e.id, e);
    if (selectedEventRaw && !byId.has(selectedEventRaw.id)) byId.set(selectedEventRaw.id, selectedEventRaw);
    return [...byId.values()];
  }, [visibleEvents, scopedResults, selectedEventRaw]);

  const matchIds = useMemo(() => {
    if (search.status === "idle") return null;
    if (search.status !== "ready" && scopedResults.length === 0) return null; // don't dim everything while loading/erroring
    return new Set(scopedResults.map((e) => e.id));
  }, [search.status, scopedResults]);

  // What the panel lists: idle => the chronological browse list for the
  // selected years (capped for rendering; `total` stays exact); otherwise the
  // ranked search results in the chosen scope.
  const BROWSE_CAP = 500;
  const browseList = useMemo(
    () => (search.status === "idle" ? inViewFilter(rankEvents(visibleEvents, "")) : null),
    [search.status, inViewFilter, visibleEvents]
  );
  const panelResults = browseList ? browseList.slice(0, BROWSE_CAP) : scopedResults;
  const panelTotal = browseList
    ? browseList.length
    : scope === "all" && !inView && search.truncated
      ? search.total
      : scopedResults.length;

  const filters = useMemo(
    () => ({ categories, countries, scope, inView }),
    [categories, countries, scope, inView]
  );
  const handleFiltersChange = useCallback((next) => {
    setCategories(next.categories ?? []);
    setCountries(next.countries ?? []);
    setScope(next.scope === "range" ? "range" : "all");
    setInView(Boolean(next.inView));
  }, []);

  // Available filter options, from what has been loaded so far.
  const { categoryOptions, countryOptions } = useMemo(() => {
    const cat = new Map();
    const cty = new Map();
    for (const e of storeRef.current.values()) {
      if (e.category) cat.set(e.category, (cat.get(e.category) ?? 0) + 1);
      for (const c of e.countries ?? []) cty.set(c, (cty.get(c) ?? 0) + 1);
    }
    const toList = (m) => [...m.keys()].sort((a, b) => a.localeCompare(b));
    return { categoryOptions: toList(cat), countryOptions: toList(cty) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Deep link / selection resolution: make sure the selected event is in the
  // store with its full record, and (for links) move the range + focus it.
  const triedRef = useRef(new Set());
  useEffect(() => {
    if (!selectedEventId) return;
    const ev = storeRef.current.get(selectedEventId);
    if (ev && pendingFocusRef.current === selectedEventId) {
      pendingFocusRef.current = null;
      const c = eventCoords(ev);
      const [s] = eventYearRange(ev);
      const y = clampYear(s);
      setRange((r) =>
        eventOverlapsRange(ev, r.start, r.end)
          ? r
          : { start: clampYear(y - DEEP_LINK_PAD_YEARS), end: clampYear(y + DEEP_LINK_PAD_YEARS) }
      );
      setFocus({ id: ev.id, lon: c.lon, lat: c.lat, nonce: ++focusNonceRef.current });
    }
    if ((!ev || ev.extract === undefined) && !triedRef.current.has(selectedEventId)) {
      triedRef.current.add(selectedEventId);
      loadEventById(selectedEventId)
        .then((full) => {
          if (full) addEvents([full]);
          else if (!storeRef.current.has(selectedEventId)) {
            pendingFocusRef.current = null;
            setSelectedEventId(null);
            setNotFound(true);
          }
        })
        .catch(() => {});
    }
  }, [selectedEventId, version, addEvents, storeRef]);

  // Back/forward: re-apply the parsed URL to every piece of state.
  const handleNavigate = useCallback((parsed) => {
    setQuery(parsed.q);
    setCategories(parsed.categories);
    setCountries(parsed.countries);
    setScope(parsed.scope);
    setArea(parsed.area);
    setRange({ start: parsed.years?.[0] ?? MIN_YEAR, end: parsed.years?.[1] ?? MAX_YEAR });
    pendingFocusRef.current = parsed.eventId;
    setNotFound(false);
    setSelectedEventId(parsed.eventId);
  }, []);

  useUrlState(
    { q: query, categories, countries, startYear, endYear, scope, area, eventId: selectedEventId },
    handleNavigate
  );

  function handleChangeRange(nextStart, nextEnd) {
    setRange({ start: nextStart, end: nextEnd });
  }

  // Map click: select only. List click: select AND fly the map there.
  const handleSelectFromMap = useCallback((id) => {
    setNotFound(false);
    setSelectedEventId(id);
  }, []);
  const handleSelectFromList = useCallback(
    (id) => {
      setNotFound(false);
      setSelectedEventId(id);
      const ev = storeRef.current.get(id);
      const c = ev && eventCoords(ev);
      if (c) setFocus({ id, lon: c.lon, lat: c.lat, nonce: ++focusNonceRef.current });
    },
    [storeRef]
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>Middle East, 1900–present</h1>
        <p>A map and timeline of major regional events, sourced from Wikipedia.</p>
        <div className="app-search">
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
          {notFound && (
            <span className="app-notice" role="status">
              That event could not be found.
            </span>
          )}
        </div>
      </header>
      <div className="app-body">
        <MapView
          events={mapEvents}
          matchIds={matchIds}
          year={endYear}
          selectedEventId={selectedEventId}
          hoverId={hoverId}
          focus={focus}
          areaMode={areaMode}
          area={area}
          onAreaModeChange={setAreaMode}
          onAreaChange={setArea}
          onViewportChange={handleViewportChange}
          onSelectEvent={handleSelectFromMap}
        />
        <SearchPanel
          query={query}
          filters={filters}
          area={area}
          areaMode={areaMode}
          status={search.status}
          results={panelResults}
          total={panelTotal}
          source={search.source ?? (live ? "api" : "static")}
          selectedEvent={selectedEvent}
          viewCount={viewportEventCount}
          range={[startYear, endYear]}
          categoryOptions={categoryOptions}
          countryOptions={countryOptions}
          onQueryChange={setQuery}
          onFiltersChange={handleFiltersChange}
          onAreaModeChange={setAreaMode}
          onAreaChange={setArea}
          onSelect={handleSelectFromList}
          onHover={setHoverId}
          onBack={() => setSelectedEventId(null)}
          // Extras beyond the agreed props (ignored if unused):
          counts={counts}
          truncated={search.truncated}
          interim={search.interim}
          hoverId={hoverId}
          selectedEventId={selectedEventId}
        />
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
