// The side panel's width when the reader drags or keys its edge (PanelResizer).
// Pure. The CSS keeps the same limits (SidePanel.css .side-panel: clamp(320px,
// var(--panel-w), min(60vw, 56rem))), so a remembered width never squeezes the
// map after the window gets smaller.

export const PANEL_MIN = 320;
/** The widest the panel may be, as a share of the window: the map keeps the rest. */
export const PANEL_MAX_SHARE = 0.6;
/**
 * And never wider than its content: the event view stops at 53rem
 * (SidePanel.css .event-detail), plus the panel's padding and a scrollbar.
 * Past this, widening would only add empty space.
 */
export const PANEL_MAX_REM = 56;
export const PANEL_STEP = 20; // arrow keys
export const PANEL_STEP_BIG = 80; // Page Up / Page Down, Shift+arrow
export const STORAGE_KEY = "atlas.panelWidth"; // localStorage, as mapBorders.js HINT_KEY

/**
 * The widest the panel may be in a window `viewportWidth` px wide, with a root
 * font size of `remPx` (16 unless the reader set a larger text size).
 */
export function maxPanelWidth(viewportWidth, remPx = 16) {
  return Math.max(PANEL_MIN, Math.min(Math.floor(viewportWidth * PANEL_MAX_SHARE), Math.round(PANEL_MAX_REM * remPx)));
}

/** `width` kept between PANEL_MIN and `max` (maxPanelWidth), in whole pixels. */
export function clampPanelWidth(width, max) {
  return Math.round(Math.min(Math.max(width, PANEL_MIN), max));
}

/** A remembered width (a string from storage), or null when there is none or it is not a sane width. */
export function parseStoredWidth(raw) {
  if (typeof raw !== "string" || !/^\d{3,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= PANEL_MIN ? n : null;
}

/**
 * The width a key on the panel's edge asks for, from the width shown now and
 * the widest it may be (maxPanelWidth), or
 * "reset" (the default width), or null for any other key. The edge is on the
 * panel's left, so Left widens it and Right narrows it, as dragging would.
 */
export function widthForKey(key, shiftKey, current, max) {
  const small = shiftKey ? PANEL_STEP_BIG : PANEL_STEP;
  let next;
  if (key === "ArrowLeft") next = current + small;
  else if (key === "ArrowRight") next = current - small;
  else if (key === "PageUp") next = current + PANEL_STEP_BIG;
  else if (key === "PageDown") next = current - PANEL_STEP_BIG;
  else if (key === "Home") next = PANEL_MIN;
  else if (key === "End") next = max;
  else if (key === "Enter") return "reset";
  else return null;
  return clampPanelWidth(next, max);
}
