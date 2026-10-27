// Where an opened event lands on the map. Parts of the map are covered: the
// toolbar (top left), the Borders control and the "Borders as of" years (top
// right), the navigation keys (bottom right; under the Borders row on phones),
// the attribution, the first-visit tip and, on
// phones, the bottom sheet (peek, half or all but a strip along its top:
// lib/sheetSnap.js; the reader can drag it between). On wider screens the side
// panel sits beside the map, not over it, so it covers nothing (it is still
// measured, in case). Camera moves for an opened event aim at the largest part
// of the map left in sight, measured from those elements themselves when the
// move starts.

// A clear area narrower or shorter than this is no use: the controls are
// ignored then (the sheet is not: what it covers is never in sight).
const MIN_CLEAR_PX = 40;
// How far inside the clear area a pin is kept, at least: the selected marker's
// halo (mapInstallLayers.js selected-halo: 20 px) and a little air.
export const PIN_MARGIN_PX = 28;

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

// What lies over the map: the toolbar's, the right-hand column's and the
// navigation's own parts (each measured on its own: the column is a ragged
// stack, and the navigation's pan pad opens beside its keys), MapLibre's own
// controls (the attribution), the tip, and the panel.
const OVERLAY_GROUPS = [".mu-toolbar-wrap", ".mu-ctrl-right", ".mu-nav"];
const OVERLAY_EACH = ".maplibregl-ctrl";
const OVERLAY_SINGLES = [".mu-tip", ".side-panel"];

function pushRect(out, el, box) {
  const b = el.getBoundingClientRect();
  if (b.width < 1 || b.height < 1) {
    // display: contents (the phone's .mu-borders) has no box of its own.
    for (const child of el.children) pushRect(out, child, box);
    return;
  }
  const r = {
    left: Math.max(0, b.left - box.left),
    top: Math.max(0, b.top - box.top),
    right: Math.min(box.width, b.right - box.left),
    bottom: Math.min(box.height, b.bottom - box.top),
  };
  if (r.right - r.left >= 1 && r.bottom - r.top >= 1) out.push(r);
}

/**
 * The boxes of everything over `container` (the map), in px from its top
 * left corner and clipped to it. Reads the page.
 */
export function overlayRects(container) {
  if (typeof document === "undefined" || !container) return [];
  const view = container.closest(".map-view") ?? container.parentElement;
  const scope = view?.parentElement ?? document;
  const box = container.getBoundingClientRect();
  const out = [];
  for (const sel of OVERLAY_GROUPS) {
    const group = view?.querySelector(sel);
    if (group) for (const child of group.children) pushRect(out, child, box);
  }
  for (const el of view?.querySelectorAll(OVERLAY_EACH) ?? []) pushRect(out, el, box);
  for (const sel of OVERLAY_SINGLES) {
    const el = scope.querySelector(sel);
    if (el) pushRect(out, el, box);
  }
  return out;
}

const overlaps = (r, l, t, rt, b) => r.left < rt && r.right > l && r.top < b && r.bottom > t;

// The largest rectangle, at least MIN_CLEAR_PX each way, of a width x height
// area that none of `rects` overlaps, as {left, top, right, bottom}, or null.
// Each of its edges is the area's own or one of the rects' (a largest empty
// rectangle can be grown until every edge meets one), so trying each such
// combination finds it.
function largestClear(width, height, rects) {
  const lefts = [0, ...rects.map((r) => r.right)].filter((x) => x < width);
  const rights = [width, ...rects.map((r) => r.left)].filter((x) => x > 0);
  const tops = [0, ...rects.map((r) => r.bottom)].filter((y) => y < height);
  const bottoms = [height, ...rects.map((r) => r.top)].filter((y) => y > 0);
  let best = null;
  let bestScore = -Infinity;
  for (const l of lefts)
    for (const rt of rights) {
      if (rt <= l) continue;
      const cols = rects.filter((r) => r.left < rt && r.right > l);
      for (const t of tops)
        for (const b of bottoms) {
          if (b <= t) continue;
          const w = rt - l;
          const h = b - t;
          const score = w * h;
          if (w < MIN_CLEAR_PX || h < MIN_CLEAR_PX || score <= bestScore) continue;
          if (cols.some((r) => overlaps(r, l, t, rt, b))) continue;
          best = { left: l, top: t, right: rt, bottom: b };
          bestScore = score;
        }
    }
  return best;
}

