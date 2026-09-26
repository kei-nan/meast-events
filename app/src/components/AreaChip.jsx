/**
 * Area row: the active-area chip (removable), the "Select area" mode group and
 * the "Only in current map view" toggle. Pure presentational.
 */
function describeArea(area) {
  if (!area) return null;
  if (area.type === "circle") {
    const km = Math.round(area.radiusKm ?? 0);
    return `Area: ${km} km circle`;
  }
  return "Area: rectangle";
}

const MODES = [
  { id: "rect", label: "Rectangle" },
  { id: "circle", label: "Circle" },
  { id: "off", label: "Off" },
];

export default function AreaChip({
  area,
  areaMode,
  onAreaModeChange,
  onAreaChange,
  inView,
  onInViewChange,
  viewCount,
}) {
  const label = describeArea(area);
  return (
    <div className="sp-area">
      <div className="sp-area-row">
        {label && (
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
        )}
        <div className="sp-seg" role="group" aria-label="Select area on the map">
          <span className="sp-seg-label" aria-hidden="true">
            Select area
          </span>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="sp-seg-btn"
              aria-pressed={areaMode === m.id}
              onClick={() => onAreaModeChange?.(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
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
            <span className="sp-muted"> ({viewCount} in view)</span>
          )}
        </span>
      </label>
    </div>
  );
}
