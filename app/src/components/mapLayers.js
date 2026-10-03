// Pure helpers and layer definitions for MapView: colours, GeoJSON builders,
// geodesic area geometry (plain spherical maths - no extra dependencies).
import { eventYearLabel } from "../lib/mapStack.js";

// A curated "historical atlas" ink palette - muted, warm-leaning hues evocative of
// hand-tinted cartography (brick, verdigris, indigo, ochre) rather than generic
// bright web-primary colors. Each hue stays distinguishable at small marker sizes.
export const CATEGORY_COLORS = {
  war: "#a13f2e", // brick red
  treaty: "#4c7a63", // verdigris green
  political: "#455d80", // muted indigo
  uprising: "#c99a45", // antique gold
  migration: "#7d5a7d", // dusty plum
  diplomatic: "#3f7d84", // muted teal
  economic: "#8c7a3f", // olive mustard
  terrorism: "#6b3140", // deep oxblood
  atrocity: "#3d3833", // lamp black
};
const FALLBACK_COLOR = "#6b6151";

export const CATEGORY_COLOR_EXPRESSION = [
  "match",
  ["get", "category"],
  ...Object.entries(CATEGORY_COLORS).flatMap(([k, v]) => [k, v]),
  FALLBACK_COLOR,
];

const HOLLOW_FILL = "#f4f1ea";
const STROKE_LIGHT = "rgba(236,226,201,0.85)";
const IS_APPROX = ["==", ["get", "a"], 1];
const IS_MISS = ["==", ["get", "m"], 0];
const IS_HIT_IN_SEARCH = ["all", ["==", ["get", "s"], 1], ["==", ["get", "m"], 1]];

// Data-driven paint for the unclustered event layer. Non-matches (while a
// search is active) shrink AND fade; matches grow and get a white stroke;
// approximate locations are hollow rings - shape/size cues, not colour alone.
export const POINT_PAINT = {
  "circle-color": ["case", IS_APPROX, HOLLOW_FILL, CATEGORY_COLOR_EXPRESSION],
  "circle-radius": ["case", IS_MISS, 4, IS_HIT_IN_SEARCH, 8, 6],
  "circle-stroke-width": ["case", IS_APPROX, 3, IS_HIT_IN_SEARCH, 3, 2],
  "circle-stroke-color": [
    "case",
    IS_APPROX,
    CATEGORY_COLOR_EXPRESSION,
    IS_HIT_IN_SEARCH,
    "#ffffff",
    STROKE_LIGHT,
  ],
  "circle-opacity": ["case", IS_MISS, 0.3, 1],
  "circle-stroke-opacity": ["case", IS_MISS, 0.3, 1],
};

export const CLUSTER_PAINT = {
  "circle-color": "#5c4d38",
  "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 15, 24],
  "circle-stroke-width": 2,
  "circle-stroke-color": STROKE_LIGHT,
  "circle-opacity": ["case", ["==", ["get", "matches"], 0], 0.25, 1],
  "circle-stroke-opacity": ["case", ["==", ["get", "matches"], 0], 0.25, 1],
};

// Cluster number: during a search/filter the matches inside the cluster (no
// number at all on a dimmed 0-match cluster), otherwise the plain total.
// `searching` and `matches` are the source's clusterProperties (MapView),
// summed from each feature's s/m.
export const CLUSTER_COUNT_TEXT = [
  "case",
  ["!=", ["get", "searching"], 1],
  ["get", "point_count_abbreviated"],
  ["==", ["get", "matches"], 0],
  "",
  ["to-string", ["get", "matches"]],
];

export const CLUSTER_LABEL_PAINT = {
  "text-color": "#ece2c9",
};

