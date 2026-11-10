import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AboutDataFailed } from "./components/LoadFailed.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { importOr } from "./lib/importOr.js";
import { loadEventDetail } from "./lib/lazyChunks.js";
import MapLoading from "./components/MapLoading.jsx";
import SearchPanel from "./components/SearchPanel.jsx";
import ShareButton from "./components/ShareButton.jsx";
import Timeline from "./components/Timeline";
import useAllEvents, { RETRY_MS } from "./hooks/useAllEvents";
import useEventSearch from "./hooks/useEventSearch";
import useUrlState from "./hooks/useUrlState";
import useMapStart from "./hooks/useMapStart";
import useEventLead from "./hooks/useEventLead";
import { eventOverlapsRange, eventYearRange, prefetchFullLead } from "./lib/dataClient";
import { eventYearsText } from "./lib/eventYears";
import { eventBorderYear, needsCountryShading } from "./lib/eventCountries";
import { eventCoords, inBbox, makeCircleArea, normalizeBounds } from "./lib/geo";
import { roundPlace } from "./lib/placeParam.js";
import { NEARBY_KM } from "./lib/related.js";
import { countInBbox } from "./lib/localSearch";
import { orderBrowseList } from "./lib/browseOrder";
import { rankEvents } from "./lib/ranking";
import { countEventsByStartYear } from "./lib/yearCounts";
import { ShareLinkContext } from "./lib/shareLinkContext.js";
import { canonicalPath, mapViewToParam, parseMapView, parseUrlState, shareLink } from "./lib/urlState";
import { MAX_YEAR, MIN_YEAR } from "./lib/years";
import "./App.css";

// MapLibre is ~1.1 MB of JS (about 80% of the app's code), so the map is loaded
// as its own chunk: the header, panel and timeline paint without waiting for it.
// If the chunk cannot be downloaded (retried once, then the page reloads once: a
// tab older than a deploy), the map area says so instead of the whole app failing
// (lib/importOr.js).
// Both stand-ins report "failed" (onMapStatus), so the panel's controls that
// need the map are disabled (lib/mapUnavailable.js). This one gets MapView's
// props, through lazy().
function MapViewFailed({ onMapStatus }) {
  useEffect(() => onMapStatus?.("failed"), [onMapStatus]);
  return (
    <div className="map-view map-placeholder" role="alert">
      The map could not be loaded. Please reload the page.
    </div>
  );
}
// The map failed after its code loaded: most often MapLibre cannot start
// without WebGL 2 (turned off, or not supported by the browser or device),
// which a reload does not change. Only the map area says so (ErrorBoundary
// below); search, the list, the events and the timeline keep working.
function hasWebGL2() {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}
function MapViewCrashed({ onMapStatus }) {
  useEffect(() => onMapStatus?.("failed"), [onMapStatus]);
  return (
    <div className="map-view map-placeholder" role="alert">
      {hasWebGL2()
        ? "The map stopped working because of an error. Please reload the page."
        : "The map needs WebGL 2, which this browser has turned off or does not support."}{" "}
      Search, the event list and the timeline still work.
    </div>
  );
}
// The map chunk is requested as soon as this module runs, not when React first
// renders <MapView>: the lazy() import below then reuses the same download.
// Measured (2026-10, slow 4G 1.6 Mbps/150 ms, 4x CPU, phone, cache off, median
// of 9): requested at 1.39 s instead of 1.65 s, the map uncovered ~35-55 ms
// sooner, first paint unchanged. A <link rel=modulepreload> in index.html would
// start it at 0.2 s, but it shares the bandwidth with index.js: first paint
// 1.58 -> 2.06 s and the result list 1.63 -> 2.06 s, for the map ~0.3 s sooner.
// A failure here is ignored: importOr reports and retries it.
import("./components/MapView").catch(() => {});
const MapView = lazy(() => importOr(() => import("./components/MapView"), MapViewFailed));
// Opened from the footer or a link only, so its code loads on first use.
const AboutData = lazy(() => importOr(() => import("./components/AboutData.jsx"), AboutDataFailed));

