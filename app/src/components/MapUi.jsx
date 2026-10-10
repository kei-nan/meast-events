import { useEffect, useRef, useState } from "react";
import { CATEGORY_COLORS } from "./mapLayers";
import { humaniseStatus, isDashedStatus, yearsLabel } from "./mapBorders";
import { categoryLabel } from "../lib/categoryLabels";
import { isUnhandledEscape } from "../lib/escapeKey";
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

const DRAW_MODES = [
  { mode: "rect", icon: "▭", label: "Draw rectangle", short: "Rectangle" },
  { mode: "circle", icon: "◯", label: "Draw circle", short: "Circle" },
];

// Search-area drawing: one "Draw area" button opens the shapes (and Clear area)
// as a row under the toolbar, so fewer controls float over the map. Phones
// show the button as its icon only (MapUi.css).
function DrawTools({ areaMode, hasArea, onToggle, onClear }) {
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
          aria-label={d.label}
          aria-pressed={areaMode === d.mode}
          onClick={() => {
            onToggle(d.mode);
            closeMenu();
          }}
        />
      ))}
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
      {/* A menu button: aria-expanded only. Its name already says when a mode is on. */}
      <ToolButton
        ref={buttonRef}
        className={active ? "is-on" : ""}
        icon={active ? active.icon : "✎"}
        label={active ? `Drawing ${active.short.toLowerCase()}` : "Draw area"}
        aria-label={active ? `Drawing ${active.short.toLowerCase()}` : "Draw a search area"}
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
      {"◎"} {text}
    </button>
  );
}

// "Use 2026" / "Use 1901" next to the Borders chip. Phones get the short
// form so the two sit in one row; the accessible name still says which year.
export function YearToggle({ useTimeline, timelineYear, eventYear, compact, onClick }) {
  const full = useTimeline ? `Use timeline year (${timelineYear})` : `Use event year (${eventYear})`;
  const short = `Use ${useTimeline ? timelineYear : eventYear}`;
  const kind = useTimeline ? "the timeline year" : "the event year";
  return (
    <button
      type="button"
      className="mu-btn mu-btn-small mu-year-toggle"
      onClick={onClick}
      aria-label={compact ? `${short}, ${kind}, for the borders` : `${full} for the borders`}
      title={compact ? full : undefined}
    >
      {compact ? short : full}
    </button>
  );
}

// Map instructions say "tap" on touch screens and "click" with a mouse.
const pointerVerb = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "tap" : "click";

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The one map toolbar (top-left): draw an area, reset view, legend - plus
// "Show N results on map" while a search or filter has mapped matches. There
// are no zoom buttons: the wheel, pinch, double-click and MapLibre's keyboard
// handler (+ / - with the map focused) zoom.
export function MapToolbar({
  areaMode,
  hasArea,
  compact,
  onToggleMode,
  onClearArea,
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
        <DrawTools areaMode={areaMode} hasArea={hasArea} onToggle={onToggleMode} onClear={onClearArea} />
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
      {drawHint && (
        <div className="mu-draw-hint" role="status">
          {drawHint}
        </div>
      )}
      {legendOpen && <LegendPanel />}
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
  // On phones the results sheet overlaps the bottom of the map; keep clear of it.
  const reserve = window.matchMedia?.("(max-width: 768px)").matches ? 120 : 8;
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
// the "borders as of YEAR" indicator, with a sub-line for the opened event's
// year or while the decade for a newly picked year is still loading.
export function BordersList({ year, shownYear, updating, eventYearShown, items, compact }) {
  const [open, setOpen] = useState(false);
  const flagged = items.filter((b) => isDashedStatus(b.status)).length;
  if (shownYear == null) return null;
  const sub = updating ? `updating to ${year}` : eventYearShown ? "event year" : null;
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
          Borders {shownYear}
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
  return (
    <div className="mu-notices">
      {borderError && (
        <div className="mu-notice is-error" role="alert">
          <span>{borderError === "final" ? "Borders failed to load." : "Borders failed to load - retrying"}</span>
          <button type="button" className="mu-btn mu-btn-small" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      <div className="mu-loading" role="status" aria-live="polite">
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