export function eventsToGeoJSON(events, matchIds) {
  const searching = matchIds ? 1 : 0;
  return {
    type: "FeatureCollection",
    features: events
      .filter((e) => e.coordinates)
      .map((e) => ({
        type: "Feature",
        properties: {
          id: e.id,
          category: e.category,
          title: e.title,
          y: eventYearLabel(e), // year label for the hover label and stacked-event list
          m: matchIds ? (matchIds.has(e.id) ? 1 : 0) : 1,
          s: searching,
          a: e.location_quality === "approximate" ? 1 : 0,
        },
        geometry: { type: "Point", coordinates: [e.coordinates.lon, e.coordinates.lat] },
      })),
  };
}

export const EMPTY_FC = { type: "FeatureCollection", features: [] };

export function pointFeature(event) {
  if (!event?.coordinates) return EMPTY_FC;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          id: event.id,
          category: event.category,
          a: event.location_quality === "approximate" ? 1 : 0,
        },
        geometry: { type: "Point", coordinates: [event.coordinates.lon, event.coordinates.lat] },
      },
    ],
  };
}

// ---- geodesy -------------------------------------------------------------

const R_KM = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function haversineKm([lon1, lat1], [lon2, lat2]) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function destination([lon, lat], bearingDeg, km) {
  const d = km / R_KM;
  const b = rad(bearingDeg);
  const p1 = rad(lat);
  const l1 = rad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 =
    l1 +
    Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [deg(l2), deg(p2)];
}

const clampLat = (v) => Math.max(-85, Math.min(85, v));

export function circleBbox(center, km) {
  const north = destination(center, 0, km)[1];
  const south = destination(center, 180, km)[1];
  const dLon = deg(Math.asin(Math.min(1, Math.sin(km / R_KM) / Math.cos(rad(center[1])))));
  return [center[0] - dLon, clampLat(south), center[0] + dLon, clampLat(north)];
}

export function makeCircleArea(center, radiusKm) {
  return { type: "circle", center, radiusKm, bbox: circleBbox(center, radiusKm) };
}

export function makeRectArea(a, b) {
  return {
    type: "rect",
    bbox: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
  };
}

function circleRing(center, km, steps = 72) {
  const ring = [];
  for (let i = 0; i < steps; i++) ring.push(destination(center, (360 * i) / steps, km));
  ring.push(ring[0]);
  return ring;
}

function rectRing([w, s, e, n]) {
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}

export function formatKm(km) {
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

// Everything the area layers need, as three GeoJSON collections.
export function areaGeoJSON(area, showHandles = true) {
  if (!area) return { shape: EMPTY_FC, handles: EMPTY_FC, label: EMPTY_FC };
  const feat = (geometry, properties = {}) => ({ type: "Feature", properties, geometry });
  let ring;
  const handles = [];
  let label = EMPTY_FC;
  if (area.type === "circle" && area.center) {
    ring = circleRing(area.center, area.radiusKm);
    const edge = destination(area.center, 90, area.radiusKm);
    handles.push(feat({ type: "Point", coordinates: edge }, { kind: "radius" }));
    handles.push(feat({ type: "Point", coordinates: area.center }, { kind: "center" }));
    label = {
      type: "FeatureCollection",
      features: [feat({ type: "Point", coordinates: edge }, { text: `r = ${formatKm(area.radiusKm)}` })],
    };
  } else {
    const [w, s, e, n] = area.bbox;
    ring = rectRing(area.bbox);
    for (const [kind, c] of [
      ["sw", [w, s]],
      ["se", [e, s]],
      ["ne", [e, n]],
      ["nw", [w, n]],
    ]) {
      handles.push(feat({ type: "Point", coordinates: c }, { kind }));
    }
  }
  return {
    shape: { type: "FeatureCollection", features: [feat({ type: "Polygon", coordinates: [ring] })] },
    handles: showHandles ? { type: "FeatureCollection", features: handles } : EMPTY_FC,
    label,
  };
}

// Given a rect area and the dragged corner kind, the fixed (opposite) corner.
export function oppositeCorner([w, s, e, n], kind) {
  return { sw: [e, n], se: [w, n], ne: [w, s], nw: [e, s] }[kind];
}
