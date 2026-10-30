import { Suspense, lazy, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import AreaChip, { AreaTag } from "./AreaChip.jsx";
import FilterBar from "./FilterBar.jsx";
import PanelResizer from "./PanelResizer.jsx";
import ResultsList from "./ResultsList.jsx";
import { inRange } from "./resultsUtil.jsx";
import { categoryLabel, categoryShortLabel } from "../lib/categoryLabels";
import { CATEGORY_COLORS } from "./mapLayers";
import { EventDetailFailed, PlaceHistoryFailed } from "./LoadFailed.jsx";
import { importOr } from "../lib/importOr.js";
import { loadEventDetail, loadExportResults, loadPlaceHistory } from "../lib/lazyChunks.js";
import { preloadTextSearch } from "../lib/textSearch";
import { parseSort, sortValue } from "../lib/browseOrder.js";
import { effectiveQuery } from "../lib/ranking.js";
import { eventIdQuery } from "../lib/urlState.js";
import { timelineOrder } from "../lib/timelineView.js";
import useDebouncedValue from "../hooks/useDebouncedValue";
import usePanelWidth from "../hooks/usePanelWidth";
import useSheetDrag from "../hooks/useSheetDrag";
import { RETRY_MS } from "../hooks/useAllEvents";
import "../SidePanel.css";

// The screen reader status waits this long for typing or slider steps to settle,
// so it speaks the result once instead of after every key.
const ANNOUNCE_DELAY_MS = 700;

// The browse-list sort menu: one entry per lib/browseOrder.js SORTS value, each
// naming its direction, so reversing is a choice in sight, not a second press.
const COVERAGE_TITLE =
  "By the number of Wikimedia pages about the event (Wikipedia language versions and other projects, as counted by Wikidata)";
const SORT_OPTIONS = [
  { value: "coverage", label: "Most covered", title: COVERAGE_TITLE },
  { value: "coverage-asc", label: "Least covered", title: COVERAGE_TITLE },
  { value: "date", label: "Oldest first", title: "By start date" },
  { value: "date-desc", label: "Newest first", title: "By start date" },
];

// The open event's view is its own chunk (with its related events and citation),
// so the first view does not wait for it; an event link starts it early (App.jsx).
const EventDetail = lazy(() => importOr(loadEventDetail, EventDetailFailed));
// "What was this place?", loaded when a place is first opened.
const PlaceHistory = lazy(() => importOr(loadPlaceHistory, PlaceHistoryFailed));

// Until that chunk is in (one round trip, usually alongside the event's full
// record): the action row's Back and the event's title, styled as the real view
// (SidePanel.css), so the panel does not jump. The title takes focus as the real
// heading does, and hands it on when the view replaces it (EventDetail).
function EventDetailLoading({ event, onBack }) {
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [event.id]);
  return (
    <article className="event-detail" aria-labelledby="event-detail-title" aria-busy="true">
      <div className="event-detail-actions">
        <button type="button" className="sp-btn" onClick={onBack}>
          <span aria-hidden="true">←</span> Back<span className="event-detail-back-more"> to results</span>
        </button>
      </div>
      <header className="event-detail-head">
        <h2 id="event-detail-title" ref={headingRef} tabIndex={-1}>
          {event.title}
        </h2>
      </header>
    </article>
  );
}

// The results view switch (ResultsList layout).
const VIEWS = [
  { key: "list", label: "List", title: "Results as a list" },
  { key: "timeline", label: "Timeline", title: "Results oldest first, with each event's years as a bar" },
];

