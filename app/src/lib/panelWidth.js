// The side panel's width when the reader drags or keys its edge (PanelResizer).
// Pure. The CSS keeps the same limits (SidePanel.css .side-panel: clamp(320px,
// var(--panel-w), 60vw)), so a remembered width never squeezes the map after
// the window gets smaller.

export const PANEL_MIN = 320;
/** The widest the panel may be, as a share of the window: the map keeps the rest. */
export const PANEL_MAX_SHARE = 0.6;
export const PANEL_STEP = 20; // arrow keys
export const PANEL_STEP_BIG = 80; // Page Up / Page Down, Shift+arrow
export const STORAGE_KEY = "atlas.panelWidth"; // localStorage, as mapBorders.js HINT_KEY

/** The widest the panel may be in a window `viewportWidth` px wide. */
export function maxPanelWidth(viewportWidth) {
  return Math.max(PANEL_MIN, Math.floor(viewportWidth * PANEL_MAX_SHARE));
}

/** `width` kept between the limits for the window, in whole pixels. */
export function clampPanelWidth(width, viewportWidth) {
  return Math.round(Math.min(Math.max(width, PANEL_MIN), maxPanelWidth(viewportWidth)));
}

/** A remembered width (a string from storage), or null when there is none or it is not a sane width. */
export function parseStoredWidth(raw) {
  if (typeof raw !== "string" || !/^\d{3,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= PANEL_MIN ? n : null;
}

/**
 * The width a key on the panel's edge asks for, from the width shown now, or
 * "reset" (the default width), or null for any other key. The edge is on the
 * panel's left, so Left widens it and Right narrows it, as dragging would.
 */
export function widthForKey(key, shiftKey, current, viewportWidth) {
  const small = shiftKey ? PANEL_STEP_BIG : PANEL_STEP;
  let next;
  if (key === "ArrowLeft") next = current + small;
  else if (key === "ArrowRight") next = current - small;
  else if (key === "PageUp") next = current + PANEL_STEP_BIG;
  else if (key === "PageDown") next = current - PANEL_STEP_BIG;
  else if (key === "Home") next = PANEL_MIN;
  else if (key === "End") next = maxPanelWidth(viewportWidth);
  else if (key === "Enter") return "reset";
  else return null;
  return clampPanelWidth(next, viewportWidth);
}
