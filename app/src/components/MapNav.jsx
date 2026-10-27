import { useEffect, useRef, useState } from "react";
import { KeyIcon } from "./MapUi";
import { isUnhandledEscape } from "../lib/escapeKey";
import "./MapNav.css";

// Key icons (KeyIcon paths, 20x20).
const ZOOM_IN = "M10 4.5v11M4.5 10h11";
const ZOOM_OUT = "M4.5 10h11";
// An open circle with its arrowhead, like "↺".
const RESET = "M5.4 6.6A6 6 0 1 1 4 10.6M5.4 2.8v3.8h3.8";
// "Move map": four chevrons pointing out with nothing in the middle - no
// centre lines or ring, which would read as a crosshair (project rule: no
// weapon-like visuals).
const MOVE = "M7.5 4.5 10 2 12.5 4.5M7.5 15.5 10 18 12.5 15.5M4.5 7.5 2 10 4.5 12.5M15.5 7.5 18 10 15.5 12.5";

// The pad's four directions: label, chevron and which way the view moves (x,
// y as shares of the map's width and height; MapLibre's panBy moves the
// centre). The key also places the button in the pad (MapNav.css).
const PAN_DIRECTIONS = [
  { key: "up", label: "Pan up", path: "M5 12.5 10 7.5 15 12.5", dx: 0, dy: -1 },
  { key: "left", label: "Pan left", path: "M12.5 5 7.5 10 12.5 15", dx: -1, dy: 0 },
  { key: "right", label: "Pan right", path: "M7.5 5 12.5 10 7.5 15", dx: 1, dy: 0 },
  { key: "down", label: "Pan down", path: "M5 7.5 10 12.5 15 7.5", dx: 0, dy: 1 },
];

function Key({ label, d, className = "", ...rest }) {
  return (
    <button type="button" className={`mu-key ${className}`} title={label} aria-label={label} {...rest}>
      <KeyIcon d={d} />
    </button>
  );
}

/**
 * The map's navigation, in one key panel (MapUi.css .mu-keys) that stays put:
 * zoom in, zoom out, reset view and "Move map", which opens a pad of four
 * pan keys beside it - the way to move the map without dragging (WCAG 2.5.7),
 * besides MapLibre's own arrow keys (with the map focused). It sits apart from
 * the Borders control and the "Borders as of" years, so nothing they show
 * moves it: bottom right on wider screens, a row under the Borders chip on
 * phones (MapNav.css). The pad stays open while it is used (each press pans a
 * step) until "Move map" is pressed again or Escape.
 *
 * @param {object} props
 * @param {() => void} props.onZoomIn
 * @param {() => void} props.onZoomOut
 * @param {() => void} props.onReset
 * @param {(dx:number, dy:number)=>void} props.onPan  a direction, as in PAN_DIRECTIONS (shares of the map's size)
 */
export default function MapNav({ onZoomIn, onZoomOut, onReset, onPan }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const moveRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (!isUnhandledEscape(e, wrapRef.current)) return;
      e.preventDefault();
      setOpen(false);
      if (wrapRef.current?.contains(document.activeElement)) moveRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="mu-nav" ref={wrapRef}>
      <div className="mu-keys mu-nav-keys" role="group" aria-label="Map view">
        <Key label="Zoom in" d={ZOOM_IN} onClick={onZoomIn} />
        <Key label="Zoom out" d={ZOOM_OUT} onClick={onZoomOut} />
        <Key label="Reset view" d={RESET} className="mu-nav-extra mu-nav-reset" onClick={onReset} />
        <Key
          ref={moveRef}
          label="Move map"
          d={MOVE}
          className="mu-nav-extra"
          aria-expanded={open}
          aria-controls="mu-pan-pad"
          onClick={() => setOpen((v) => !v)}
        />
      </div>
      {open && (
        <div id="mu-pan-pad" className="mu-keys mu-pan-pad" role="group" aria-label="Pan the map">
          {PAN_DIRECTIONS.map((d) => (
            <Key key={d.key} label={d.label} d={d.path} className={`mu-pan-${d.key}`} onClick={() => onPan(d.dx, d.dy)} />
          ))}
        </div>
      )}
    </div>
  );
}