/**
 * Right-hand side panel (bottom sheet on mobile): search, area, filters, status,
 * results and the selected-event detail. Fully controlled; owns only UI state
 * (mobile sheet position, filters disclosure, focus management).
 *
 * @typedef {{categories: string[], countries: string[], scope: "all"|"range", inView: boolean}} Filters
 * @typedef {{type:"rect"|"circle", bbox:number[], center?:number[], radiusKm?:number}} Area
 *
 * @param {object}   props
 * @param {string}   props.query            current search text
 * @param {Filters}  props.filters          categories (Wikidata class ids), countries (0 or 1 used by the select),
 *                                          scope ("all" = whole timeline, "range" = only selected years),
 *                                          inView (restrict to current map view)
 * @param {Area|null} props.area            active drawn area, or null
 * @param {"off"|"rect"|"circle"} props.areaMode  current draw mode
 * @param {"idle"|"loading"|"ready"} props.status  the search hook's status (useEventSearch):
 *        idle = no query of at least 2 characters, no filters, no area (results is then
 *        the browse list for the range);
 *        loading = keep previous `results` (dimmed)
 * @param {object[]} props.results          lite events {id,title,date_start,date_end,countries,category,
 *                                          location_quality,snippet}, already ordered
 * @param {number}   props.total            total matches (may exceed results.length)
 * @param {{all:number, inRange:number}} [props.counts] search matches over the whole timeline / in the
 *                                          selected years (all is used for the "show all N" button)
 * @param {"fulltext"|"local"|"static"} props.source   "static" (full-text index unavailable) shows a
 *                                          notice under the search box
 * @param {boolean} [props.eventsError]     the event list could not be loaded (it is retried): the list
 *                                          says so instead of "no events match"
 * @param {object|null} props.selectedEvent full event object for the detail view, or null
 * @param {number|null} props.viewCount     events in current map view (null = unknown)
 * @param {[number,number]} props.range     selected timeline years [start,end] (for "outside selected years")
 * @param {"playing"|"paused"|"stopped"} [props.playState] timeline Play: live announcements wait while
 *                                          "playing"; "paused" (not a manual move) announces where it stopped
 * @param {string[]} [props.categoryOptions] category ids to offer (default: CATEGORY_COLORS keys)
 * @param {string[]} [props.countryOptions]  country names for the select (select hidden when empty)
 * @param {(q:string)=>void}       props.onQueryChange
 * @param {(f:Filters)=>void}      props.onFiltersChange
 * @param {(m:"off"|"rect"|"circle")=>void} props.onAreaModeChange
 * @param {(a:Area|null)=>void}    props.onAreaChange
 * @param {(id:string)=>void}      props.onSelect
 * @param {(id:string|null)=>void} props.onHover
 * @param {()=>void}               props.onBack   clear selection, return to results
 * @param {()=>void}               [props.onRefocus] aim the map at the open event again (phone "Find on map")
 * @param {(sheet:string)=>void}   [props.onSheetMove] the phone sheet moved (to `sheet`) with an event open (keep its pin in sight)
 * @param {string}                 [props.sort]   order of the browse list, one of lib/browseOrder.js SORTS
 * @param {(s:string)=>void}       [props.onSortChange]
 * @param {"list"|"timeline"}      [props.view]   how results are shown: the list, or oldest first with
 *                                          a bar per event on a year axis (ResultsList layout)
 * @param {(v:"list"|"timeline")=>void} [props.onViewChange]
 * @param {string|null} [props.notFoundId]  the id of an event link that leads to no event (App): said at the top
 *                                          of the panel, with "Search instead", until the next search or selection
 * @param {object|null} [props.placeView] "What was this place?" while open (shown when no event is):
 *                                          {place, events, onBack, onShowOnMap, onChooseYears, onListNearby}
 *                                          (components/PlaceHistory.jsx; its events open with onSelect)
 * @param {(p:{lon:number,lat:number})=>void} [props.onOpenPlace] opens it for a point (the open event's)
 * @param {import("react").Ref<{skipTo: ()=>void}>} [props.ref]  skipTo() opens the sheet and focuses the
 *                                          event heading (event open) or the search box: App's skip link
 */
