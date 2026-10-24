// The results panel's Timeline view: events oldest first (in the browse list,
// those starting in the selected years before those ongoing), grouped by decade,
// each with a bar for the years its dates name on a shared axis. Pure.
//
// Bars show the dates as the data gives them (docs/DATA_POLICY.md): a record
// whose end comes before its start is drawn at its start year only and marked
// `reversed` (the event panel explains it), never as a span between the two;
// when only its end year is on the axis (the selected years match it there,
// lib/eventYears.js eventOverlapsRange), it is a point at the end year instead.
// An event without an end date is a point at its start year: a missing end is
// not read as "still going on".

import { startedBefore } from "./browseOrder.js";
import { rawEventYears } from "./eventYears.js";

/** The event's start date as a sortable string ("" when it has none). */
function startKey(e) {
  return typeof e?.date_start === "string" ? e.date_start : "";
}

/** Events oldest first by start date (as given); undated last; stable. */
export function chronological(events) {
  return events
    .map((e, i) => ({ e, i, k: startKey(e) }))
    .sort((a, b) => {
      if (!a.k !== !b.k) return a.k ? -1 : 1;
      if (a.k !== b.k) return a.k < b.k ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.e);
}

/**
 * The Timeline view's order. With `rangeStart` (the browse list): the events
 * that START in the selected years first, then those ongoing from before them,
 * each part oldest first - the List view's split (lib/browseOrder.js). Without
 * it: all oldest first. Undated events stay in the first part, as in the List.
 */
export function timelineOrder(events, rangeStart = null) {
  const sorted = chronological(events);
  if (!Number.isFinite(rangeStart)) return sorted;
  const starting = [];
  const ongoing = [];
  for (const e of sorted) (startedBefore(e, rangeStart) ? ongoing : starting).push(e);
  return starting.concat(ongoing);
}

/** The first year of the decade the event starts in, or null when it has no start year. */
export function startDecade(e) {
  const [s] = rawEventYears(e);
  return Number.isFinite(s) && s > 0 ? Math.floor(s / 10) * 10 : null;
}

/** "1970s" (null: "No date"). */
export function decadeLabel(decade) {
  return decade === null ? "No date" : `${decade}s`;
}

/**
 * The axis [first year, last year] the bars are drawn on. `fit` (a search over
 * the whole timeline): the span of the events' own years, so the matches fill
 * the width; else the selected years `range`. Years outside [minYear, maxYear]
 * are cut off; no events gives `range`.
 */
export function timelineAxis(events, range, { fit = false, minYear = -Infinity, maxYear = Infinity } = {}) {
  if (!fit) return [range[0], range[1]];
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of events) {
    const [s, en] = rawEventYears(e);
    if (!Number.isFinite(s) || s <= 0) continue;
    const end = en >= s ? en : s; // a reversed record counts at its start only
    lo = Math.min(lo, s);
    hi = Math.max(hi, end);
  }
  if (lo > hi) return [range[0], range[1]];
  return [Math.max(lo, minYear), Math.min(hi, maxYear)];
}

const pct = (n) => Math.round(n * 10000) / 100;

/**
 * Where the event's bar sits on `axis`, in percent of the track: each year is
 * one equal cell, so a one-year event fills its year's cell. `before`/`after`:
 * the event goes on past that end of the axis (the bar is cut there).
 * `reversed`: its end is before its start (drawn at the start year). `point`:
 * one year only. null when the event has no start year or lies off the axis.
 */
export function barGeometry(e, [a0, a1]) {
  const [s, en] = rawEventYears(e);
  if (!Number.isFinite(s) || s <= 0) return null;
  const reversed = en < s;
  if (reversed) {
    // One of its two years, never the years between: the start when it is on the axis, else the end.
    const y = s >= a0 && s <= a1 ? s : en >= a0 && en <= a1 ? en : null;
    if (y === null) return null;
    const cells = a1 - a0 + 1;
    return { left: pct((y - a0) / cells), width: pct(1 / cells), before: false, after: false, reversed, point: true };
  }
  if (en < a0 || s > a1) return null;
  const cells = a1 - a0 + 1;
  const from = Math.max(s, a0);
  const to = Math.min(en, a1);
  return {
    left: pct((from - a0) / cells),
    width: pct((to - from + 1) / cells),
    before: s < a0,
    after: en > a1,
    reversed,
    point: s === en,
  };
}

/** The selected years as a band on `axis` (percent), or null when they cover the whole axis. */
export function rangeBand([r0, r1], [a0, a1]) {
  const from = Math.max(r0, a0);
  const to = Math.min(r1, a1);
  if (from > to || (from === a0 && to === a1)) return null;
  const cells = a1 - a0 + 1;
  return { left: pct((from - a0) / cells), width: pct((to - from + 1) / cells) };
}

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100];

/**
 * Round years inside the axis to label it, at most `max` of them, each with its
 * position (percent, the start of that year's cell). The axis ends are labelled
 * separately, so ticks too close to them are left out.
 */
export function axisTicks([a0, a1], max = 5) {
  const cells = a1 - a0 + 1;
  const step = STEPS.find((s) => Math.floor(cells / s) <= max) ?? 100;
  const ticks = [];
  for (let y = Math.ceil(a0 / step) * step; y <= a1; y += step) {
    const at = (y - a0) / cells;
    if (at < 0.12 || at > 0.88) continue;
    ticks.push({ year: y, at: pct(at) });
  }
  return ticks;
}
