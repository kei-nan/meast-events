// Layout for the two small diagrams of related events (components/RelatedEvents.jsx):
// a compass for "Nearby" (direction and distance from the open event, north up) and
// a time strip for "Around the same time". Pure functions, in SVG user units.

import { SAME_TIME_DAYS, dayNumber } from "./related.js";

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** The 8-point compass direction of a bearing in degrees ("N", "NE", ...). */
export function compassPoint(bearing) {
  return POINTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

/** "under 1 km" or a whole number of km. */
export function formatKm(km) {
  return km < 1 ? "under 1 km" : `${Math.round(km)} km`;
}

// The compass edge: the smallest step that holds the farthest event, so close
// events are not squeezed into the centre of a fixed 50 km dial.
const RING_STEPS = [1, 2, 5, 10, 20, 50];

/** {outer}: the distance in km the edge of the compass stands for. */
export function compassScale(maxKm) {
  const outer = RING_STEPS.find((s) => s >= maxKm) ?? Math.ceil(maxKm);
  return { outer };
}

/**
 * Dot centres for `items` ([{km, bearing}]), relative to the centre, north up:
 * [{x, y}] in the same order. A dot sits at its true direction and at
 * km / outer * radius; dots closer than `gap` are then nudged apart (a few
 * small steps, staying inside the dial) so every number stays readable, and none
 * comes nearer the centre than `inner` (it would hide the mark of the event itself;
 * the list gives the true distance).
 */
export function compassLayout(items, { radius, gap, inner = 0 }) {
  const { outer } = compassScale(Math.max(0, ...items.map((i) => i.km)));
  const pts = items.map(({ km, bearing }) => {
    const r = (Math.min(km, outer) / outer) * radius;
    const a = (bearing * Math.PI) / 180;
    return { x: r * Math.sin(a), y: -r * Math.cos(a) };
  });
  for (let step = 0; step < 40; step++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        let dx = pts[j].x - pts[i].x;
        let dy = pts[j].y - pts[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        // Same spot: push apart sideways, by index, so the result is stable.
        if (d < 1e-6) [dx, dy, d] = [1, 0, 1];
        const push = (gap - d) / 2 + 0.01;
        pts[i].x -= (dx / d) * push;
        pts[i].y -= (dy / d) * push;
        pts[j].x += (dx / d) * push;
        pts[j].y += (dy / d) * push;
        moved = true;
      }
    }
    pts.forEach((p, i) => {
      const r = Math.hypot(p.x, p.y);
      if (r > radius) [p.x, p.y] = [(p.x / r) * radius, (p.y / r) * radius];
      else if (r < inner) {
        // Out along the event's own direction (or the push's, once it has one).
        const a = r > 1e-6 ? Math.atan2(p.x, -p.y) : (items[i].bearing * Math.PI) / 180;
        [p.x, p.y] = [inner * Math.sin(a), -inner * Math.cos(a)];
        moved = true;
      }
    });
    if (!moved) break;
  }
  // "+ 0" turns a rounded -0 into 0.
  return pts.map(({ x, y }) => ({ x: Math.round(x * 10) / 10 + 0, y: Math.round(y * 10) / 10 + 0 }));
}

// Three letters each ("en-GB" short names give "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The room a month needs on the time strip for every month to be labelled ("Jan 2024" at 10px). */
export const MONTH_LABEL_PX = 48;
/** A label is centred on its tick: one this close to an end of the strip would be cut off, so it is left out. */
const LABEL_EDGE_PX = 12;

/**
 * The time strip for `items` ([{date_start}]) around `center` (the open event's
 * date_start), SAME_TIME_DAYS either side across `width`:
 *   dots:  [{x, lane}] in the same order; lane 0 sits on the axis, and a dot that
 *          would overlap one already placed (closer than `gap`) goes a lane up;
 *   lanes: how many lanes are used;
 *   ticks: [{x, label}] at each month start in range; label set on Jan/Apr/Jul/Oct
 *          (on every month when the strip gives each month MONTH_LABEL_PX), with
 *          the year on January and on the first label; else null. No label within
 *          LABEL_EDGE_PX of either end, where it would be cut off.
 * Null if `center` is not a date.
 */
export function stripLayout(items, center, { width, gap }) {
  const step = width / 12 >= MONTH_LABEL_PX ? 1 : 3; // months between labels
  const c = dayNumber(center);
  if (c == null) return null;
  const x = (day) => ((day - c + SAME_TIME_DAYS) / (2 * SAME_TIME_DAYS)) * width;
  const placed = [];
  const dots = items.map((it) => {
    const d = dayNumber(it.date_start);
    const dx = Math.max(0, Math.min(width, x(d ?? c)));
    let lane = 0;
    while (placed.some((p) => p.lane === lane && Math.abs(p.x - dx) < gap)) lane++;
    const dot = { x: Math.round(dx * 10) / 10, lane };
    placed.push(dot);
    return dot;
  });
  const ticks = [];
  const first = new Date((c - SAME_TIME_DAYS) * 86400000);
  let y = first.getUTCFullYear();
  let m = first.getUTCMonth() + 1;
  for (;;) {
    if (m > 11) [y, m] = [y + 1, 0];
    const day = Math.round(Date.UTC(y, m, 1) / 86400000);
    if (day > c + SAME_TIME_DAYS) break;
    const name = MONTHS[m];
    const yearToo = m === 0 || !ticks.some((t) => t.label);
    const tx = Math.round(x(day) * 10) / 10;
    const labelled = m % step === 0 && tx >= LABEL_EDGE_PX && tx <= width - LABEL_EDGE_PX;
    ticks.push({ x: tx, label: labelled ? (yearToo ? `${name} ${y}` : name) : null });
    m++;
  }
  return { dots, lanes: Math.max(1, ...dots.map((d) => d.lane + 1)), ticks };
}
