// Two-handle year slider logic for the timeline. Pure.

import { MAX_YEAR, MIN_YEAR } from "./years.js";

/**
 * Which handle a press at `pos` (a fractional year) grabs. `slop` is the
 * thumb's radius in years: a press within it is on that thumb.
 *
 * Where both thumbs are under the pointer (a single year, or a short range on
 * a narrow screen) neither is preferred: returns null and the first move
 * decides (handleForDirection), so the range always widens the way it is
 * dragged instead of collapsing. A press on one thumb grabs it; a press off
 * both thumbs goes to the nearest handle.
 */
export function pickHandle(start, end, pos, slop) {
  const onStart = Math.abs(pos - start) <= slop;
  const onEnd = Math.abs(pos - end) <= slop;
  if (onStart && onEnd) return null;
  if (onStart) return "start";
  if (onEnd) return "end";
  if (pos < start) return "start";
  if (pos > end) return "end";
  return pos - start <= end - pos ? "start" : "end";
}

/** The handle an undecided press takes once it moves: left start, right end. */
export function handleForDirection(dx) {
  if (dx < 0) return "start";
  if (dx > 0) return "end";
  return null;
}

/** Moves one handle to `year`, clamped to the timeline and to the other handle. */
export function moveHandle(handle, year, start, end) {
  const y = Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.round(year)));
  return handle === "start" ? [Math.min(y, end), end] : [start, Math.max(y, start)];
}

const PAGE_STEP = 10;

/**
 * The value a slider key moves a handle to, before clamping (moveHandle does
 * that), or null for keys the slider ignores. Same keys as a native range input,
 * with Page Up/Down a decade.
 */
export function keyTarget(key, value) {
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return value - 1;
    case "ArrowRight":
    case "ArrowUp":
      return value + 1;
    case "PageDown":
      return value - PAGE_STEP;
    case "PageUp":
      return value + PAGE_STEP;
    case "Home":
      return MIN_YEAR;
    case "End":
      return MAX_YEAR;
    default:
      return null;
  }
}

/**
 * Checks a typed year for one handle. Returns { year } when it can be applied
 * as is, or { error } with a sentence to show next to the field. Nothing is
 * clamped silently: a typed year is either used exactly or explained.
 */
export function checkTypedYear(handle, text, start, end) {
  const t = String(text).trim();
  if (!/^\d{4}$/.test(t)) return { error: `Type a year from ${MIN_YEAR} to ${MAX_YEAR}.` };
  const year = Number(t);
  if (year < MIN_YEAR || year > MAX_YEAR) return { error: `Type a year from ${MIN_YEAR} to ${MAX_YEAR}.` };
  if (handle === "start" && year > end) return { error: `The start year can't be after the end year (${end}).` };
  if (handle === "end" && year < start) return { error: `The end year can't be before the start year (${start}).` };
  return { year };
}
