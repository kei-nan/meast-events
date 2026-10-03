import { useEffect, useRef } from "react";
import { CATEGORY_COLORS } from "./mapLayers";

// Events that share one spot on the map (capital-pinned "approximate" events,
// or a cluster no zoom level can split): listed in a card at the click point.
// Same placement rules as BoundaryPopup: clamped to the map, clear of the
// phone results sheet, Escape closes.
export default function ClusterList({ list, onSelect, onClose, width, height }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Move focus into the card so keyboard and screen-reader users land on the list.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [list]);

  const cardW = Math.min(320, Math.max(0, width - 16));
  const left = Math.max(8, Math.min(list.point[0] + 12, width - cardW - 8));
  const reserve = window.matchMedia?.("(max-width: 768px)").matches ? 120 : 8;
  const bottomLimit = Math.max(200, height - reserve);
  const top = Math.max(8, Math.min(list.point[1] + 12, bottomLimit - 220));
  const { items, total, oneSpot } = list;
  const allApprox = items.length > 0 && items.every((i) => i.approx);
  const headingId = "mu-stack-heading";
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="mu-popup mu-stack"
      role="dialog"
      aria-labelledby={headingId}
      style={{ left, top, width: cardW, maxHeight: Math.max(140, bottomLimit - top) }}
    >
      <button type="button" className="mu-close" onClick={onClose} aria-label="Close event list">
        {"×"}
      </button>
      <h3 id={headingId} className="mu-b-name">
        {total} events {oneSpot ? "at this spot" : "here"}
      </h3>
      {allApprox && (
        <p className="mu-stack-note">Approximate locations: pinned to a capital or region, not the exact site.</p>
      )}
      {total > items.length && <p className="mu-stack-note">Showing the first {items.length}.</p>}
      <ul className="mu-stack-list">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              className={`mu-stack-item${it.match ? "" : " is-miss"}`}
              onClick={() => onSelect(it.id)}
            >
              <span
                className={`mu-dot${it.approx ? " is-ring is-small" : ""}`}
                style={
                  it.approx
                    ? { borderColor: CATEGORY_COLORS[it.category] ?? "#6b6151" }
                    : { background: CATEGORY_COLORS[it.category] ?? "#6b6151" }
                }
                aria-hidden="true"
              />
              <span className="mu-stack-title">{it.title}</span>
              {it.year && <span className="mu-stack-year">{it.year}</span>}
              {!it.match && <span className="mu-visually-hidden"> (not a search match)</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
