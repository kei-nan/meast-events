import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView";
import SearchPanel from "./components/SearchPanel.jsx";
import AboutData from "./components/AboutData.jsx";
import Timeline, { MIN_YEAR, MAX_YEAR } from "./components/Timeline";
import useAllEvents from "./hooks/useAllEvents";
import useEventSearch from "./hooks/useEventSearch";
import useUrlState from "./hooks/useUrlState";
import {
  eventOverlapsRange,
  eventYearRange,
  loadEventById,
  loadFullLead,
} from "./lib/dataClient";
import { eventCoords, inBbox, normalizeBounds } from "./lib/geo";
import { countInBbox } from "./lib/localSearch";
import { rankEvents } from "./lib/ranking";
import { parseUrlState } from "./lib/urlState";
import "./App.css";

const RETRY_MS = 20000;
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
  const [about, setAbout] = useState(initial.about);

  // The whole lite event set is loaded ONCE from static data (no API call);
  // range, viewport, filter and area queries are all computed from this store.
  const { storeRef, version, addEvents, loading: eventsLoading, error: eventsError } = useAllEvents();

  // Full-text search is the only thing that needs the API. `degraded` means a
  // search request failed: matching is then local (titles + summaries only) and
  // the API is re-probed every 20 s until it answers again.
  const [degraded, setDegraded] = useState(false);
  const [probeTick, setProbeTick] = useState(0);
  const markOutage = useCallback(() => setDegraded(true), []);
  const markRecovered = useCallback(() => setDegraded(false), []);
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => setProbeTick((t) => t + 1), RETRY_MS);
    return () => clearInterval(id);
  }, [degraded]);

  const visibleEvents = useMemo(
    () =>
      // Includes coordinate-less events (listed, never mapped: MapView skips them).
      [...storeRef.current.values()].filter((e) => eventOverlapsRange(e, startYear, endYear)),
    // version is the signal that the (mutable) store has new entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startYear, endYear, version]
  );

  // Per-year event counts for the timeline density chart, from the store.
  const eventCountsByYear = useMemo(() => {
    const counts = {};
    for (const e of storeRef.current.values()) {
      const y = eventYearRange(e)[0];
      counts[y] = (counts[y] ?? 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const search = useEventSearch({
    query,
    area,
    categories,
    countries,
    storeRef,
    version,
    ready: !eventsLoading,
    degraded,
    probeTick,
    addEvents,
    onOutage: markOutage,
    onRecovered: markRecovered,
  });

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
  // "N events on the map in the current view": local, no request.
  const viewportEventCount = useMemo(
    () => (eventsLoading ? null : countInBbox(visibleEvents, viewportBbox)),
    [eventsLoading, visibleEvents, viewportBbox]
  );

  const selectedEventRaw = selectedEventId ? (storeRef.current.get(selectedEventId) ?? null) : null;

  // Full leads are fetched lazily, only for the opened event (never for lists).
  // id -> {extract, extract_retrieved_at, framing_review} | "error"
  const [leads, setLeads] = useState({});
  const leadRequestedRef = useRef(new Set());
  const needsLead =
    Boolean(selectedEventRaw) &&
    (selectedEventRaw.extract === undefined || selectedEventRaw.framing_review === undefined);
  useEffect(() => {
    if (!needsLead || leadRequestedRef.current.has(selectedEventId)) return;
    const id = selectedEventId;
    leadRequestedRef.current.add(id);
    loadFullLead(id)
      .then((lead) => setLeads((m) => ({ ...m, [id]: lead ?? "error" })))
      .catch(() => {
        leadRequestedRef.current.delete(id); // allow a retry on re-open
        setLeads((m) => ({ ...m, [id]: "error" }));
      });
  }, [needsLead, selectedEventId]);

  const selectedEvent = useMemo(() => {
    const raw = selectedEventRaw;
    if (!raw) return raw;
    const lead = leads[raw.id];
    const full = lead && lead !== "error" ? lead : null;
    // A record that already carries its text (API) only takes the review from the lead file.
    if (raw.extract !== undefined) return full ? { ...raw, framing_review: full.framing_review ?? null } : raw;
    if (full) return { ...raw, ...full };
    // Until the full lead arrives (or if it cannot be fetched) show the snippet, flagged as partial.
    return { ...raw, extract: raw.snippet ?? "", leadStatus: lead === "error" ? "error" : "loading" };
  }, [selectedEventRaw, leads]);

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
    if (!selectedEventId || eventsLoading) return; // wait for the store: no ids.json/chunk requests on a deep link
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
      if (c) setFocus({ id: ev.id, lon: c.lon, lat: c.lat, nonce: ++focusNonceRef.current });
    }
    if (!ev && !triedRef.current.has(selectedEventId)) {
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
  }, [selectedEventId, version, eventsLoading, addEvents, storeRef]);

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
    setAbout(parsed.about);
  }, []);

  useUrlState(
    { q: query, categories, countries, startYear, endYear, scope, area, eventId: selectedEventId, about },
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
      <a
        className="app-skip"
        href="#sp-body"
        onClick={(e) => {
          const input = document.querySelector("#sp-body:not([hidden]) input");
          if (input) {
            e.preventDefault();
            input.focus();
          }
        }}
      >
        Skip to search
      </a>
      <header className="app-header">
        <h1>Middle East, 1900–present</h1>
        <p>A map and timeline of major regional events, sourced from Wikipedia.</p>
        <div className="app-search">
          {viewportEventCount !== null && (
            <span className="app-viewport-count">
              {viewportEventCount.toLocaleString("en-US")} {viewportEventCount === 1 ? "event" : "events"} on the map in the current view
            </span>
          )}
          {eventsLoading && (
            <span className="app-loading" role="status">
              <span className="app-loading-spinner" aria-hidden="true" />
              Loading events…
            </span>
          )}
          {eventsError && !eventsLoading && (
            <span className="app-notice" role="status">
              Events could not be loaded - retrying
            </span>
          )}
          {degraded && search.textSearch && (
            <span className="app-notice" role="status">
              Full-text search is unavailable - matching titles and summaries only
            </span>
          )}
          {notFound && (
            <span className="app-notice" role="status">
              That event could not be found.
            </span>
          )}
        </div>
      </header>
      <main className="app-body">
        <MapView
          events={mapEvents}
          matchIds={matchIds}
          eventsLoading={eventsLoading}
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
          source={search.source ?? "api"}
          eventsLoading={eventsLoading}
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
      </main>
      <Timeline
        startYear={startYear}
        endYear={endYear}
        onChangeRange={handleChangeRange}
        eventCountsByYear={eventCountsByYear}
      />
      {about && <AboutData onClose={() => setAbout(false)} />}
      <footer className="app-footer">
        <button type="button" className="app-footer-link" onClick={() => setAbout(true)}>
          About the data
        </button>
        {" · "}
        Event summaries from Wikipedia (CC BY-SA 4.0). Borders adapted from{" "}
        <a href="https://icr.ethz.ch/data/cshapes/" target="_blank" rel="noreferrer">
          CShapes 2.0
        </a>{" "}
        (Schvitz et al., ETH Zurich, CC BY-NC-SA 4.0) — non-commercial use only —{" "}
        <strong>with corrections and additions by this project</strong>; every changed
        or added shape cites its own source (
        <a
          href="https://github.com/kei-nan/atlas-wiki/blob/main/scripts/boundary-corrections.js"
          target="_blank"
          rel="noreferrer"
        >
          see the corrections list
        </a>
        ).
        Dashed borders mark territory under a mandate, occupation, unrecognized
        annexation, or a since-resolved sovereignty dispute.
      </footer>
    </div>
  );
}
