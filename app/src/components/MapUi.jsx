import { useEffect, useRef, useState } from "react";
import { CATEGORY_COLORS } from "./mapLayers";
import { humaniseStatus, isDashedStatus, yearsLabel } from "./mapBorders";
import "./MapUi.css";

// ---- search-area draw tools ----

const DRAW_MODES = [
  { mode: "rect", icon: "▭", label: "Draw rectangle", short: "Rectangle" },
  { mode: "circle", icon: "◯", label: "Draw circle", short: "Circle" },
];

// Desktop: one button per shape. Phones (compact): a single "Draw" button that
// opens the two choices, so fewer controls float over a small map.
export function DrawTools({ areaMode, onToggle, compact }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onDown = (e) => !wrapRef.current?.contains(e.target) && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (!compact) {
    return DRAW_MODES.map((d) => (
      <button
        key={d.mode}
        type="button"
        className="mu-btn"
        aria-pressed={areaMode === d.mode}
        onClick={() => onToggle(d.mode)}
      >
        {d.icon} {d.label}
      </button>
    ));
  }
  const active = DRAW_MODES.find((d) => d.mode === areaMode);
  return (
    <div className="mu-draw" ref={wrapRef}>
      <button
        type="button"
        className="mu-btn"
        aria-expanded={open}
        aria-controls="mu-draw-menu"
        aria-pressed={!!active}
        onClick={() => setOpen((v) => !v)}
      >
        {active ? `${active.icon} Drawing ${active.short.toLowerCase()}` : "✎ Draw"}
      </button>
      {open && (
        <div id="mu-draw-menu" className="mu-draw-menu" role="group" aria-label="Draw a search area">
          {DRAW_MODES.map((d) => (
            <button
              key={d.mode}
              type="button"
              className="mu-btn"
              aria-pressed={areaMode === d.mode}
              onClick={() => {
                onToggle(d.mode);
                setOpen(false);
              }}
            >
              {d.icon} {d.short}
            </button>
          ))}
        </div>
      )}
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
    const onKey = (e) => e.key === "Escape" && onClose();
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
// the current year, each expandable to the same details.
export function BordersList({ year, items }) {
  const [open, setOpen] = useState(false);
  const flagged = items.filter((b) => isDashedStatus(b.status)).length;
  return (
    <div className="mu-borders">
      <button
        type="button"
        className="mu-btn"
        aria-expanded={open}
        aria-controls="mu-borders-panel"
        onClick={() => setOpen((v) => !v)}
      >
        Borders{items.length ? ` (${items.length})` : ""}
      </button>
      {open && (
        <div id="mu-borders-panel" className="mu-borders-panel" role="region" aria-label={`Borders drawn for ${year}`}>
          <p className="mu-borders-head">
            Borders drawn for {year}: {items.length}
            {flagged ? `, ${flagged} status-flagged (dashed)` : ""}. Expand one for its status, note and source.
          </p>
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

const CATEGORY_TEXT = {
  war: "War",
  treaty: "Treaty",
  political: "Political",
  uprising: "Uprising",
  migration: "Migration",
  diplomatic: "Diplomatic",
  economic: "Economic",
  terrorism: "Terrorism",
  atrocity: "Atrocity (genocide, massacre, war crime)",
};

export function MapLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mu-legend">
      <button
        type="button"
        className="mu-btn"
        aria-expanded={open}
        aria-controls="mu-legend-panel"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide legend" : "Legend"}
      </button>
      {open && (
        <div id="mu-legend-panel" className="mu-legend-panel" role="region" aria-label="Map legend">
          <h3>Borders</h3>
          <ul>
            <li>
              <span className="mu-swatch-line is-solid" aria-hidden="true" />
              Solid: source-dated border (CShapes geometry)
            </li>
            <li>
              <span className="mu-swatch-line is-flagged" aria-hidden="true" />
              Dashed: status-flagged (mandate, occupation, annexation or dispute). Click it for details.
            </li>
          </ul>
          <h3>Events (category is our grouping)</h3>
          <ul className="mu-cats">
            {Object.entries(CATEGORY_COLORS).map(([k, color]) => (
              <li key={k}>
                <span className="mu-dot" style={{ background: color }} aria-hidden="true" />
                {CATEGORY_TEXT[k] ?? k}
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
              Cluster: several events; click to zoom in, or to list events that share one spot
            </li>
          </ul>
          <h3>Search area</h3>
          <ul>
            <li>
              <span className="mu-swatch-area" aria-hidden="true" />
              Blue dashed outline: area drawn with the Draw tools
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

export function MapNotices({ loading, borderError, onRetry, hint, onDismissHint }) {
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
      {hint && (
        <div className="mu-notice mu-hint">
          <span>Click a cluster to zoom in, a dot to read; use Draw to search an area.</span>
          <button type="button" className="mu-close mu-close-inline" onClick={onDismissHint} aria-label="Dismiss hint">
            {"×"}
          </button>
        </div>
      )}
    </div>
  );
}