/**
 * MapLibre `padding` ({top, right, bottom, left}, px) that leaves the largest
 * part of a `width` x `height` map that none of `rects` covers. When no such
 * part is MIN_CLEAR_PX across, only the rects spanning the whole width count
 * (the phone sheet), and with nothing usable left the padding is
 * zero. Pure.
 */
export function clearPadding(width, height, rects) {
  const attempt = (rs) => {
    const c = largestClear(width, height, rs);
    if (!c) return null;
    return { top: c.top, right: width - c.right, bottom: height - c.bottom, left: c.left };
  };
  return (
    attempt(rects) ??
    attempt(rects.filter((r) => r.left <= 1 && r.right >= width - 1)) ?? { top: 0, right: 0, bottom: 0, left: 0 }
  );
}

/**
 * flyTo/easeTo `offset` that puts the target in the middle of the area the
 * padding leaves, on a `width` x `height` map. Pure.
 */
export function paddingOffset(width, height, padding) {
  return [
    Math.round((padding.left + width - padding.right) / 2 - width / 2),
    Math.round((padding.top + height - padding.bottom) / 2 - height / 2),
  ];
}

/**
 * The size of `map` (a MapLibre map), the padding that keeps clear of what
 * covers it, and the offset to the middle of what is left. Reads the page.
 *
 * MapLibre takes up a new container size only on its next ResizeObserver
 * callback, after the camera move has started. A layout change in the same
 * render (on phones the timeline under the map is shorter while the sheet is at
 * full, so "Show on map" dropping the sheet to its peek bar makes the map 46 px
 * shorter) would aim the camera at the old size, and the resize would then shift
 * everything by half the difference. So the map is brought up to its
 * container's size first.
 */
export function mapClearView(map) {
  const container = map.getContainer();
  const width = container.clientWidth;
  const height = container.clientHeight;
  const canvas = map.getCanvas?.();
  if (canvas && (canvas.clientWidth !== width || canvas.clientHeight !== height)) map.resize();
  const padding = clearPadding(width, height, overlayRects(container));
  return { width, height, padding, offset: paddingOffset(width, height, padding) };
}

/** `padding` grown by `px` on every side. Pure. */
export function growPadding(padding, px) {
  return { top: padding.top + px, right: padding.right + px, bottom: padding.bottom + px, left: padding.left + px };
}

// Web Mercator world pixels at `zoom` (MapLibre's 512 px tiles).
const TILE = 512;
const MAX_LAT = 85.051129;
function toWorld([lon, lat], zoom) {
  const size = TILE * 2 ** zoom;
  const s = Math.sin((Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * size, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size];
}
function fromWorld([x, y], zoom) {
  const size = TILE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / size;
  return [(x / size) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))];
}

/**
 * Where `pin` ([lon, lat]) shows, in px from the map's top left, with the
 * camera at `center` ([lon, lat]) and `zoom`, its centre `offset` px from the
 * middle of a `width` x `height` map (no bearing or pitch). Pure.
 */
export function screenPoint(pin, { center, zoom, offset = [0, 0] }, width, height) {
  const p = toWorld(pin, zoom);
  const c = toWorld(center, zoom);
  return [width / 2 + offset[0] + p[0] - c[0], height / 2 + offset[1] + p[1] - c[1]];
}

/**
 * The camera centre nearest to `center` that shows `pin` at least `margin` px
 * inside the area `padding` leaves: more where that area is wide (a fifth of
 * it, up to twice `margin`), so the pin is not wedged against a control, and in
 * its middle along an axis too small for the margin. Same zoom and offset. Pure.
 */
export function keepPinInside(pin, { center, zoom, offset = [0, 0] }, width, height, padding, margin = PIN_MARGIN_PX) {
  const [sx, sy] = screenPoint(pin, { center, zoom, offset }, width, height);
  const clampAxis = (v, a, b) => {
    const m = Math.max(margin, Math.min((b - a) / 5, 2 * margin));
    return a + m > b - m ? (a + b) / 2 : Math.min(Math.max(v, a + m), b - m);
  };
  const tx = clampAxis(sx, padding.left, width - padding.right);
  const ty = clampAxis(sy, padding.top, height - padding.bottom);
  if (tx === sx && ty === sy) return center;
  // Moving the centre by d world px moves the pin by -d on screen.
  const c = toWorld(center, zoom);
  return fromWorld([c[0] + (sx - tx), c[1] + (sy - ty)], zoom);
}
