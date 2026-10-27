import { useState } from "react";
import { KeyIcon } from "./MapUi";
import "./PanButtons.css";

// The four directions: label, chevron (KeyIcon path) and which way the view
// moves (x, y as shares of the map's width and height; MapLibre's panBy moves
// the centre). The key also places the button in the pad (PanButtons.css).
const PAN_DIRECTIONS = [
  { key: "up", label: "Pan up", path: "M5 12.5 10 7.5 15 12.5", dx: 0, dy: -1 },
  { key: "left", label: "Pan left", path: "M12.5 5 7.5 10 12.5 15", dx: -1, dy: 0 },
  { key: "right", label: "Pan right", path: "M7.5 5 12.5 10 7.5 15", dx: 1, dy: 0 },
  { key: "down", label: "Pan down", path: "M5 7.5 10 12.5 15 7.5", dx: 0, dy: 1 },
];

// "Move map" (phones): the pad's four chevrons in small, pointing out, with
// nothing in the middle - no centre lines or ring, which would read as a
// crosshair (project rule: no weapon-like visuals).
const MOVE_ICON = "M7.5 4.5 10 2 12.5 4.5M7.5 15.5 10 18 12.5 15.5M4.5 7.5 2 10 4.5 12.5M15.5 7.5 18 10 15.5 12.5";

/**
 * Move the map a step without dragging (WCAG 2.5.7): a pad of four chevrons
 * in one key panel (MapUi.css .mu-keys, like the zoom pair above it). On
 * phones, where nearly everyone swipes, the pad folds behind one "Move map"
 * button (shown only there, PanButtons.css), so it takes one button's room
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
        aria-controls="mu-pan-pad"
        onClick={() => setOpen((v) => !v)}
      >
        <KeyIcon d={MOVE_ICON} />
        <span className="mu-tool-label">Move map</span>
      </button>
      <div id="mu-pan-pad" className="mu-keys mu-pan-pad" role="group" aria-label="Pan the map">
        {PAN_DIRECTIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`mu-key mu-pan-${d.key}`}
            title={d.label}
            aria-label={d.label}
            onClick={() => onPan(d.dx, d.dy)}
          >
            <KeyIcon d={d.path} />
          </button>
        ))}
      </div>
    </div>
  );
}
