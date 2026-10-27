import { useState } from "react";
import "./PanButtons.css";

// The four directions: label, arrow and which way the view moves (x, y as
// shares of the map's width and height; MapLibre's panBy moves the centre).
// The key also places the button in the desktop cross (PanButtons.css).
const PAN_DIRECTIONS = [
  { key: "up", label: "Pan up", icon: "↑", dx: 0, dy: -1 },
  { key: "left", label: "Pan left", icon: "←", dx: -1, dy: 0 },
  { key: "right", label: "Pan right", icon: "→", dx: 1, dy: 0 },
  { key: "down", label: "Pan down", icon: "↓", dx: 0, dy: 1 },
];

// "Move map" (phones): four separate chevrons pointing out, with nothing in the
// middle - no centre lines or ring, which would read as a crosshair (project
// rule: no weapon-like visuals). An SVG, so every phone draws the same shape.
function MoveIcon() {
  return (
    <svg className="mu-pan-toggle-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M7 4.5 10 1.5 13 4.5M7 15.5 10 18.5 13 15.5M4.5 7 1.5 10 4.5 13M15.5 7 18.5 10 15.5 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Move the map a step without dragging (WCAG 2.5.7): one button per
 * direction, in the zoom buttons' style, under them - a cross on desktop. On
 * phones, where nearly everyone swipes, the arrows fold behind one "Move map"
 * button (shown only there, PanButtons.css), so they take one button's room
 * until asked for. Besides MapLibre's own arrow keys (with the map focused)
 * and dragging.
 *
 * @param {object} props
 * @param {(dx:number, dy:number)=>void} props.onPan  a direction, as in PAN_DIRECTIONS (shares of the map's size)
 */
export default function PanButtons({ onPan }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mu-pan" data-open={open ? "true" : undefined}>
      <button
        type="button"
        className="mu-btn mu-tool mu-icon-only mu-pan-toggle"
        title="Move map"
        aria-expanded={open}
        aria-controls="mu-pan-arrows"
        onClick={() => setOpen((v) => !v)}
      >
        <MoveIcon />
        <span className="mu-tool-label">Move map</span>
      </button>
      <div id="mu-pan-arrows" className="mu-zoom mu-pan-arrows" role="group" aria-label="Pan the map">
        {PAN_DIRECTIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`mu-btn mu-tool mu-icon-only mu-pan-${d.key}`}
            title={d.label}
            onClick={() => onPan(d.dx, d.dy)}
          >
            <span className="mu-tool-icon" aria-hidden="true">
              {d.icon}
            </span>
            <span className="mu-tool-label">{d.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
