import { useEffect, useId, useRef, useState } from "react";
import AreaChip, { AreaTag } from "./AreaChip.jsx";
import FilterBar from "./FilterBar.jsx";
import ResultsList from "./ResultsList.jsx";
import { inRange } from "./resultsUtil.jsx";
import { categoryLabel, categoryShortLabel } from "../lib/categoryLabels";
import { CATEGORY_COLORS } from "./mapLayers";
import EventDetail from "./EventDetail.jsx";
import { preloadTextSearch } from "../lib/textSearch";
import "../SidePanel.css";

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
 * @param {"idle"|"loading"|"ready"} props.status
 *        idle = no query/filters/area (results is then the browse list for the range);
 *        loading = keep previous `results` (dimmed)
 * @param {object[]} props.results          lite events {id,title,date_start,date_end,countries,category,
 *                                          location_quality,snippet}, already ordered
 * @param {number}   props.total            total matches (may exceed results.length)
 * @param {"fulltext"|"local"|"static"} props.source    "static" (full-text index unavailable) shows the "Matching is simpler in offline mode" banner
 * @param {object|null} props.selectedEvent full event object for the detail view, or null
 * @param {number|null} props.viewCount     events in current map view (null = unknown)
 * @param {[number,number]} props.range     selected timeline years [start,end] (for "outside selected years")
 * @param {string[]} [props.categoryOptions] category ids to offer (default: CATEGORY_COLORS keys)
 * @param {string[]} [props.countryOptions]  country names for the select (select hidden when empty)
 * @param {(q:string)=>void}       props.onQueryChange
 * @param {(f:Filters)=>void}      props.onFiltersChange
 * @param {(m:"off"|"rect"|"circle")=>void} props.onAreaModeChange
 * @param {(a:Area|null)=>void}    props.onAreaChange
 * @param {(id:string)=>void}      props.onSelect
 * @param {(id:string|null)=>void} props.onHover
 * @param {()=>void}               props.onBack   clear selection, return to results
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
  interim = false,
  selectedEvent,
  viewCount,
  range,
  categoryOptions,
  countryOptions,
  onQueryChange,
  onFiltersChange,
  onAreaModeChange,
  onAreaChange,
  onSelect,
  onHover,
  onBack,
}) {
  const inputId = useId();
  const hintId = useId();
  const filtersId = useId();
  const filtersBtnRef = useRef(null);
  const inputRef = useRef(null);
  const toggleRef = useRef(null);
  const listWrapRef = useRef(null);
  const lastSelectedRef = useRef(null);
  const hadSelectionRef = useRef(false);
  const [sheet, setSheet] = useState(query || selectedEvent ? "full" : "peek");
  // Filters sit behind a disclosure so results start near the top of the panel.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Selecting an event (from a row or the map) opens the sheet on mobile.
  const selectedId = selectedEvent?.id ?? null;
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (selectedId) setSheet("full");
  }

  const loading = status === "loading";
  const offline = source === "static";
  const hasFilters =
    (filters.categories?.length ?? 0) > 0 ||
    (filters.countries?.length ?? 0) > 0 ||
    !!filters.inView;
  const searching = query.trim() !== "" || hasFilters || !!area;

  // Back restores focus to
  // the originating row (or the search box if that row is gone).
  useEffect(() => {
    if (selectedEvent) {
      lastSelectedRef.current = selectedEvent.id;
      hadSelectionRef.current = true;
    } else if (hadSelectionRef.current) {
      hadSelectionRef.current = false;
      const id = lastSelectedRef.current;
      const row = [...(listWrapRef.current?.querySelectorAll("button.sp-row") ?? [])].find(
        (b) => b.dataset.id === id
      );
      (row ?? inputRef.current)?.focus();
    }
  }, [selectedEvent]);

  // Mobile: collapse the sheet to its peek bar so the map (already centred on
  // the event) shows; focus moves to the toggle, which reopens the event.
  function showOnMap() {
    setSheet("peek");
    toggleRef.current?.focus();
  }

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
      if (query) {
        e.preventDefault();
        onQueryChange("");
      } else if (sheet === "full") {
        setSheet("peek");
      }
    }
  }

  const shownInRange =
    results.length === total && filters.scope !== "range"
      ? results.filter((e) => inRange(e, range)).length
      : null;

  let statusText;
  if (eventsLoading) statusText = "Loading events…";
  else if (loading && interim && results.length > 0)
    statusText = `${total} title/summary match${total === 1 ? "" : "es"} so far - full-text search running…`;
  else if (loading && results.length === 0) statusText = "Searching…";
  else if (!searching) statusText = `${total} event${total === 1 ? "" : "s"} in the selected years`;
  else if (total === 0) statusText = "0 results";
  else
    statusText =
      `${total} result${total === 1 ? "" : "s"}` +
      (shownInRange !== null && shownInRange !== total ? ` (${shownInRange} in selected years)` : "");

  const resultsKey = `${query}|${JSON.stringify(filters)}|${JSON.stringify(area)}`;

  return (
    <aside className="side-panel" data-sheet={sheet} aria-label="Search and event details">
      <button
        ref={toggleRef}
        type="button"
        className="sp-sheet-toggle"
        aria-expanded={sheet === "full"}
        aria-controls="sp-body"
        onClick={() => setSheet(sheet === "full" ? "peek" : "full")}
      >
        <span className="sp-sheet-grip" aria-hidden="true" />
        {sheet === "full" ? "Show map" : selectedEvent ? "Show event" : "Show results"}
      </button>

      <div className="sp-scroll">
        {selectedEvent && (
          <div
            onKeyDown={(e) => {
              if (e.key === "Escape") onBack();
            }}
          >
            <EventDetail event={selectedEvent} onBack={onBack} onShowOnMap={showOnMap} />
          </div>
        )}

        <div id="sp-body" className="sp-search" hidden={!!selectedEvent}>
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
                placeholder={
                  offline ? "Search built-in dataset…" : "Search title, place or topic…"
                }
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

          {offline && (
            <p className="sp-banner" role="status">
              Matching is simpler in offline mode
            </p>
          )}

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
            <p className="sp-status" role="status" aria-live="polite">
              {statusText}
            </p>
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
                    <span className="sp-dot" aria-hidden="true" style={{ background: chip.color }} />
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
            ) : total === 0 && !loading && results.length === 0 ? (
              <div className="sp-empty">
                <p>
                  {query.trim()
                    ? `No events in this atlas match “${query.trim()}”.`
                    : "No events in this atlas match these filters."}
                </p>
                <p className="sp-muted">
                  The atlas covers only a partial selection of events, so a missing result says
                  nothing about whether something happened.
                </p>
                {searching && (
                  <button type="button" className="sp-btn" onClick={clearAll}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <ResultsList
                key={resultsKey}
                results={results}
                query={query}
                range={range}
                selectedId={selectedEvent?.id ?? null}
                onSelect={onSelect}
                onHover={onHover}
                onFocusInput={() => inputRef.current?.focus()}
                busy={loading}
                browse={!searching}
              />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
