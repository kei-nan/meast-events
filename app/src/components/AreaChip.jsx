/**
 * Area row: shows the active area (removable) and the "Only in current map
 * view" toggle. The area itself is drawn with the map's own buttons (the one
 * control set); this row only displays and clears the same `area` state.
 * Pure presentational.
 */
function describeArea(area) {
  if (!area) return null;
  if (area.type === "circle") {
    const km = Math.round(area.radiusKm ?? 0);
    return `Area: ${km} km circle`;
  }
  return "Area: rectangle";
}

/**
 * The removable area chip, or a short note while an area is being drawn.
 * Renders nothing otherwise (the draw tools live on the map).
 */
export function AreaTag({ area, areaMode, onAreaChange, onRemoved }) {
  const label = describeArea(area);
  if (label) {
    return (
      <span className="sp-chip sp-chip--area">
        <span>{label}</span>
        <button
          type="button"
          className="sp-chip-x"
          aria-label={`Remove ${label.toLowerCase()}`}
          onClick={() => {
            onAreaChange?.(null);
            onRemoved?.();
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      </span>
    );
  }
  if (areaMode && areaMode !== "off") {
    return <span className="sp-muted sp-area-hint">Drawing an area on the map…</span>;
  }
  return null;
}

export default function AreaChip({
  area,
  areaMode,
  onAreaChange,
  inView,
  onInViewChange,
  viewCount,
}) {
  return (
    <div className="sp-area">
      {(area || (areaMode && areaMode !== "off")) && (
        <div className="sp-area-row">
          <AreaTag area={area} areaMode={areaMode} onAreaChange={onAreaChange} />
        </div>
      )}
      <label className="sp-check">
        <input
          type="checkbox"
          checked={!!inView}
          onChange={(e) => onInViewChange?.(e.target.checked)}
        />
        <span>
          Only in current map view
          {typeof viewCount === "number" && (
            <span className="sp-muted">
              {" "}
              ({viewCount.toLocaleString("en-US")} {viewCount === 1 ? "event" : "events"} in view)
            </span>
          )}
        </span>
      </label>
    </div>
  );
}
