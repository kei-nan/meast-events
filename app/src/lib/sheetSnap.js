// The phone results sheet's resting heights and where a drag of its bar ends
// (hooks/useSheetDrag.js). Pure. Heights are px of the map area (.app-body)
// the sheet covers from the bottom.
//
//   peek  the bar and the search box only (its own height, measured);
//   half  half the map area (SidePanel.css .side-panel[data-sheet="half"]);
//   full  all of it but a strip along the top that keeps the event's place in
//         sight (SHEET_STRIP_PX, as .side-panel[data-sheet="full"]).

export const SHEET_STRIP_PX = 120; // keep in sync with SidePanel.css
export const HALF_SHARE = 0.5; // keep in sync with SidePanel.css
// Half is left out when it would be this close to peek or full (a short screen).
const MIN_GAP_PX = 64;
// A release faster than this (px per ms) carries on to the next height that way.
export const FLICK_PX_PER_MS = 0.5;

/**
 * The resting heights, lowest first: [{name, h}] for peek, half (when there is
 * room for it between the other two) and full, in a map area `areaH` px tall
 * with a peek height of `peekH` px.
 */
export function sheetDetents(areaH, peekH) {
  const full = Math.max(peekH, areaH - SHEET_STRIP_PX);
  const half = Math.round(areaH * HALF_SHARE);
  const out = [{ name: "peek", h: peekH }];
  if (half - peekH >= MIN_GAP_PX && full - half >= MIN_GAP_PX) out.push({ name: "half", h: half });
  out.push({ name: "full", h: full });
  return out;
}

/** `h` kept between the lowest and highest resting heights. */
export function clampSheet(h, detents) {
  return Math.min(Math.max(h, detents[0].h), detents.at(-1).h);
}

/**
 * Where a drag released at height `h` comes to rest: with a flick (|velocity|
 * of at least FLICK_PX_PER_MS; positive = growing) the next resting height in
 * that direction, else the nearest one. Returns its name.
 */
export function snapSheet(h, velocity, detents) {
  if (Math.abs(velocity) >= FLICK_PX_PER_MS) {
    const ahead = velocity > 0 ? detents.find((d) => d.h > h) : detents.findLast((d) => d.h < h);
    return (ahead ?? (velocity > 0 ? detents.at(-1) : detents[0])).name;
  }
  let best = detents[0];
  for (const d of detents) if (Math.abs(d.h - h) < Math.abs(best.h - h)) best = d;
  return best.name;
}

/**
 * One step from resting height `name` (the arrow keys on the bar): `dir` +1 up
 * (taller), -1 down. Stays at the ends. A name not among `detents` (half on a
 * short screen) steps from the nearest one below it.
 */
export function stepSheet(name, dir, detents) {
  const names = detents.map((d) => d.name);
  let i = names.indexOf(name);
  if (i < 0) i = name === "half" ? 0 : names.length - 1;
  return names[Math.min(Math.max(i + dir, 0), names.length - 1)];
}
