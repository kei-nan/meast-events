// The camera for the link (App.jsx, lib/urlState.js `m`), reported only for the
// moves a user makes: a drag, wheel, pinch, MapLibre's own keyboard pan/zoom
// (those carry the browser event as `originalEvent`), and the moves the app
// makes on a user's request (the zoom, pan and reset keys, a cluster clicked,
// "Zoom to results"), which pass USER_MOVE as their event data. The app's own
// moves (the flight to an event or place opened, a country fit, the camera kept
// clear of the phone sheet) are not: a link nobody moved keeps no `m`, and a
// link with one opens there instead of where the event would have flown to.

/** Event data for a map method moved on a user's request: `map.zoomIn(opts, USER_MOVE)`. */
export const USER_MOVE = Object.freeze({ userMove: true });

/** @param {{originalEvent?: unknown, userMove?: boolean} | undefined} e a MapLibre move event */
export const isUserMove = (e) => !!(e?.originalEvent || e?.userMove);

// MapLibre 6.16 leaves out `originalEvent` on the moves of a single wheel
// notch (measured: movestart, zoomend and moveend all without it; a run of
// notches has it on moveend). Its scroll handler starts that move about 40 ms
// after the wheel event, so a move starting this soon after one is the wheel's.
const WHEEL_START_MS = 300;

/**
 * Calls onCameraChange({lon, lat, zoom}) `delayMs` after a user's move settles
 * (an arrow key held down, or a fling, ends many moves in a row). Returns the
 * cleanup.
 */
export function reportUserCamera(map, onCameraChange, delayMs = 200, now = () => Date.now()) {
  let timeoutId;
  let lastWheel = -Infinity;
  let wheelMove = false; // the move in progress started from a wheel
  const report = () => {
    const c = map.getCenter();
    onCameraChange({ lon: c.lng, lat: c.lat, zoom: map.getZoom() });
  };
  const handleWheel = () => {
    lastWheel = now();
  };
  const handleMoveStart = () => {
    wheelMove = now() - lastWheel <= WHEEL_START_MS;
  };
  const handleMoveEnd = (e) => {
    const user = isUserMove(e) || wheelMove;
    wheelMove = false;
    if (!user) return;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(report, delayMs);
  };
  map.on("wheel", handleWheel);
  map.on("movestart", handleMoveStart);
  map.on("moveend", handleMoveEnd);
  return () => {
    clearTimeout(timeoutId);
    map.off("wheel", handleWheel);
    map.off("movestart", handleMoveStart);
    map.off("moveend", handleMoveEnd);
  };
}
