import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CATEGORY_COLORS } from "./mapLayers";
import { NO_STATUS_LABEL, humaniseStatus, isDashedStatus, yearsLabel } from "./mapBorders";
import { categoryLabel } from "../lib/categoryLabels";
import { isUnhandledEscape } from "../lib/escapeKey";
import { BoundaryNote, BoundarySource } from "./BoundaryText.jsx";
import { sheetCover } from "../lib/mapInsets";
import "./MapUi.css";

// ---- the map toolbar ----

// Icon + label button. The label is always the accessible name; `mu-icon-only`
// (and every tool button on phones, see MapUi.css) shows only the icon.
function ToolButton({ icon, label, className = "", ...rest }) {
  return (
    <button type="button" className={`mu-btn mu-tool ${className}`} title={label} {...rest}>
      <span className="mu-tool-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="mu-tool-label">{label}</span>
    </button>
  );
}

// Icons are line drawings (KeyIcon, the navigation keys' weight), plain shapes
// and arrows, never a crosshair, scope or bullseye (project rule: no
// weapon-like visuals). "Use map view" is a dashed square like the drawn area's
// outline; "Zoom to results" is fit-to-view arrows.
const ICONS = {
  draw: "M4 16l.9-3.6L13 4.3a1.5 1.5 0 0 1 2.1 0l.6.6a1.5 1.5 0 0 1 0 2.1L7.6 15.1z",
  rect: "M3.5 5.5h13v9h-13z",
  circle: "M10 4a6 6 0 1 1 0 12a6 6 0 1 1 0-12z",
  view: "M3.5 3.5h13v13h-13z",
  clear: "M5.5 5.5l9 9M14.5 5.5l-9 9",
  fit: "M11.5 3.5h5v5M16.5 3.5l-5 5M8.5 16.5h-5v-5M3.5 16.5l5-5",
};
const DRAW_MODES = [
  { mode: "rect", icon: <KeyIcon d={ICONS.rect} />, short: "Rectangle" },
  { mode: "circle", icon: <KeyIcon d={ICONS.circle} />, short: "Circle" },
];

// Search-area drawing: one "Draw area" button opens the shapes (and Clear area)
// as a row under the toolbar, so fewer controls float over the map. Phones
// show the button as its icon only (MapUi.css). The shapes are drawn by
// dragging; "Use map view" sets the area without one (keyboard, or a single
// tap), as a rectangle of what the map shows.
function DrawTools({ areaMode, hasArea, onToggle, onClear, onUseView }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  // A choice (or Escape) removes the menu and the button that had focus, so
  // focus goes back to the Draw button instead of being lost to the page.
  const closeMenu = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (!isUnhandledEscape(e, wrapRef.current)) return;
      e.preventDefault();
      setOpen(false);
      if (wrapRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    };
    const onDown = (e) => !wrapRef.current?.contains(e.target) && setOpen(false);
    // Capture: an Escape in the menu is the menu's, before the map's draw-mode
    // handler (MapView) would take it to leave the mode.
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const choices = (
    <>
      {DRAW_MODES.map((d) => (
        <ToolButton
          key={d.mode}
          icon={d.icon}
          label={d.short}
          aria-pressed={areaMode === d.mode}
          onClick={() => {
            onToggle(d.mode);
            closeMenu();
          }}
        />
      ))}
      <ToolButton
        icon={<KeyIcon d={ICONS.view} dash="2.5 2" />}
        label="Use map view"
        aria-label="Use map view as the search area"
        onClick={() => {
          onUseView();
          closeMenu();
        }}
      />
      {hasArea && (
        <ToolButton
          icon={<KeyIcon d={ICONS.clear} />}
          label="Clear area"
          onClick={() => {
            onClear();
            closeMenu();
          }}
        />
      )}
    </>
  );

  const active = DRAW_MODES.find((d) => d.mode === areaMode);
  return (
    <div className="mu-draw" ref={wrapRef}>
      {/* A menu button: aria-expanded only. Its name (the visible text, which
          voice control users say) already says when a mode is on. */}
      <ToolButton
        ref={buttonRef}
        className={active ? "is-on" : ""}
        icon={active ? active.icon : <KeyIcon d={ICONS.draw} />}
        label={active ? `Drawing ${active.short.toLowerCase()}` : "Draw area"}
        aria-expanded={open}
        aria-controls="mu-draw-menu"
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div id="mu-draw-menu" className="mu-draw-menu" role="group" aria-label="Draw a search area">
          {choices}
        </div>
      )}
    </div>
  );
}

