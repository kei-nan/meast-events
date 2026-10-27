import { useEffect, useRef, useState } from "react";
import { CATEGORY_COLORS } from "./mapLayers";
import { humaniseStatus, isDashedStatus, yearsLabel } from "./mapBorders";
import { categoryLabel } from "../lib/categoryLabels";
import { isUnhandledEscape } from "../lib/escapeKey";
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

// Icons are plain shapes and arrows, never a crosshair, scope or bullseye
// (project rule: no weapon-like visuals). "Use map view" is a dashed square like
// the drawn area's outline; "Show results on map" is fit-to-view arrows.
const DRAW_MODES = [
  { mode: "rect", icon: "▭", short: "Rectangle" },
  { mode: "circle", icon: "◯", short: "Circle" },
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
        icon={"⬚"}
        label="Use map view"
        aria-label="Use map view as the search area"
        onClick={() => {
          onUseView();
          closeMenu();
        }}
      />
      {hasArea && (
        <ToolButton
          icon={"✕"}
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
        icon={active ? active.icon : "✎"}
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
  const text = compact ? `Show results (${shown})` : `Show ${shown} results on map`;
  // The accessible name starts with the visible text (voice control users say
  // what they see).
  return (
    <button
      type="button"
      className="mu-btn"
      onClick={onClick}
      title={why ?? undefined}
      aria-label={`${text}${why ? `; ${why}` : ""}`}
    >
      <span aria-hidden="true">{"⤢"}</span> {text}
    </button>
  );
}

// "Borders as of" the two years they can be while an event is open, the drawn one
// pressed (a toggle: docs/design-contract.md "Controls"): the open event's year
// (`eventLabel` "event", or "event start" for a multi-year event) or the end of
// the selected years. Both years are always printed, so the map never leaves
// in doubt which year its borders are from. Phones keep only the two years in
// sight beside the Borders chip; the accessible names keep the words.
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

// The one map toolbar (top-left): draw an area, reset view, legend - plus
// "Show N results on map" while a search or filter has mapped matches. Zoom
// has its own buttons (ZoomButtons, with the Borders control), besides the
// wheel, pinch, double-click and MapLibre's keyboard handler (+ / - with the
// map focused).
export function MapToolbar({
  areaMode,
  hasArea,
  compact,
  onToggleMode,
  onClearArea,
  onUseView,
  onReset,
  matchCount,
  matchTotal,
  onShowMatches,
  drawHint,
  onInteract,
}) {
  const [legendOpen, setLegendOpen] = useState(false);
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
        <ToolButton icon={"↺"} label="Reset view" className="mu-icon-only" onClick={onReset} />
        <button
          type="button"
          className="mu-btn mu-legend-btn"
          aria-expanded={legendOpen}
          aria-controls="mu-legend-panel"
          onClick={() => setLegendOpen((v) => !v)}
        >
          {legendOpen ? "Hide legend" : "Legend"}
        </button>
      </div>
      {matchCount != null && (
        <ShowMatchesButton count={matchCount} total={matchTotal} compact={compact} onClick={onShowMatches} />
      )}
      {/* Always in the page, so screen readers announce a hint when it appears. */}
      <div className="mu-draw-status" role="status">
        {drawHint && <div className="mu-draw-hint">{drawHint}</div>}
      </div>
      {legendOpen && <LegendPanel />}
    </div>
  );
}

// Zoom in / out by one level, animated unless reduced motion is asked for (MapView).
export function ZoomButtons({ onZoomIn, onZoomOut }) {
  return (
    <div className="mu-zoom" role="group" aria-label="Zoom">
      <ToolButton icon="+" label="Zoom in" className="mu-icon-only" onClick={onZoomIn} />
      <ToolButton icon="−" label="Zoom out" className="mu-icon-only" onClick={onZoomOut} />
    </div>
  );
}

// ---- a single boundary's details (used by the popup and the Borders list) ----

function BoundaryDetails({ b }) {
  const status = humaniseStatus(b.status);
  return (
    <>
      <p className="mu-b-status">
        <span className={`mu-swatch-line ${isDashedStatus(b.status) ? "is-flagged" : "is-solid"}`} aria-hidden="true" />
        {status ?? "Source-dated border (no status flag)"}
      </p>
      {b.note && <p className="mu-b-note">{b.note}</p>}
      {b.source && (
        <p className="mu-b-source">
          <strong>Source:</strong> {b.source}
        </p>
      )}
    </>
  );
}

export function BoundaryPopup({ popup, onClose, width, height }) {
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
          <BoundaryDetails b={b} />
        </section>
      ))}
    </div>
  );
}

