// Where an opened event lands on the map. On phones the open event fills the
// bottom sheet, which covers the map from the bottom (half of it, or all but a
// strip along its top: lib/sheetSnap.js; the reader can drag it between), and
// the map toolbar sits over the top of what is left. Camera moves for an opened
// event aim at the part of the map left in sight above the sheet.

// Below this much clear strip under the toolbar, the toolbar is ignored.
const MIN_CLEAR_PX = 40;

const isPhone = () => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 768px)").matches;

/**
 * How much of `container` (the map) the phone sheet covers from the bottom, in
 * px: 0 on wider screens or without a sheet. Any sheet position, peek included.
 * Reads the page.
 */
export function sheetCover(container) {
  if (typeof document === "undefined" || !container || !isPhone()) return 0;
  const sheet = document.querySelector(".side-panel");
  if (!sheet) return 0;
  const box = container.getBoundingClientRect();
  return Math.max(0, Math.round(box.bottom - Math.max(box.top, sheet.getBoundingClientRect().top)));
}

/**
 * The map strip in sight above the open phone sheet (px from the map's top),
 * or null when the sheet is not open over the map (wider screens, or the sheet
 * at its peek bar). Reads the page.
 */
export function sheetStrip(container) {
  if (typeof document === "undefined" || !container) return null;
  if (!isPhone() || document.querySelector('.side-panel[data-sheet="peek"]')) return null;
  return Math.max(0, container.clientHeight - sheetCover(container));
}

/** How far the map toolbar reaches down into `container` (px; 0 without one). Reads the page. */
export function toolbarInset(container) {
  const bar = container?.closest(".map-view")?.querySelector(".mu-toolbar");
  if (!bar) return 0;
  return Math.max(0, bar.getBoundingClientRect().bottom - container.getBoundingClientRect().top);
}

// The clear band of the strip: [top, bottom] in map pixels.
function clearBand(strip, top) {
  return strip - top >= MIN_CLEAR_PX ? [top, strip] : [0, strip];
}

/**
 * flyTo/easeTo `offset` that puts the target in the middle of the strip in
 * sight (`strip` px from the top, below a toolbar reaching `top` px down) of a
 * map `height` px tall; [0, 0] when the sheet is not over the map (`strip`
 * null) or leaves all of it. Pure.
 */
export function stripOffset(height, strip, top = 0) {
  if (strip == null || strip >= height || strip <= 0) return [0, 0];
  const [a, b] = clearBand(strip, top);
  return [0, Math.round((a + b) / 2 - height / 2)];
}
