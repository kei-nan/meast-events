// Where an opened event lands on the map. On phones the open event fills the
// bottom sheet, which covers all of the map but a strip along its top
// (SidePanel.css: .side-panel[data-sheet="full"] is calc(100% - 120px) of the
// map area), and the map toolbar sits over the top of that strip. Camera moves
// for an opened event aim at the part of the strip left in sight.

export const SHEET_STRIP_PX = 120; // keep in sync with SidePanel.css
// Below this much clear strip under the toolbar, the toolbar is ignored.
const MIN_CLEAR_PX = 40;

/** True when the phone sheet is open over the map (reads the page). */
export function sheetCoversMap() {
  if (typeof document === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(max-width: 768px)").matches && document.querySelector('.side-panel[data-sheet="full"]')
  );
}

/** How far the map toolbar reaches down into `container` (px; 0 without one). Reads the page. */
export function toolbarInset(container) {
  const bar = container?.closest(".map-view")?.querySelector(".mu-toolbar");
  if (!bar) return 0;
  return Math.max(0, bar.getBoundingClientRect().bottom - container.getBoundingClientRect().top);
}

// The clear band of the strip: [top, bottom] in map pixels.
function clearBand(top) {
  return SHEET_STRIP_PX - top >= MIN_CLEAR_PX ? [top, SHEET_STRIP_PX] : [0, SHEET_STRIP_PX];
}

/**
 * flyTo/easeTo `offset` that puts the target in the middle of the strip in
 * sight (below a toolbar reaching `top` px down) of a map `height` px tall;
 * [0, 0] when the sheet is not over the map. Pure.
 */
export function stripOffset(height, covered, top = 0) {
  if (!covered || height <= SHEET_STRIP_PX) return [0, 0];
  const [a, b] = clearBand(top);
  return [0, Math.round((a + b) / 2 - height / 2)];
}