// Keyboard-reachable alternative to clicking polygons: every border drawn for
// the shown year, each expandable to the same details. Its button doubles as
// the "borders as of YEAR" indicator, with a sub-line while the decade for a
// newly picked year is still loading (which year it is, event or range end, is
// said by BorderYearChoice beside it).
// `yearBeside`: the "Borders as of" choice beside it already prints the drawn
// year (pressed), so the chip says just "Borders" (a phone fits the two in one
// row); its accessible name and the opened list still give the year.
export function BordersList({ year, shownYear, updating, eventYearShown, items, compact, yearBeside = false }) {
  const [open, setOpen] = useState(false);
  const flagged = items.filter((b) => isDashedStatus(b.status)).length;
  if (shownYear == null) return null;
  const sub = updating ? `updating to ${year}` : null;
  const n = items.length;
  const countText = `${n} ${n === 1 ? "border" : "borders"} drawn for ${shownYear}`;
  return (
    <div className="mu-borders">
      {/* A bare "(21)" read as unexplained, so the count says what it counts.
          Phones leave it out to keep the chip one line; the opened list
          starts with the same count, and the title / name carry it too. */}
      <button
        type="button"
        className="mu-btn mu-borders-btn"
        aria-expanded={open}
        aria-controls="mu-borders-panel"
        aria-label={`Borders ${shownYear}${n ? `: ${n} drawn` : ""}${sub ? `, ${sub}` : ""}. Show the list`}
        title={n ? countText : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mu-borders-main">
          Borders{yearBeside && !updating ? "" : ` ${shownYear}`}
          {n > 0 && !compact ? <span className="mu-badge-sub"> · {n} drawn</span> : null}
        </span>
        {sub && <span className="mu-badge-sub mu-borders-sub">{sub}</span>}
      </button>
      {open && (
        <div id="mu-borders-panel" className="mu-borders-panel" role="region" aria-label={`Borders drawn for ${shownYear}`}>
          <p className="mu-borders-head">
            Borders drawn for {shownYear}
            {eventYearShown && !updating ? " (the open event's year)" : ""}: {items.length}
            {flagged ? `, ${flagged} status-flagged (dashed)` : ""}. Expand one for its status, note and source.
          </p>
          {updating && <p className="mu-b-note">Borders for {year} are still loading.</p>}
          {items.length === 0 && <p className="mu-b-note">No borders are loaded for this year yet.</p>}
          {items.map((b) => (
            <details key={`${b.name}|${b.start_year}|${b.end_year}`} className="mu-b-list-item">
              <summary>
                <span className={`mu-swatch-line ${isDashedStatus(b.status) ? "is-flagged" : "is-solid"}`} aria-hidden="true" />
                {b.name} <span className="mu-b-years-inline">{yearsLabel(b)}</span>
              </summary>
              <BoundaryDetails b={b} />
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

// Alphabetical by label, like the search panel's category list (deliberate:
// no category is put first). Labels are the shared ones (lib/categoryLabels.js).
const LEGEND_CATEGORIES = Object.entries(CATEGORY_COLORS)
  .map(([k, color]) => ({ k, color, label: categoryLabel(k) }))
  .sort((a, b) => a.label.localeCompare(b.label));

function LegendPanel() {
  return (
    <div id="mu-legend-panel" className="mu-legend-panel" role="region" aria-label="Map legend">
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
        {LEGEND_CATEGORIES.map(({ k, color, label }) => (
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
    </div>
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
