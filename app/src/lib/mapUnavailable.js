// The panel's controls that act on the map ("Only in current map view", "Find
// on map") while there is no map: its code could not be loaded, or MapLibre
// could not start (no WebGL 2). App.jsx's map stand-ins report "failed" and a
// map that has drawn reports "ready" (MapView.jsx onMapStatus), so the controls
// come back if the map loads after all. Pure.

// Whether the map is unavailable after a status report ("failed" | "ready").
export const mapUnavailableAfter = (status) => status === "failed";

// The short reason, shown beside a disabled checkbox and read out with a button.
export const MAP_UNAVAILABLE_NOTE = "the map is not available";

// Props for a button that needs the map: aria-disabled (it keeps its place in
// the tab order and can still say why), the reason as a tooltip, and the click
// dropped. With the map: only the click.
export function needsMapButton(unavailable, onClick) {
  if (!unavailable) return { onClick };
  return { "aria-disabled": "true", title: `Needs the map; ${MAP_UNAVAILABLE_NOTE}`, onClick: undefined };
}