// Some results have no map location, so the panel's "23 results" and this
// button's count can differ; the button says "18 of 23" then, and its title
// and accessible name say why.
function ShowMatchesButton({ count, total, compact, onClick }) {
  const unmapped = total != null && total > count ? total - count : 0;
  const why = unmapped ? `${unmapped} ${unmapped === 1 ? "has" : "have"} no map location` : null;
  const shown = unmapped ? `${count} of ${total}` : `${count}`;
  // "Zoom to", not "Show": the phone sheet's bar is "Show results" (opens the list).
  const text = compact ? `Zoom to results (${shown})` : `Zoom to ${shown} results`;
  // The accessible name starts with the visible text (voice control users say
  // what they see).
  return (
    <button
      type="button"
      className="mu-btn mu-show-results"
      onClick={onClick}
      title={why ?? undefined}
      aria-label={`${text}${why ? `; ${why}` : ""}`}
    >
      <KeyIcon d={ICONS.fit} /> {text}
    </button>
  );
}

// "Borders as of" the two years they can be while an event is open, the drawn one
// pressed (a toggle: docs/design-contract.md "Controls"): the open event's year
// (`eventLabel` "event", or "event start" for a multi-year event) or the end of
// the selected years. Both years are always printed, so the map never leaves
// in doubt which year its borders are from. Phones keep only the two years in
// sight beside the Borders chip, whose line then ends "Borders as of" (MapKey);
// the accessible names keep the words.
export function BorderYearChoice({ eventYear, eventLabel, rangeYear, eventShown, compact, onChoose }) {
  const options = [
    { key: "event", year: eventYear, label: eventLabel, pressed: eventShown },
    { key: "range", year: rangeYear, label: "range end", pressed: !eventShown },
  ];
  const describe = (o) =>
    o.key === "event"
      ? `${o.year}, the open event's ${eventLabel === "event start" ? "start year" : "year"}`
      : `${o.year}, the end of the selected years`;
  return (
    <div className="mu-year-choice" role="group" aria-label="Borders as of">
      {!compact && (
        <span className="mu-year-choice-cap" aria-hidden="true">
          Borders as of
        </span>
      )}
      <div className="mu-year-seg">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className="mu-btn mu-btn-small mu-year-seg-btn"
            aria-pressed={o.pressed}
            aria-label={describe(o)}
            title={compact ? `${o.year} · ${o.label}` : undefined}
            onClick={() => !o.pressed && onChoose(o.key)}
          >
            {o.year}
            {!compact && <span className="mu-year-seg-sub"> · {o.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// Map instructions say "tap" on touch screens and "click" with a mouse.
const pointerVerb = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "tap" : "click";

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// An opened panel (the Map key) ends above what lies under it - the phone's
// results sheet, and the navigation keys (MapNav) when they sit below it -
// measured as it opens and on resize, so none of its rows are hidden
// (WCAG 2.4.11).
const PANEL_MAX_PX = 420;
function useClearOfSheet(ref, open) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return undefined;
    const fit = () => {
      const view = el.closest(".map-view");
      if (!view) return;
      const box = el.getBoundingClientRect();
      let bottom = view.getBoundingClientRect().bottom - sheetCover(view);
      for (const below of view.querySelectorAll(".mu-nav-keys, .mu-pan-pad")) {
        const b = below.getBoundingClientRect();
        if (b.top > box.top && b.left < box.right && b.right > box.left) bottom = Math.min(bottom, b.top);
      }
      const room = bottom - box.top - 8;
      el.style.maxHeight = `${Math.max(96, Math.min(PANEL_MAX_PX, Math.round(room)))}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref, open]);
}

// The one map toolbar (top-left): searching on the map - draw an area, and
// "Zoom to N results" while a search or filter has mapped matches. What
// the map shows is explained by the Map key (top right); zoom, reset and
// moving the map are in MapNav (bottom right), besides the wheel, pinch,
// double-click and MapLibre's keyboard handler (+ / - and arrows with the map
// focused).
export function MapToolbar({
  areaMode,
  hasArea,
  compact,
  onToggleMode,
  onClearArea,
  onUseView,
  matchCount,
  matchTotal,
  onShowMatches,
  drawHint,
  onInteract,
}) {
  return (
    // onInteract: any use of the toolbar also retires the first-visit tip.
    <div className="mu-toolbar-wrap" onClickCapture={onInteract}>
      <div className="mu-toolbar" role="group" aria-label="Map tools">
        <DrawTools
          areaMode={areaMode}
          hasArea={hasArea}
          onToggle={onToggleMode}
          onClear={onClearArea}
          onUseView={onUseView}
        />
      </div>
      {matchCount != null && (
        <ShowMatchesButton count={matchCount} total={matchTotal} compact={compact} onClick={onShowMatches} />
      )}
      {/* Always in the page, so screen readers announce a hint when it appears. */}
      <div className="mu-draw-status" role="status">
        {drawHint && <div className="mu-draw-hint">{drawHint}</div>}
      </div>
    </div>
  );
}

// A key panel's line icon (MapUi.css .mu-keys): an SVG path in a 20x20 box, so
// every platform draws the same shape at the same weight.
export function KeyIcon({ d, dash }) {
  return (
    <svg className="mu-key-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dash}
      />
    </svg>
  );
}

// ---- a single boundary's details (used by the popup and the Borders list) ----

// `collapsed`: the note and source behind a "Note and source" disclosure (the
// popup, so its "History of this place" stays in sight).
// `b.under` (mapBorders.js foldIncluded): the "...-included" shapes this one is
// drawn over at the clicked point, each with its own status, note and source.
function BoundaryDetails({ b, collapsed = false }) {
  const status = humaniseStatus(b.status);
  const more = (
    <>
      <BoundaryNote note={b.note} className="mu-b-note" />
      <BoundarySource source={b.source} className="mu-b-source" />
      {b.under?.map((u) => (
        <div key={`${u.name}|${u.start_year}|${u.end_year}`} className="mu-b-under">
          <p className="mu-b-under-head">
            <strong>Drawn over:</strong> {u.name} ({yearsLabel(u)}) · {humaniseStatus(u.status) ?? NO_STATUS_LABEL}
          </p>
          <BoundaryNote note={u.note} className="mu-b-note" />
          <BoundarySource source={u.source} className="mu-b-source" />
        </div>
      ))}
    </>
  );
  return (
    <>
      <p className="mu-b-status">
        <span className={`mu-swatch-line ${isDashedStatus(b.status) ? "is-flagged" : "is-solid"}`} aria-hidden="true" />
        {status ?? NO_STATUS_LABEL}
      </p>
      {collapsed && (b.note || b.source) ? (
        <details className="mu-b-more">
          <summary>
            {b.note ? "Note and source" : "Source"}
            <span className="mu-sr"> for {b.name}</span>
          </summary>
          {more}
        </details>
      ) : (
        more
      )}
    </>
  );
}

// `onPlaceHistory({lon, lat})` (optional): "History of this place" for the
// clicked point (popup.lngLat), every year's borders there (PlaceHistory.jsx).
export function BoundaryPopup({ popup, onClose, width, height, onPlaceHistory }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (!isUnhandledEscape(e, ref.current)) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const cardW = Math.min(320, Math.max(0, width - 16));
  const left = Math.max(8, Math.min(popup.point[0] + 12, width - cardW - 8));
  // On phones the results sheet overlaps the bottom of the map, as far as the
  // reader has pulled it up (lib/mapInsets.js); keep clear of it.
  const phone = window.matchMedia?.("(max-width: 768px)").matches;
  const reserve = phone ? Math.max(120, sheetCover(document.querySelector(".map-view")) + 8) : 8;
  const bottomLimit = Math.max(200, height - reserve);
  const top = Math.max(8, Math.min(popup.point[1] + 12, bottomLimit - 180));
  return (
    <div
      ref={ref}
      className="mu-popup"
      role="dialog"
      aria-label="Border details"
      style={{ left, top, width: cardW, maxHeight: Math.max(120, bottomLimit - top) }}
    >
      <button type="button" className="mu-close" onClick={onClose} aria-label="Close border details">
        {"×"}
      </button>
      {popup.hint && <p className="mu-b-note">{popup.hint}</p>}
      {popup.items.map((b) => (
        <section key={`${b.name}|${b.start_year}|${b.end_year}`} className="mu-b-item">
          <h3 className="mu-b-name">{b.name}</h3>
          <p className="mu-b-years">{yearsLabel(b)}</p>
          <BoundaryDetails b={b} collapsed />
        </section>
      ))}
      {onPlaceHistory && popup.lngLat && (
        <p className="mu-b-history">
          <button
            type="button"
            className="mu-btn mu-btn-small"
            onClick={() => onPlaceHistory({ lon: popup.lngLat[0], lat: popup.lngLat[1] })}
          >
            History of this place
          </button>
        </p>
      )}
    </div>
  );
}

// The Map key (top right): one button and one panel for what the map shows,
// with two tabs - the legend, and the Borders list (a keyboard-reachable
// alternative to clicking polygons: every border drawn for the shown year,
// each expandable to the same details). The button doubles as the "borders as
// of YEAR" indicator, so the map never leaves in doubt which year its borders
// are from, with a sub-line while the decade for a newly picked year is still
// loading (which year it is, event or range end, is said by BorderYearChoice
// beside it).
// `yearBeside`: the "Borders as of" choice beside it already prints the drawn
// year (pressed), so the button says just "Borders" (a phone fits the two in
// one row); its accessible name and the Borders tab still give the year.
const KEY_TABS = ["legend", "borders"];
export function MapKey({ year, shownYear, updating, eventYearShown, items, categories = null, yearBeside = false }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("legend"); // kept while the page is open
  const panelRef = useRef(null);
  const tabRefs = useRef({});
  useClearOfSheet(panelRef, open);
  // Escape closes the panel (focus back to its button) unless something inside
  // took that Escape first (lib/escapeKey.js).
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (!isUnhandledEscape(e, wrapRef.current)) return;
      e.preventDefault();
      setOpen(false);
      if (wrapRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const flagged = items.filter((b) => isDashedStatus(b.status)).length;
  const sub = updating && shownYear != null ? `updating to ${year}` : null;
  const n = items.length;
  const yearText = shownYear == null ? "" : yearBeside && !updating ? "" : ` ${shownYear}`;
  const bordersTab = shownYear == null ? "Borders" : `Borders ${shownYear}`;
  // Tabs: arrows, Home and End move between them (and select), as the panel's
  // other tab lists do.
  const onTabKey = (e) => {
    const i = KEY_TABS.indexOf(tab);
    const next =
      e.key === "ArrowRight" ? KEY_TABS[(i + 1) % KEY_TABS.length]
      : e.key === "ArrowLeft" ? KEY_TABS[(i + KEY_TABS.length - 1) % KEY_TABS.length]
      : e.key === "Home" ? KEY_TABS[0]
      : e.key === "End" ? KEY_TABS[KEY_TABS.length - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };
  const tabProps = (k) => ({
    ref: (el) => (tabRefs.current[k] = el),
    type: "button",
    role: "tab",
    id: `mu-key-tab-${k}`,
    className: "mu-key-tab",
    "aria-selected": tab === k,
    "aria-controls": `mu-key-panel-${k}`,
    tabIndex: tab === k ? 0 : -1,
    onClick: () => setTab(k),
    onKeyDown: onTabKey,
  });

  return (
    <div className="mu-borders" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="mu-btn mu-borders-btn"
        aria-expanded={open}
        aria-controls="mu-borders-panel"
        aria-label={`Map key${shownYear != null ? `: borders ${shownYear}${n ? `, ${n} drawn` : ""}` : ""}${sub ? `, ${sub}` : ""}`}
        title={shownYear != null && n ? `Legend, and the ${n} ${n === 1 ? "border" : "borders"} drawn for ${shownYear}` : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mu-borders-main">
          Map key{" "}
          <span className="mu-borders-sep" aria-hidden="true">
            ·
          </span>{" "}
          Borders{yearText}
          {/* Phones drop the "Borders as of" caption of the years beside the
              button (MapUi.css), so the button's own line ends with it. */}
          {yearBeside && !updating && <span className="mu-borders-asof"> as of</span>}
        </span>
        <span className="mu-borders-short">Key</span>
        {sub && <span className="mu-badge-sub mu-borders-sub">{sub}</span>}
      </button>
      {open && (
        <div ref={panelRef} id="mu-borders-panel" className="mu-borders-panel" role="region" aria-label="Map key">
          <div className="mu-key-tabs" role="tablist" aria-label="Map key">
            <button {...tabProps("legend")}>Legend</button>
            <button {...tabProps("borders")}>{bordersTab}</button>
          </div>
          {tab === "legend" ? (
            <div role="tabpanel" id="mu-key-panel-legend" aria-labelledby="mu-key-tab-legend" className="mu-legend">
              <LegendContent categories={categories} />
            </div>
          ) : (
            <div role="tabpanel" id="mu-key-panel-borders" aria-labelledby="mu-key-tab-borders">
              {shownYear == null ? (
                <p className="mu-b-note">The borders are still loading.</p>
              ) : (
                <>
                  <p className="mu-borders-head">
                    Borders drawn for {shownYear}
                    {eventYearShown && !updating ? " (the open event's year)" : ""}: {n}
                    {flagged ? `, ${flagged} status-flagged (dashed)` : ""}. Expand one for its status, note and source.
                  </p>
                  {updating && <p className="mu-b-note">Borders for {year} are still loading.</p>}
                  {n === 0 && <p className="mu-b-note">No borders are loaded for this year yet.</p>}
                  {items.map((b) => (
                    <details key={`${b.name}|${b.start_year}|${b.end_year}`} className="mu-b-list-item">
                      <summary>
                        <span className={`mu-swatch-line ${isDashedStatus(b.status) ? "is-flagged" : "is-solid"}`} aria-hidden="true" />
                        {b.name} <span className="mu-b-years-inline">{yearsLabel(b)}</span>
                      </summary>
                      <BoundaryDetails b={b} />
                    </details>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Alphabetical by label, like the search panel's category list (deliberate:
// no category is put first). Labels are the shared ones (lib/categoryLabels.js).
// Only the groups that have events (`categories`, App's filter chips), so the
// key names no colour the map never draws (Economic has no event).
const LEGEND_CATEGORIES = Object.entries(CATEGORY_COLORS)
  .map(([k, color]) => ({ k, color, label: categoryLabel(k) }))
  .sort((a, b) => a.label.localeCompare(b.label));

function LegendContent({ categories }) {
  const shown = categories ? LEGEND_CATEGORIES.filter(({ k }) => categories.includes(k)) : LEGEND_CATEGORIES;
  return (
    <>
      <h3>Borders</h3>
      <ul>
        <li>
          <span className="mu-swatch-line is-solid" aria-hidden="true" />
          Solid: source-dated border (CShapes geometry)
        </li>
        <li>
          <span className="mu-swatch-line is-flagged" aria-hidden="true" />
          Dashed: status-flagged (mandate, occupation, annexation or dispute). {capitalise(pointerVerb())} it for
          details.
        </li>
      </ul>
      <h3>Events (category is our grouping)</h3>
      <ul className="mu-cats">
        {shown.map(({ k, color, label }) => (
          <li key={k}>
            <span className="mu-dot" style={{ background: color }} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
      <ul>
        <li>
          <span className="mu-dot is-ring" aria-hidden="true" />
          Hollow ring: approximate location (not a precise site)
        </li>
        <li>
          <span className="mu-dot is-cluster" aria-hidden="true">
            9
          </span>
          Cluster: several events; {pointerVerb()} to zoom in, or to list events that share one spot. During a search the
          number counts only the matches.
        </li>
      </ul>
      <h3>Search area</h3>
      <ul>
        <li>
          <span className="mu-swatch-area" aria-hidden="true" />
          Blue dashed outline: area drawn with Draw area
        </li>
      </ul>
    </>
  );
}

export function MapNotices({ loading, borderError, onRetry }) {
  // "Loading map data…" is announced for the first load only: later loads (a
  // new decade's borders, every few seconds during Play) still show it, but
  // outside the live region. A failure is announced by the alert below.
  const [phase, setPhase] = useState(loading ? "loading" : "before"); // before -> loading -> done
  if (loading && phase === "before") setPhase("loading");
  if (!loading && phase === "loading") setPhase("done");
  const live = phase !== "done";
  return (
    <div className="mu-notices">
      {/* The alert is always in the page and its text changes, so screen
          readers announce it; the notice (with its Retry) shows only on failure. */}
      <div role="alert" className="mu-alert">
        {borderError && (
          <div className="mu-notice is-error">
            {/* The land and the borders come from the same /data/ files, so a failure
                leaves plain sea: name the whole map, not only its borders. */}
            <span>{borderError === "final" ? "Map data failed to load." : "Map data failed to load - retrying"}</span>
            <button type="button" className="mu-btn mu-btn-small" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
      </div>
      <div className="mu-loading" role={live ? "status" : undefined} aria-live={live ? "polite" : "off"}>
        {loading && !borderError ? "Loading map data…" : ""}
      </div>
    </div>
  );
}

// First-visit tip: one small line at the bottom centre of the map (just under
// the toolbar on phones, where the results sheet covers the bottom). MapView
// hides it after a few seconds, and for good on the first map interaction or
// toolbar use; the × does the same.
export function MapTip({ onDismiss }) {
  return (
    <div className="mu-tip" role="note">
      <span>Tip: {pointerVerb()} a cluster to zoom in, a dot to read it; Draw searches an area.</span>
      <button type="button" className="mu-close mu-close-inline" onClick={onDismiss} aria-label="Dismiss tip">
        {"×"}
      </button>
    </div>
  );
}
