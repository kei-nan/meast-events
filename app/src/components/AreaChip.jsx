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

export default function AreaChip({
  area,
  areaMode,
  onAreaChange,
  inView,
  onInViewChange,
  viewCount,
}) {
  const label = describeArea(area);
  return (
    <div className="sp-area">
      <div className="sp-area-row">
        {label ? (
          <span className="sp-chip sp-chip--area">
            <span>{label}</span>
            <button
              type="button"
              className="sp-chip-x"
              aria-label={`Remove ${label.toLowerCase()}`}
              onClick={() => onAreaChange?.(null)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </span>
        ) : (
          <span className="sp-muted sp-area-hint">
            {areaMode === "off"
              ? "No area selected. Use the draw buttons on the map to search an area."
              : "Drawing an area on the map…"}
          </span>
        )}
      </div>
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
