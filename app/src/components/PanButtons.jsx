import "./PanButtons.css";

// The four directions: label, arrow and which way the view moves (x, y as
// shares of the map's width and height; MapLibre's panBy moves the centre).
const PAN_DIRECTIONS = [
  { key: "up", label: "Pan up", icon: "↑", dx: 0, dy: -1 },
  { key: "left", label: "Pan left", icon: "←", dx: -1, dy: 0 },
  { key: "right", label: "Pan right", icon: "→", dx: 1, dy: 0 },
  { key: "down", label: "Pan down", icon: "↓", dx: 0, dy: 1 },
];

/**
 * Move the map a step without dragging (WCAG 2.5.7): one button per
 * direction, in the zoom buttons' style, under them. Besides MapLibre's own
 * arrow keys (with the map focused) and dragging.
 *
 * @param {object} props
 * @param {(dx:number, dy:number)=>void} props.onPan  a direction, as in PAN_DIRECTIONS (shares of the map's size)
 */
export default function PanButtons({ onPan }) {
  return (
    <div className="mu-zoom mu-pan" role="group" aria-label="Pan the map">
      {PAN_DIRECTIONS.map((d) => (
        <button
          key={d.key}
          type="button"
          className="mu-btn mu-tool mu-icon-only"
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
  );
}