export default function SearchPanel({
  query,
  filters,
  area,
  areaMode,
  status,
  results,
  total,
  source,
  eventsLoading = false,
  eventsError = false,
  interim = false,
  counts,
  selectedEvent,
  mapBorderYear, // the year whose borders the map draws (App: the event's or the range end)
  viewCount,
  range,
  playState = "stopped",
  categoryOptions,
  countryOptions,
  onQueryChange,
  onFiltersChange,
  onAreaModeChange,
  onAreaChange,
  onSelect,
  onHover,
  onBack,
  onRefocus,
  onSheetMove,
  sort = "coverage",
  onSortChange,
  view = "list",
  onViewChange,
  notFoundId = null,
  placeView = null,
  onOpenPlace, // ({lon, lat}): an open event's "History of this place"
  ref,
}) {
  const inputId = useId();
  const panelId = useId();
  const panelRef = useRef(null);
  // The reader's width for the panel (PanelResizer); null = the CSS default.
  const panelWidth = usePanelWidth();
  const hintId = useId();
  const filtersId = useId();
  const filtersBtnRef = useRef(null);
  const inputRef = useRef(null);
  const toggleRef = useRef(null);
  const listWrapRef = useRef(null);
  const statusRef = useRef(null); // the status line: Back's focus when the event's row is not in the list
  const scrollRef = useRef(null);
  const listScrollRef = useRef(0); // the list's scroll position, restored by Back
  const lastSelectedRef = useRef(null);
  const hadSelectionRef = useRef(false);
  // Phone sheet: "peek" | "half" | "full", dragged by its bar (hooks/useSheetDrag.js).
  // An event (or "What was this place?") opens at half height, so its place stays
  // in sight on the map above (at full only a strip shows, under the map's
  // controls); a search opens the list at full. Tapping the lowered bar reopens
  // it the same way.
  const { sheet, setSheet, dragHeight, barProps } = useSheetDrag(
    selectedEvent || placeView ? "half" : query ? "full" : "peek",
    panelRef,
    selectedEvent || placeView ? "half" : "full"
  );
  const sheetOpen = sheet !== "peek";
  // Filters sit behind a disclosure so results start near the top of the panel.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // "Download": a disclosure under the toolbar offering CSV and JSON of the list.
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadId = useId();
  const downloadBtnRef = useRef(null);

  // Selecting an event (from a row or the map) opens the sheet on mobile, at
  // half height; a sheet the reader left at full stays at full.
  const selectedId = selectedEvent?.id ?? null;
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (selectedId && sheet === "peek") setSheet("half");
  }
  // So does a link to no event, whose notice is at the top of the panel.
  const [prevNotFoundId, setPrevNotFoundId] = useState(notFoundId);
  if (notFoundId !== prevNotFoundId) {
    setPrevNotFoundId(notFoundId);
    if (notFoundId && sheet === "peek") setSheet("full");
  }
  // "What was this place?" opens the same way as an event; it shows while no event is open.
  const placeKey = placeView ? `${placeView.place.lon},${placeView.place.lat}` : null;
  const placeShown = Boolean(placeView) && !selectedEvent;
  const [prevPlaceKey, setPrevPlaceKey] = useState(placeKey);
  if (placeKey !== prevPlaceKey) {
    setPrevPlaceKey(placeKey);
    if (placeKey && sheet === "peek") setSheet("half");
  }

  const loading = status === "loading";
  const offline = source === "static";
  // What App lists follows the search hook: below 2 characters (or with no
  // letters or digits) a query is no search and the browse list shows, so it is
  // styled and counted as one. "In map view" is not part of the search: on its
  // own App still lists the browse list (its order, Sort, the Ongoing group),
  // only trimmed to the view, so the panel treats it as browsing too.
  const searching = status !== "idle";
  const inView = !!filters.inView;
  // The text being searched for (highlighted in the rows), "" while it is no search.
  const textQuery = effectiveQuery(query);
  const { key: sortKey, dir: sortDir } = parseSort(sort);
  const sortNow = sortValue(sortKey, sortDir); // normalised: an unknown value is the default sort

  // The panel scrolls as one (.sp-scroll): an opened event starts at its top,
  // not at the list's (or the previous event's) scroll position, and Back
  // returns to where the list was. Before the focus below, which then finds
  // its row in view.
  const scrolledForRef = useRef(selectedId);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prev = scrolledForRef.current;
    scrolledForRef.current = selectedId;
    if (!el || prev === selectedId) return;
    el.scrollTop = selectedId ? 0 : listScrollRef.current;
  }, [selectedId]);
  // A place opened (or moved) starts at its top too; closed, the list is back where it was.
  const placeScrolledRef = useRef(placeKey);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prev = placeScrolledRef.current;
    placeScrolledRef.current = placeKey;
    if (!el || prev === placeKey || selectedId) return;
    el.scrollTop = placeKey ? 0 : listScrollRef.current;
    // Closed with no event open: focus goes to the status line (or the lowered sheet's bar), as after Back from an event.
    if (!placeKey && prev) {
      const toggle = toggleRef.current;
      if (toggle?.getClientRects().length && toggle.getAttribute("aria-expanded") === "false") toggle.focus();
      else statusRef.current?.focus();
    }
  }, [placeKey, selectedId]);

  // Back restores focus to the originating row, or, if that row is gone or not
  // rendered (rows render 50 at a time), to the status line above the list
  // ("N results"; tabIndex -1). Not the search box: its onFocus opens the
  // phone sheet to full and preloads the full-text index, and on a phone it
  // would bring up the keyboard. With the phone sheet at its peek bar (system
  // Back after "Find on map") the list is hidden, so focus goes to the sheet's
  // bar instead.
  useEffect(() => {
    if (selectedEvent) {
      lastSelectedRef.current = selectedEvent.id;
      hadSelectionRef.current = true;
    } else if (hadSelectionRef.current) {
      hadSelectionRef.current = false;
      const toggle = toggleRef.current;
      if (toggle?.getClientRects().length && toggle.getAttribute("aria-expanded") === "false") {
        toggle.focus();
        return;
      }
      const id = lastSelectedRef.current;
      const row = [...(listWrapRef.current?.querySelectorAll("button.sp-row") ?? [])].find(
        (b) => b.dataset.id === id
      );
      (row ?? statusRef.current)?.focus();
    }
  }, [selectedEvent]);

  // The skip link: on mobile the collapsed sheet hides the event, so open the
  // sheet first (synchronously, so the target is visible) and then focus.
  useImperativeHandle(
    ref,
    () => ({
      skipTo() {
        if (!sheetOpen) flushSync(() => setSheet("full"));
        const target = selectedId
          ? document.getElementById("event-detail-title")
          : placeShown
            ? document.getElementById("place-history-title")
            : inputRef.current;
        target?.focus();
      },
    }),
    [selectedId, placeShown, sheetOpen, setSheet]
  );

  // Mobile: collapse the sheet to its peek bar so the map shows, and aim the
  // map at the event again: it was aimed at the strip above the open sheet,
  // which is now near the top, under the toolbar. Both updates land in one
  // render, so the camera move reads the sheet at its peek bar. Focus moves to
  // the toggle, which reopens the event.
  // Stable, so the memoized EventDetail skips App's Play/map/hover re-renders.
  const refocusedRef = useRef(false);
  const showOnMap = useCallback(() => {
    // Aimed here, so the effect below skips the move this makes (none at peek).
    if (panelRef.current?.dataset.sheet !== "peek") refocusedRef.current = true;
    setSheet("peek");
    onRefocus?.();
    toggleRef.current?.focus();
  }, [setSheet, onRefocus]);
  // The same for "What was this place?": the sheet lowered, the map aimed at the point.
  const onShowPlace = placeView?.onShowOnMap;
  const showPlaceOnMap = useCallback(() => {
    setSheet("peek");
    onShowPlace?.();
    if (toggleRef.current?.getClientRects().length) toggleRef.current.focus();
  }, [setSheet, onShowPlace]);

  // Mobile: the reader moved the sheet (dragged it, its bar, a key) with an
  // event open, so more or less of the map is in sight: App keeps the event's
  // pin inside it (MapView keepPin), and centres it when the sheet went down
  // to its bar ("Show map") - unless "Find on map" just aimed it, or the event
  // itself changed (it is aimed anyway).
  const sheetSeenRef = useRef({ sheet, selectedId });
  useEffect(() => {
    const prev = sheetSeenRef.current;
    sheetSeenRef.current = { sheet, selectedId };
    if (prev.sheet === sheet) return;
    if (refocusedRef.current) {
      refocusedRef.current = false;
      return;
    }
    if (selectedId && prev.selectedId === selectedId) onSheetMove?.(sheet);
  }, [sheet, selectedId, onSheetMove]);

  function clearAll() {
    onQueryChange("");
    onFiltersChange({ ...filters, categories: [], countries: [], inView: false });
    onAreaChange(null);
  }

  // Active filters as removable chips (shown while the disclosure is closed).
  // Removing one moves focus to the Filters button, since the chip is gone.
  const cats = filters.categories ?? [];
  const countries = filters.countries ?? [];
  const activeChips = [
    ...cats.map((c) => ({
      key: `cat:${c}`,
      label: categoryShortLabel(c),
      title: categoryLabel(c),
      color: CATEGORY_COLORS[c] ?? "#6b6151",
      remove: () => onFiltersChange({ ...filters, categories: cats.filter((x) => x !== c) }),
    })),
    ...countries.map((c) => ({
      key: `country:${c}`,
      label: c,
      remove: () => onFiltersChange({ ...filters, countries: countries.filter((x) => x !== c) }),
    })),
    ...(filters.inView
      ? [{ key: "inView", label: "In map view", remove: () => onFiltersChange({ ...filters, inView: false }) }]
      : []),
    ...(searching && filters.scope === "range"
      ? [{ key: "scope", label: "Only selected years", remove: () => onFiltersChange({ ...filters, scope: "all" }) }]
      : []),
  ];
  const activeCount = activeChips.length + (area ? 1 : 0);
  const focusFiltersBtn = () => filtersBtnRef.current?.focus();
  // Stable, so the memoized ResultsList skips App's hover re-renders.
  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  function clearFilters() {
    onFiltersChange({ ...filters, categories: [], countries: [], inView: false, scope: "all" });
    onAreaChange(null);
    focusFiltersBtn();
  }

  function onInputKeyDown(e) {
    if (e.key === "ArrowDown") {
      const first = listWrapRef.current?.querySelector("button.sp-row");
      if (first) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === "Escape") {
      // Handled here only: the map's own Escape handlers skip a handled key.
      if (query) {
        e.preventDefault();
        onQueryChange("");
      } else if (sheetOpen) {
        e.preventDefault();
        setSheet("peek");
      }
    }
  }

  const shownInRange =
    results.length === total && filters.scope !== "range"
      ? results.filter((e) => inRange(e, range)).length
      : null;

  // Whole-timeline count while only the selected years are listed. Unknown
  // with "in map view" on, since App only counts the view-trimmed scoped list.
  const allCount = filters.scope === "range" && !filters.inView ? (counts?.all ?? null) : null;
  const plural = (n) => `${n} result${n === 1 ? "" : "s"}`;
  const settled = !eventsLoading && !loading && searching;

  // `years` names the selected years: the visible line says "selected years"
  // (the timeline shows them), the announcement below spells them out.
  // `extra` repeats what the scope button next to the visible line says, as
  // screen-reader-only text.
  function describeStatus(years) {
    const sel = years ?? "selected years";
    if (eventsLoading) return { text: "Loading events…", extra: "" };
    if (eventsError) return { text: "Events could not be loaded - retrying", extra: "" };
    if (loading && interim && results.length > 0)
      return { text: `${total} title/summary match${total === 1 ? "" : "es"} so far - full-text search running…`, extra: "" };
    if (loading && results.length === 0) return { text: "Searching…", extra: "" };
    if (!searching)
      return {
        text: `${total} event${total === 1 ? "" : "s"} in ${years ?? "the selected years"}${inView ? ", in map view" : ""}`,
        extra: "",
      };
    if (filters.scope === "range") return { text: `${plural(total)} in ${sel}`, extra: "" };
    if (total === 0) return { text: "0 results", extra: "" };
    if (shownInRange === 0) return { text: `${plural(total)} (none in ${sel})`, extra: "" };
    if (shownInRange !== null && shownInRange !== total)
      return { text: plural(total), extra: `, ${shownInRange} in ${sel}` };
    return { text: plural(total), extra: "" };
  }
  const { text: statusText, extra: statusExtra } = describeStatus(null);

  // The relevance order is kept in both scopes; this button only switches
  // between listing every match and listing the ones in the selected years.
  let scopeAction = null;
  if (settled && filters.scope === "range" && (allCount === null || allCount > total)) {
    scopeAction = {
      label: allCount === null ? "Show whole timeline" : `Show all ${allCount}`,
      aria: allCount === null ? "Show results from the whole timeline" : `Show all ${plural(allCount)}, whole timeline`,
      scope: "all",
    };
  } else if (settled && filters.scope !== "range" && total > 0 && shownInRange && shownInRange !== total) {
    scopeAction = { label: `Show the ${shownInRange} in selected years`, aria: null, scope: "range" };
  }

  // The button usually flips in place, but "Show all N" with none of the N in
  // the selected years leaves no "Show the M in selected years" to flip to: the
  // button goes, and the focus it held moves to the status line (which then
  // says "N results (none in selected years)") instead of the page body.
  const scopeBtnRef = useRef(null);
  const scopeFocusRef = useRef(false); // the scope button was pressed while focused
  useEffect(() => {
    if (!scopeFocusRef.current) return;
    scopeFocusRef.current = false;
    if (!scopeBtnRef.current) statusRef.current?.focus();
  });

  // Screen reader announcements. The visible status line is not a live region:
  // Play changes it every 350 ms. This hidden one stays empty while Play runs
  // and speaks once when it is paused ("Paused at 1967. ..."), and after
  // manual changes (a slider moved during Play included), naming the years.
  const playing = playState === "playing";
  const rangeKey = `${range[0]}-${range[1]}`;
  const [prevPlayState, setPrevPlayState] = useState(playState);
  const [pausedAt, setPausedAt] = useState(null); // rangeKey where Play was paused
  if (playState !== prevPlayState) {
    setPrevPlayState(playState);
    setPausedAt(playState === "paused" ? rangeKey : null);
  }
  const yearsText = range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
  const spoken = describeStatus(yearsText);
  const paused = pausedAt === rangeKey;
  const liveText = playing ? "" : (paused ? `Paused at ${range[1]}. ` : "") + spoken.text + spoken.extra;
  // Settled text only (typing, slider arrows), except "Paused at", which is immediate.
  const settledLiveText = useDebouncedValue(liveText, ANNOUNCE_DELAY_MS);
  const announced = paused ? liveText : settledLiveText;

  const resultsKey = `${query}|${JSON.stringify(filters)}|${JSON.stringify(area)}|${view}`;

  // The download is the list as the panel shows it: the same results, in the
  // order ResultsList lists them (the Timeline view: timelineOrder, as there),
  // every row, not only the ones "Show more" has revealed. Built from the lite
  // records in memory (lib/exportResults.js says what that leaves out). Its code
  // is a chunk of its own: opening the menu starts it, a choice waits for it.
  const showDownload = !eventsLoading && !eventsError;
  const canDownload = showDownload && !loading && results.length > 0;
  const downloadLabel = `Download ${results.length === 1 ? "this result" : `these ${results.length} results`}`;
  const [downloadFailed, setDownloadFailed] = useState(false);
  async function download(kind) {
    if (!canDownload) return;
    let lib;
    try {
      lib = await loadExportResults();
    } catch {
      setDownloadFailed(true);
      return;
    }
    setDownloadFailed(false);
    const { downloadText, exportFileRange, exportFilename, exportQuery, exportRows, toCSV, toJSON } = lib;
    const ordered = view === "timeline" ? timelineOrder(results, searching ? null : range[0]) : results;
    const rows = exportRows(ordered, { range, browse: !searching });
    const name = exportFilename(exportFileRange(range, { searching, scope: filters.scope }), rows.length, kind);
    if (kind === "csv") downloadText(toCSV(rows), name, "text/csv;charset=utf-8");
    else {
      const q = exportQuery({ query: textQuery, filters, area, range, sort, view });
      downloadText(toJSON(rows, { query: q }), name, "application/json;charset=utf-8");
    }
  }

  return (
    <aside
      ref={panelRef}
      id={panelId}
      className="side-panel"
      data-sheet={dragHeight === null ? sheet : "drag"}
      aria-label="Search and event details"
      style={{
        ...(panelWidth.width ? { "--panel-w": `${panelWidth.width}px` } : null),
        ...(dragHeight === null ? null : { height: `${dragHeight}px` }),
      }}
    >
      <PanelResizer
        panelRef={panelRef}
        panelId={panelId}
        onDrag={panelWidth.setWidth}
        onCommit={panelWidth.commit}
        onReset={panelWidth.reset}
      />
      <p className="sp-sr-status" role="status">
        {announced}
      </p>
      <button
        ref={toggleRef}
        type="button"
        className="sp-sheet-toggle"
        aria-expanded={sheetOpen}
        aria-controls="sp-body"
        aria-keyshortcuts="ArrowUp ArrowDown"
        title="Tap to open or close; drag, or use the arrow keys, for half or full height"
        {...barProps}
      >
        <span className="sp-sheet-grip" aria-hidden="true" />
        {/* Lowered with an event open, the bar names the event (one line, cut
            with an ellipsis); its accessible name says what the bar does. */}
        {sheetOpen ? (
          "Show map"
        ) : selectedEvent ? (
          <span className="sp-sheet-title">
            {selectedEvent.title}
            <span className="sp-sr"> (show event)</span>
          </span>
        ) : placeShown ? (
          "Show history of this place"
        ) : (
          "Show results"
        )}
      </button>

      <div
        className="sp-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          // Only the list's own scrolling; opening an event changes the content under it.
          if (!selectedId && !placeShown) listScrollRef.current = e.currentTarget.scrollTop;
        }}
      >
        {selectedEvent && (
          <div
            onKeyDown={(e) => {
              if (e.key !== "Escape" || e.defaultPrevented) return;
              e.preventDefault();
              // An armed area drawing goes first: the map's own Escape skips the panel.
              if (areaMode !== "off") onAreaModeChange?.("off");
              else onBack();
            }}
          >
            <Suspense fallback={<EventDetailLoading event={selectedEvent} onBack={onBack} />}>
              <EventDetail
                event={selectedEvent}
                borderYear={mapBorderYear}
                onBack={onBack}
                onShowOnMap={showOnMap}
                onSelectEvent={onSelect}
                onPlaceHistory={onOpenPlace}
              />
            </Suspense>
          </div>
        )}

        {placeShown && (
          <div
            onKeyDown={(e) => {
              if (e.key !== "Escape" || e.defaultPrevented) return;
              e.preventDefault();
              if (areaMode !== "off") onAreaModeChange?.("off");
              else placeView.onBack();
            }}
          >
            <Suspense fallback={<p className="sp-status">Loading…</p>}>
              <PlaceHistory
                place={placeView.place}
                events={placeView.events}
                eventsLoading={eventsLoading}
                mapYear={mapBorderYear}
                onBack={placeView.onBack}
                onShowOnMap={showPlaceOnMap}
                onChooseYears={placeView.onChooseYears}
                onSelectEvent={onSelect}
                onListNearby={placeView.onListNearby}
              />
            </Suspense>
          </div>
        )}

        <div id="sp-body" className="sp-search" hidden={!!selectedEvent || placeShown}>
          {/* A link to no event (App's notFoundId), in the panel where the event would have opened. Always in the
              page, so screen readers announce it when it appears. */}
          <div role="status">
            {notFoundId && (
              <div className="sp-notfound">
                <p className="sp-notfound-title">No event found for this link.</p>
                <p className="sp-muted">
                  The link asked for <code className="sp-notfound-id">{notFoundId}</code>, which is not an event in
                  this atlas.
                </p>
                <button
                  type="button"
                  className="sp-btn"
                  onClick={() => {
                    onQueryChange(eventIdQuery(notFoundId));
                    inputRef.current?.focus();
                  }}
                >
                  Search instead
                </button>
              </div>
            )}
          </div>
          <div className="sp-searchbox" role="search">
            <label htmlFor={inputId} className="sp-label">
              Search events
            </label>
            <div className="sp-inputwrap">
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                maxLength={100}
                placeholder="Search title, place or topic…"
                aria-describedby={hintId}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onInputKeyDown}
                onFocus={() => {
                  setSheet("full");
                  preloadTextSearch();
                }}
              />
              {query && (
                <button
                  type="button"
                  className="sp-clear"
                  aria-label="Clear search"
                  onClick={() => {
                    onQueryChange("");
                    inputRef.current?.focus();
                  }}
                >
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </div>
            <p id={hintId} className="sp-hint">
              Press Down arrow to move to results.
            </p>
          </div>

          {/* Always in the page, so screen readers announce the banner when it appears. */}
          <div role="status">
            {offline && (
              <p className="sp-banner">
                Full-text search didn&apos;t load. Matching titles and summaries only; retrying.
              </p>
            )}
          </div>

          {/* Line 1: what is listed (and the scope button), and Download, which
              saves exactly that. */}
          <div className="sp-statusline">
            {/* The list's heading (the Timeline view's decades are h2s under it). */}
            <h2 className="sp-status" ref={statusRef} tabIndex={-1}>
              {statusText}
              {statusExtra && <span className="sp-sr">{statusExtra}</span>}
            </h2>
            {/* One button in a fixed place whose text flips between the two
                scopes, so keyboard focus stays on it after pressing it. */}
            {scopeAction && (
              <button
                ref={scopeBtnRef}
                type="button"
                className="sp-scope-link"
                aria-label={scopeAction.aria ?? undefined}
                onClick={(e) => {
                  scopeFocusRef.current = document.activeElement === e.currentTarget;
                  onFiltersChange({ ...filters, scope: scopeAction.scope });
                }}
              >
                {scopeAction.label}
              </button>
            )}
            {/* At the line's end and always the same width ("Download"; the count is
                in its name), so nothing moves when the results change: disabled
                while there is nothing settled to save. */}
            {showDownload && (
              <button
                ref={downloadBtnRef}
                type="button"
                className="sp-download-toggle"
                aria-expanded={downloadOpen}
                aria-controls={downloadId}
                aria-label={canDownload ? downloadLabel : "Download (no results to save)"}
                title={canDownload ? `${downloadLabel} as CSV or JSON` : undefined}
                disabled={!canDownload}
                onClick={() => {
                  if (!downloadOpen) loadExportResults().catch(() => {}); // a choice reports a failure
                  setDownloadOpen(!downloadOpen);
                }}
              >
                <span className="sp-caret" aria-hidden="true" />
                Download
              </button>
            )}
          </div>

          {/* The download choices, right under their button. */}
          {showDownload && (
            <div
              id={downloadId}
              className="sp-download"
              role="group"
              aria-label={downloadLabel}
              hidden={!downloadOpen || !canDownload}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                e.preventDefault();
                setDownloadOpen(false);
                downloadBtnRef.current?.focus();
              }}
            >
              <p className="sp-download-what">
                {downloadLabel}, in the order listed:
              </p>
              <div className="sp-download-btns">
                <button type="button" className="sp-btn" onClick={() => download("csv")}>
                  CSV <span className="sp-download-hint">(spreadsheet)</span>
                </button>
                <button type="button" className="sp-btn" onClick={() => download("json")}>
                  JSON
                </button>
              </div>
              <p className="sp-download-note">
                Titles are Wikipedia text (CC BY-SA 4.0, credited in the file). No summaries or borders
                are included; each row links its event page.
              </p>
              {downloadFailed && (
                <p className="load-failed" role="alert">
                  The download could not be prepared. Please reload the page.
                </p>
              )}
            </div>
          )}

          {/* Line 2: how the results are shown. */}
          <div className="sp-toolbar">
            <button
              ref={filtersBtnRef}
              type="button"
              className="sp-filters-toggle"
              aria-expanded={filtersOpen}
              aria-controls={filtersId}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <span className="sp-caret" aria-hidden="true" />
              Filters{activeCount > 0 ? ` (${activeCount})` : ""}
            </button>
            {/* List or Timeline, for the browse list and search results alike. Before
                Sort, so it stays in place when Sort hides. */}
            {!eventsLoading && !eventsError && onViewChange && (
              <div className="sp-sort sp-view" role="group" aria-label="Show results as">
                {VIEWS.map(({ key, label, title }) => (
                  <button
                    key={key}
                    type="button"
                    className="sp-sort-btn"
                    aria-pressed={view === key}
                    title={title}
                    onClick={() => onViewChange(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {/* Order of the browse list (no search or filters): search results keep their
                relevance order, and the Timeline is always oldest first. */}
            {!searching && view !== "timeline" && !eventsLoading && !eventsError && onSortChange && (
              <label className="sp-select sp-sortselect">
                <span className="sp-sr">Sort events</span>
                <select
                  value={sortNow}
                  title={SORT_OPTIONS.find((o) => o.value === sortNow)?.title}
                  onChange={(e) => onSortChange(e.target.value)}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {!filtersOpen && (activeCount > 0 || areaMode !== "off") && (
            <div className="sp-active" aria-label="Active filters" role="group">
              <AreaTag
                area={area}
                areaMode={areaMode}
                onAreaChange={onAreaChange}
                onRemoved={focusFiltersBtn}
              />
              {activeChips.map((chip) => (
                <span key={chip.key} className="sp-chip sp-chip--active">
                  {chip.color && (
                    <span className="sp-dot" aria-hidden="true" style={{ "--dot": chip.color }} />
                  )}
                  <span title={chip.title}>{chip.label}</span>
                  <button
                    type="button"
                    className="sp-chip-x"
                    aria-label={`Remove filter: ${chip.label}`}
                    onClick={() => {
                      chip.remove();
                      focusFiltersBtn();
                    }}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              ))}
              {activeCount > 1 && (
                <button type="button" className="sp-clear-all" onClick={clearFilters}>
                  Clear all
                </button>
              )}
            </div>
          )}

          <div id={filtersId} className="sp-filterpanel" hidden={!filtersOpen}>
            <AreaChip
              area={area}
              areaMode={areaMode}
              onAreaModeChange={onAreaModeChange}
              onAreaChange={onAreaChange}
              inView={filters.inView}
              onInViewChange={(v) => onFiltersChange({ ...filters, inView: v })}
              viewCount={viewCount}
            />
            <FilterBar
              filters={filters}
              onFiltersChange={onFiltersChange}
              categoryOptions={categoryOptions}
              countryOptions={countryOptions}
              showScope={searching}
            />
          </div>

          <div ref={listWrapRef}>
            {eventsLoading ? (
              <ul className="sp-list" aria-hidden="true" data-testid="results-skeleton">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <li key={i} style={{ padding: "10px 8px", opacity: 1 - i * 0.12 }}>
                    <div style={{ height: 14, width: `${70 - (i % 3) * 12}%`, background: "var(--border)", borderRadius: 3 }} />
                    <div style={{ height: 10, width: "40%", background: "var(--border-soft)", borderRadius: 3, marginTop: 8 }} />
                  </li>
                ))}
              </ul>
            ) : eventsError && total === 0 && results.length === 0 ? (
              // An outage, not an empty result: the list could not be loaded at all.
              <div className="sp-empty">
                <p>The events could not be loaded.</p>
                <p className="sp-muted">
                  This is a problem with the connection or the site, not with your search. Trying again every{" "}
                  {RETRY_MS / 1000} seconds; the list appears as soon as it loads.
                </p>
              </div>
            ) : total === 0 && !loading && results.length === 0 ? (
              <div className="sp-empty">
                <p>
                  {textQuery
                    ? `No events in this atlas match “${textQuery}”.`
                    : searching
                      ? "No events in this atlas match these filters."
                      : inView
                        ? "No events in the selected years in this map view."
                        : "No events in the selected years."}
                </p>
                <p className="sp-muted">
                  The atlas covers only a partial selection of events, so a missing result says
                  nothing about whether something happened.
                </p>
                {textQuery && (
                  <p className="sp-muted">
                    Search looks in English text: Wikipedia&apos;s titles and article leads, and Wikidata&apos;s English
                    aliases.
                  </p>
                )}
                {(searching || inView) && (
                  <button type="button" className="sp-btn" onClick={clearAll}>
                    {query && activeCount > 0 ? "Clear search and filters" : query ? "Clear search" : "Clear filters"}
                  </button>
                )}
              </div>
            ) : (
              <ResultsList
                key={resultsKey}
                results={results}
                query={textQuery}
                range={range}
                selectedId={selectedEvent?.id ?? null}
                onSelect={onSelect}
                onHover={onHover}
                onFocusInput={focusInput}
                busy={loading}
                browse={!searching}
                layout={view}
                fitAxis={status !== "idle" && filters.scope !== "range"}
              />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