const SITE_TITLE = "Middle East, 1900–present"; // as in index.html

// Map focus for an opened event: fly to its marker, or - for an event without
// a precise location - fit the map to its shaded countries (MapView's
// countryHighlight.js; it falls back to the capital pin when no country has a
// shape that year). null = nothing to focus.
function focusFor(ev, nonceRef) {
  const c = eventCoords(ev);
  const fitCountries = needsCountryShading(ev);
  if (!c && !fitCountries) return null;
  return { id: ev.id, lon: c?.lon, lat: c?.lat, fitCountries, countries: ev.countries, nonce: ++nonceRef.current };
}

export default function App() {
  // Initial state comes from the (validated) URL so links are shareable.
  const [initial] = useState(() => parseUrlState(window.location.search, window.location.pathname));
  const [range, setRange] = useState(() => ({
    start: initial.years?.[0] ?? MIN_YEAR,
    end: initial.years?.[1] ?? MAX_YEAR,
  }));
  const startYear = range.start;
  const endYear = range.end;
  const [selectedEventId, setSelectedEventId] = useState(initial.eventId);
  const [hoverId, setHoverId] = useState(null);
  // "What was this place?" ({lon, lat}, lib/placeParam.js), shown in the panel while no event is open.
  const [place, setPlace] = useState(initial.place);
  // The map's camera ({lon, lat, zoom}, lib/urlState.js `m`) once it has been
  // moved, for the link: a link that has one opens the map there (MapView
  // initialView). It then wins over the flight an event or place link would
  // otherwise make to its point: the view was shared as it was seen, event and all.
  const [mapView, setMapView] = useState(initial.mapView);
  // Sea, then the land as soon as land.json is in (components/MapLoading.jsx),
  // in the view the map will open on. One element, so a re-render keeps it.
  const mapPlaceholder = useMemo(() => <MapLoading view={initial.mapView} />, [initial]);
  // Kept as the link writes it (rounded), so a move too small to change the link re-renders nothing.
  const handleCameraChange = useCallback((next) => {
    const param = mapViewToParam(next);
    if (!param) return;
    setMapView((prev) => (mapViewToParam(prev) === param ? prev : parseMapView(param)));
  }, []);
  // {id, lon, lat, nonce}; a place link (no event) opens with the map on its point.
  const [focus, setFocus] = useState(() =>
    initial.place && !initial.eventId && !initial.mapView
      ? { id: null, lon: initial.place.lon, lat: initial.place.lat, nonce: -1 }
      : null
  );
  const focusNonceRef = useRef(0);
  // A deep link (or Back/Forward) awaiting its event, to fly to it once loaded;
  // not a link with its own camera (above).
  const pendingFocusRef = useRef(initial.mapView ? null : initial.eventId);
  const selectedIdRef = useRef(initial.eventId); // for handleNavigate
  useEffect(() => {
    selectedIdRef.current = selectedEventId;
  }, [selectedEventId]);
  const panelRef = useRef(null); // SearchPanel's skipTo (skip link)
  // The id of an event link that leads to no event: the panel says so (SearchPanel) until the next search or
  // selection.
  const [notFoundId, setNotFoundId] = useState(null);
  const [playState, setPlayState] = useState("stopped"); // timeline Play, see Timeline (SearchPanel holds its announcements)

  const [query, setQueryState] = useState(initial.q);
  // A search (typed, cleared, or "Search instead") retires the "no such event" notice.
  const setQuery = useCallback((q) => {
    setNotFoundId(null);
    setQueryState(q);
  }, []);
  const [categories, setCategories] = useState(initial.categories);
  const [countries, setCountries] = useState(initial.countries);
  const [scope, setScope] = useState(initial.scope); // "all" | "range"
  const [inView, setInView] = useState(false); // "only in current map view" (not persisted in the URL)
  const [area, setArea] = useState(initial.area);
  const [areaMode, setAreaMode] = useState("off");
  const [about, setAbout] = useState(initial.about);
  const [sort, setSort] = useState(initial.sort); // browse list order, lib/browseOrder.js SORTS ("coverage" = default)
  const [view, setView] = useState(initial.view); // results panel: "list" | "timeline" (lib/timelineView.js)
  const [aboutSection, setAboutSection] = useState(null); // "credits": the dialog opens at its credits
  // Close and Escape close the native <dialog>, which puts focus back on what
  // opened it. Back (handleNavigate) unmounts it without close(), so focus would
  // fall to <body>: what opened it is kept here and given focus back then.
  const aboutOpenerRef = useRef(null);
  const noteAboutOpener = () => {
    const active = document.activeElement;
    if (active?.closest?.(".about-dialog")) return; // already open: keep the first opener
    aboutOpenerRef.current = active && active !== document.body ? active : null;
  };
  const openAbout = useCallback((section) => {
    noteAboutOpener();
    setAboutSection(section);
    setAbout(true);
  }, []);
  const aboutWasOpenRef = useRef(about);
  useEffect(() => {
    if (about) {
      aboutWasOpenRef.current = true;
      return;
    }
    if (!aboutWasOpenRef.current) return;
    aboutWasOpenRef.current = false;
    const opener = aboutOpenerRef.current;
    aboutOpenerRef.current = null;
    const active = document.activeElement;
    if ((!active || active === document.body) && opener?.isConnected) opener.focus({ preventScroll: true });
  }, [about]);

  // When the map mounts (after the first paint), and whether it is unavailable (hooks/useMapStart.js).
  const { mapStarted, mapUnavailable, handleMapStatus } = useMapStart();
  // An event link: the event's detail record, and the code of the view that
  // shows it (its own chunk, lib/lazyChunks.js), download alongside the event
  // list instead of after it.
  useEffect(() => {
    if (!initial.eventId) return;
    prefetchFullLead(initial.eventId);
    loadEventDetail().catch(() => {}); // SearchPanel's lazy() retries and reports a failure
  }, [initial]);

  // The whole lite event set is loaded ONCE from static data (no API call);
  // range, viewport, filter and area queries are all computed from this store.
  const { storeRef, version, loading: eventsLoading, error: eventsError } = useAllEvents();

  // Full-text search is the only thing that needs more than the store: a static
  // index (lib/textSearch.js). `degraded` means it could not be loaded: matching
  // is then local (titles + summaries only) and it is retried every 20 s.
  const [degraded, setDegraded] = useState(false);
  const [probeTick, setProbeTick] = useState(0);
  const markOutage = useCallback(() => setDegraded(true), []);
  const markRecovered = useCallback(() => setDegraded(false), []);
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => setProbeTick((t) => t + 1), RETRY_MS);
    return () => clearInterval(id);
  }, [degraded]);

  // Every event, in browse (chronological) order, sorted once per data load:
  // filtering it keeps that order, so a timeline step never re-sorts (rankEvents).
  const chronological = useMemo(
    () => rankEvents([...storeRef.current.values()], ""),
    // version is the signal that the (mutable) store has new entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );

  const visibleEvents = useMemo(
    () =>
      // Includes coordinate-less events (listed, never mapped: MapView skips them).
      chronological.filter((e) => eventOverlapsRange(e, startYear, endYear)),
    [chronological, startYear, endYear]
  );

  // Per-year event counts for the timeline density chart, from the store, by
  // start year (date_start) as everywhere else (lib/yearCounts.js).
  const eventCountsByYear = useMemo(
    () => countEventsByStartYear(storeRef.current.values()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );

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
  // With it off the view is not read, so panning does not rebuild the lists.
  const inViewBbox = inView ? viewportBbox : null;
  const inViewFilter = useCallback(
    (list) => {
      if (!inViewBbox) return list;
      return list.filter((e) => {
        const c = eventCoords(e);
        return c && inBbox(c, inViewBbox);
      });
    },
    [inViewBbox]
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
      unfiltered: search.unfilteredTotal ?? null, // the text's matches without category/country/area filters
    }),
    [search.total, search.truncated, search.unfilteredTotal, resultsInRange.length, scopedResults.length]
  );

  const handleViewportChange = useCallback((bounds) => setViewportBbox(normalizeBounds(bounds)), []);
  // The panel's "N in view" count: local, no request.
  const viewportEventCount = useMemo(
    () => (eventsLoading ? null : countInBbox(visibleEvents, viewportBbox)),
    [eventsLoading, visibleEvents, viewportBbox]
  );

  const selectedEventRaw = selectedEventId ? (storeRef.current.get(selectedEventId) ?? null) : null;

  // While an event is open the map shows the borders of the event's own year
  // (eventBorderYear: its start year), not the timeline's end year, unless the
  // user chose the range end under "Borders as of" for this event, or pressed
  // Play (so playback visibly moves the map). The range is left alone.
  const [timelineBordersFor, setTimelineBordersFor] = useState(null); // event id
  const eventYear = selectedEventRaw ? eventBorderYear(selectedEventRaw, MIN_YEAR, MAX_YEAR) : null;
  const eventYearLabel = selectedEventRaw && eventYearRange(selectedEventRaw)[1] > eventYear ? "event start" : "event";
  const borderYear = eventYear != null && timelineBordersFor !== selectedEventId ? eventYear : null;
  const chooseBorderYear = useCallback(
    (which) => setTimelineBordersFor(which === "range" ? selectedEventId : null),
    [selectedEventId]
  );
  const handlePlayState = useCallback(
    (next) => {
      if (next === "playing" && selectedEventId) setTimelineBordersFor(selectedEventId);
      setPlayState(next);
    },
    [selectedEventId]
  );
  // Countries shaded on the map: the hovered list row's, else the open event's,
  // for events without a precise location only.
  const hoverEvent = hoverId ? (storeRef.current.get(hoverId) ?? null) : null;
  const highlightEvent = [hoverEvent, selectedEventRaw].find(needsCountryShading) ?? null;

  // The open event with its full lead, fetched lazily (hooks/useEventLead.js).
  const { selectedEvent, retryLead } = useEventLead(selectedEventRaw, selectedEventId);

  // While the text is still being typed the map keeps its last dimming: each
  // keystroke would otherwise re-send every marker whose match changed to the
  // map's worker (over a thousand at 8,000 events). It updates once the text
  // settles (useEventSearch's debounce), and at once for filters or a cleared search.
  // The matches it adds outside the years (mapEvents) wait for the same pause:
  // otherwise each keystroke built a new mapEvents and re-rendered the whole
  // map (MapView, its toolbar and key) for markers the next keystroke replaced.
  const lastMatchIdsRef = useRef(null);
  const typing = search.typing;
  const lastMapResultsRef = useRef(scopedResults);
  const mapResults = useMemo(
    () => (typing ? lastMapResultsRef.current : scopedResults),
    [typing, scopedResults]
  );
  useEffect(() => {
    lastMapResultsRef.current = mapResults;
  }, [mapResults]);

  // Map events: everything in the selected years, plus search matches outside
  // them (scope "all"), plus the selected event. matchIds dims the rest.
  const mapEvents = useMemo(() => {
    const byId = new Map(visibleEvents.map((e) => [e.id, e]));
    for (const e of mapResults) if (!byId.has(e.id)) byId.set(e.id, e);
    if (selectedEventRaw && !byId.has(selectedEventRaw.id)) byId.set(selectedEventRaw.id, selectedEventRaw);
    return [...byId.values()];
  }, [visibleEvents, mapResults, selectedEventRaw]);

  const matchIds = useMemo(() => {
    if (search.status === "idle") return null;
    if (typing) return lastMatchIdsRef.current;
    if (search.status !== "ready" && scopedResults.length === 0) return null; // don't dim everything while loading/erroring
    return new Set(scopedResults.map((e) => e.id));
  }, [search.status, scopedResults, typing]);
  useEffect(() => {
    lastMatchIdsRef.current = matchIds;
  }, [matchIds]);

  // What the panel lists: idle => the browse list for the selected years
  // (events starting in them first, then ones ongoing from earlier, each most
  // covered first or by date; see lib/browseOrder.js); otherwise the ranked
  // search results in the chosen scope. ResultsList renders 50 rows at a time
  // ("Show more"), so the whole list stays reachable.
  const browseList = useMemo(
    () => (search.status === "idle" ? inViewFilter(orderBrowseList(visibleEvents, [startYear, endYear], sort)) : null),
    [search.status, inViewFilter, visibleEvents, startYear, endYear, sort]
  );
  // Memoized (like range below) so a hover re-render of App passes the memoized
  // ResultsList the same props and it skips rendering.
  const panelResults = useMemo(
    () => browseList ?? scopedResults,
    [browseList, scopedResults]
  );
  // A hovered row that leaves the list (typing, a filter, Play) unmounts without
  // its mouseleave: the hover and its map shading end with it. Set during render
  // (React re-renders at once, before anything is drawn).
  if (hoverId && !panelResults.some((e) => e.id === hoverId)) setHoverId(null);
  const panelRange = useMemo(() => [startYear, endYear], [startYear, endYear]);
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

  // Back/forward: re-apply the parsed URL to every piece of state. Play pauses:
  // its next step would move the restored years and overwrite the entry. Area
  // drawing is disarmed (an armed mode would take the next map drag); "only in
  // current map view" is not in the URL and stays as it is. So does the map's
  // view: an entry's `m` is not flown to (the map would jump on every Back), and
  // the entry then gets the camera as it is (mapView is left as it is, so the
  // write that follows is a debounced replace).
  const handleNavigate = useCallback((parsed) => {
    setPlayState((p) => (p === "playing" ? "paused" : p));
    setAreaMode("off");
    setQueryState(parsed.q);
    setCategories(parsed.categories);
    setCountries(parsed.countries);
    setScope(parsed.scope);
    setArea(parsed.area);
    setRange({ start: parsed.years?.[0] ?? MIN_YEAR, end: parsed.years?.[1] ?? MAX_YEAR });
    // Focus only an event this entry opens, not one that stays open.
    if (parsed.eventId !== selectedIdRef.current) pendingFocusRef.current = parsed.eventId;
    setNotFoundId(null);
    setSelectedEventId(parsed.eventId);
    setAboutSection(null);
    if (parsed.about) noteAboutOpener(); // Forward onto an About entry
    setAbout(parsed.about);
    setSort(parsed.sort);
    setView(parsed.view);
    setPlace(parsed.place);
  }, []);

  const urlState = { q: query, categories, countries, startYear, endYear, scope, area, eventId: selectedEventId, about, sort, view, place, mapView };
  const replaceNextUrl = useUrlState(urlState, handleNavigate);

  // Share links come from the state as it is now, not the address bar: URL
  // writes are debounced (hooks/useUrlState.js) and Play steps faster than that.
  // An open event's link is its own page, /event/<id> (lib/urlState.js shareLink).
  const urlStateRef = useRef(urlState);
  useEffect(() => {
    urlStateRef.current = urlState;
  });
  const getShareLink = useCallback(() => shareLink(window.location.origin, urlStateRef.current), []);

  // <link rel="canonical"> and og:url follow the open event, as a fresh load of
  // the URL would have them (index.html, or the event's page written by
  // scripts/build-event-pages.mjs): some share menus (Chrome on Android) send the
  // canonical link instead of the address bar. Their origin is the one the page
  // was served with (the production site, also on branch previews).
  const canonical = canonicalPath({ eventId: selectedEventId });
  useEffect(() => {
    const link = document.querySelector('link[rel="canonical"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (!link) return;
    const href = new URL(canonical, link.href).href;
    link.href = href;
    ogUrl?.setAttribute("content", href);
  }, [canonical]);

  // Deep link / selection resolution: make sure the selected event is in the
  // store with its full record, and (for links and Back/Forward) focus it. The
  // range is the URL's own and is left alone: the map shows the event's year
  // (borderYear) and its marker whatever the range (mapEvents).
  // An id that cannot be resolved is cleared by REPLACING the URL, so Back does
  // not lead to the dead link again.
  useEffect(() => {
    // A focus pending for another event is stale: it must not fly the map when
    // that event is opened later (from the map, which only selects).
    if (pendingFocusRef.current !== selectedEventId) pendingFocusRef.current = null;
    if (!selectedEventId || eventsLoading) return; // wait for the store
    const markNotFound = () => {
      pendingFocusRef.current = null;
      replaceNextUrl();
      setSelectedEventId(null);
      setNotFoundId(selectedEventId);
    };
    const ev = storeRef.current.get(selectedEventId);
    if (ev && pendingFocusRef.current === selectedEventId) {
      pendingFocusRef.current = null;
      const f = focusFor(ev, focusNonceRef);
      if (f) setFocus(f);
    }
    // The full lite set is every event in the dataset: once it has loaded, an
    // id missing from it is unknown. If it could not be loaded, the link stays
    // pending until useAllEvents' retry succeeds (version changes).
    if (!ev && !eventsError) markNotFound();
  }, [selectedEventId, version, eventsLoading, eventsError, storeRef, replaceNextUrl]);

  const handleChangeRange = useCallback((nextStart, nextEnd) => {
    setRange({ start: nextStart, end: nextEnd });
  }, []);
  // Opening or closing an event hides the row under the pointer, so its
  // mouseleave never comes: the hover (and its map shading) is cleared here.
  const handleBack = useCallback(() => {
    setHoverId(null);
    setSelectedEventId(null);
  }, []);

  // MapView keeps the open event's pin in sight of what covers the map (on
  // phones the sheet, at half height for an opened event): a new {nonce, center}
  // nudges it inside (center: false) or puts it in the middle (center: true).
  const [keepPin, setKeepPin] = useState(null);

  // Map click: select only (the map keeps its zoom; the pin is only nudged out
  // from under the phone sheet that opens over it). List click: select AND fly
  // the map there. An event opened while Play runs gets the range end's
  // borders, as pressing Play with it open does (handlePlayState), so playback
  // keeps visibly moving the map.
  const handleSelectFromMap = useCallback(
    (id) => {
      setNotFoundId(null);
      setHoverId(null);
      setSelectedEventId(id);
      setKeepPin((k) => ({ nonce: (k?.nonce ?? 0) + 1, center: false }));
      if (playState === "playing") setTimelineBordersFor(id);
    },
    [playState]
  );
  const handleSelectFromList = useCallback(
    (id) => {
      setNotFoundId(null);
      setHoverId(null);
      setSelectedEventId(id);
      if (playState === "playing") setTimelineBordersFor(id);
      const ev = storeRef.current.get(id);
      const f = ev && focusFor(ev, focusNonceRef);
      if (f) setFocus(f);
    },
    [storeRef, playState]
  );
  // The phone's "Find on map": the camera aimed the event at the strip above the
  // open sheet, so as the sheet drops to its peek bar it is aimed again, at the
  // map now in sight (lib/mapInsets.js).
  const handleRefocus = useCallback(() => {
    const ev = selectedEventId && storeRef.current.get(selectedEventId);
    const f = ev && focusFor(ev, focusNonceRef);
    if (f) setFocus(f);
  }, [storeRef, selectedEventId]);
  // The phone sheet moved with an event open: MapView keeps its pin in sight,
  // and centres it in the map when the sheet went down to its bar ("Show map").
  const handleSheetMove = useCallback(
    (sheet) => setKeepPin((k) => ({ nonce: (k?.nonce ?? 0) + 1, center: sheet === "peek" })),
    []
  );

  // "What was this place?": opened from the border popup (the clicked point) or
  // an open event (its point), which it replaces in the panel; an event opened
  // from it shows over it, and Back returns to it. Each is a history entry
  // (lib/urlState.js urlWriteMode).
  const openPlace = useCallback((p) => {
    setNotFoundId(null);
    setHoverId(null);
    setSelectedEventId(null);
    setPlace(roundPlace(p));
  }, []);
  const closePlace = useCallback(() => setPlace(null), []);
  const placeView = useMemo(() => {
    if (!place) return null;
    return {
      place,
      events: chronological,
      onBack: closePlace,
      onShowOnMap: () => setFocus({ id: null, lon: place.lon, lat: place.lat, nonce: ++focusNonceRef.current }),
      // A period's years on the timeline (and so its borders on the map); Play stops there.
      onChooseYears: (start, end) => {
        setPlayState((s) => (s === "playing" ? "paused" : s));
        setRange({ start, end });
      },
      // Every nearby event in the results: the same circle as an area search.
      onListNearby: () => {
        setArea(makeCircleArea([place.lon, place.lat], NEARBY_KM));
        setPlace(null);
      },
    };
  }, [place, chronological, closePlace]);

  // The tab title names the open event (and is restored when it closes), as the
  // event's page has it (scripts/event-page.mjs eventPageTitle).
  const selectedTitle = selectedEventRaw?.title;
  // As the dates give them; "2014–ongoing" when a source says it is still going on (lib/eventYears.js).
  const selectedYearText = selectedEventRaw ? eventYearsText(selectedEventRaw) : "";
  useEffect(() => {
    document.title = selectedTitle ? `${selectedTitle} (${selectedYearText}) – ${SITE_TITLE}` : SITE_TITLE;
  }, [selectedTitle, selectedYearText]);

  return (
    <ShareLinkContext.Provider value={getShareLink}>
      <div className="app">
        {/* Skips the map controls: to the search box, or - while an event is open
            and the search is hidden - to the event's heading. SearchPanel's
            skipTo first opens the mobile sheet if it is collapsed. */}
        <a
          className="app-skip"
          href={selectedEventRaw ? "#event-detail-title" : place ? "#place-history-title" : "#sp-body"}
          onClick={(e) => {
            if (!panelRef.current) return;
            e.preventDefault();
            panelRef.current.skipTo();
          }}
        >
          {selectedEventRaw || place ? "Skip to panel" : "Skip to search"}
        </a>
        <header className="app-header">
          <h1>{SITE_TITLE}</h1>
          {/* What the site is, in the no-JavaScript note's words (index.html), less what the
              title already says. A narrow phone shows the first part only (App.css). */}
          <p className="app-tagline">
            An interactive map and timeline of major events
            <span className="app-tagline-more">, with historical borders</span>
          </p>
          {/* Status notices share the title's line (their own line on phones); the
              in-view count is in the panel. One live region, always in the page, so
              screen readers announce each notice as it appears. */}
          <div className="app-search" role="status">
            {eventsLoading && (
              <span className="app-loading">
                <span className="app-loading-spinner" aria-hidden="true" />
                Loading events…
              </span>
            )}
            {eventsError && !eventsLoading && <span className="app-notice">Events could not be loaded - retrying</span>}
            {/* Once its matches are listed the panel says this under the search box. */}
            {degraded && search.textSearch && search.source !== "static" && (
              <span className="app-notice">Full-text search is unavailable - matching titles and summaries only</span>
            )}
          </div>
          {/* The URL holds the view (years, filters, area, the map's camera), so this shares it as seen. While
              an event is open its own Share (EventDetail) takes over, so there is only ever one. */}
          {!selectedEventRaw && <ShareButton title={SITE_TITLE} align="end" className="sp-btn app-share-btn" />}
        </header>
        <main className="app-body">
          {mapStarted ? (
            <ErrorBoundary fallback={<MapViewCrashed onMapStatus={handleMapStatus} />}>
              <Suspense fallback={mapPlaceholder}>
                <MapView
                  events={mapEvents}
                  matchIds={matchIds}
                  eventsLoading={eventsLoading}
                  // An event link without years shows the event's year, known once the events load.
                  yearPending={Boolean(initial.eventId && !initial.years && eventsLoading && !eventsError)}
                  year={endYear}
                  borderYear={borderYear}
                  eventYear={eventYear}
                  eventYearLabel={eventYearLabel}
                  onChooseBorderYear={chooseBorderYear}
                  highlightEvent={highlightEvent}
                  selectedEventId={selectedEventId}
                  hoverId={hoverId}
                  focus={focus}
                  keepPin={keepPin}
                  areaMode={areaMode}
                  area={area}
                  onAreaModeChange={setAreaMode}
                  onAreaChange={setArea}
                  onViewportChange={handleViewportChange}
                  onSelectEvent={handleSelectFromMap}
                  categories={categoryOptions.length ? categoryOptions : null}
                  place={selectedEventId ? null : place}
                  onPlaceHistory={openPlace}
                  onMapStatus={handleMapStatus}
                  initialView={initial.mapView}
                  onCameraChange={handleCameraChange}
                />
              </Suspense>
            </ErrorBoundary>
          ) : (
            mapPlaceholder
          )}
          <SearchPanel
            ref={panelRef}
            query={query}
            filters={filters}
            area={area}
            areaMode={areaMode}
            status={search.status}
            results={panelResults}
            total={panelTotal}
            source={search.source ?? "fulltext"}
            eventsLoading={eventsLoading}
            eventsError={eventsError}
            selectedEvent={selectedEvent}
            mapBorderYear={borderYear ?? endYear}
            viewCount={viewportEventCount}
            range={panelRange}
            playState={playState}
            categoryOptions={categoryOptions}
            countryOptions={countryOptions}
            onQueryChange={setQuery}
            onFiltersChange={handleFiltersChange}
            onAreaModeChange={setAreaMode}
            onAreaChange={setArea}
            onSelect={handleSelectFromList}
            onHover={setHoverId}
            onBack={handleBack}
            onRefocus={handleRefocus}
            onSheetMove={handleSheetMove}
            sort={sort}
            onSortChange={setSort}
            view={view}
            onViewChange={setView}
            counts={counts}
            interim={search.interim}
            notFoundId={notFoundId}
            linkedEventId={initial.eventId}
            placeView={placeView}
            onOpenPlace={openPlace}
            onRetryLead={retryLead}
            mapUnavailable={mapUnavailable}
          />
        </main>
        <Timeline
          startYear={startYear}
          endYear={endYear}
          onChangeRange={handleChangeRange}
          eventCountsByYear={eventCountsByYear}
          borderYear={borderYear}
          borderYearLabel={eventYearLabel}
          playState={playState}
          onPlayStateChange={handlePlayState}
          eventYear={eventYear}
        />
        {about && (
          <Suspense fallback={null}>
            <AboutData section={aboutSection} onClose={() => setAbout(false)} />
          </Suspense>
        )}
        {/* One short line on every page. The full credits (Wikipedia CC BY-SA 4.0;
            CShapes 2.0, Schvitz et al., ETH Zurich, CC BY-NC-SA 4.0, non-commercial
            use, with our cited corrections) are one click away in the About
            dialog's "Sources & licences" section; CC 4.0 licences (section
            3(a)(2)) accept "a hyperlink to a resource that includes the required
            information". */}
        <footer className="app-footer">
          <button type="button" className="app-footer-link" onClick={() => openAbout(null)}>
            About the data
          </button>
          <span aria-hidden="true">{" · "}</span>
          <button type="button" className="app-footer-link" onClick={() => openAbout("credits")}>
            Sources &amp; licences
          </button>
        </footer>
      </div>
    </ShareLinkContext.Provider>
  );
}
