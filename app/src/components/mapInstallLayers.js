// MapView's own sources and layers, added once on map load. Kept apart from
// mapLayers.js because that file is also imported by the eagerly loaded search
// panel and filter bar, while this one only ships with the lazy-loaded map.
import {
  CATEGORY_COLOR_EXPRESSION,
  CLUSTER_COUNT_TEXT,
  CLUSTER_LABEL_PAINT,
  CLUSTER_PAINT,
  EMPTY_FC,
  HOLLOW_FILL,
  IS_APPROX,
  POINT_PAINT,
} from "./mapLayers";
import { BORDER_STYLE, DASHED_EXPR } from "./mapBorders";

// Label glyphs (Open Sans Semibold, Apache 2.0; see NOTICE) are served from
// public/glyphs/ - only the ranges the labels use are shipped.
const LABEL_FONT = ["Open Sans Semibold"];

// Points stop clustering above this zoom; identical points then draw as one dot.
export const CLUSTER_MAX_ZOOM = 12;

/**
 * Adds every source and layer, bottom to top.
 * @param map         the MapLibre map (style loaded)
 * @param land        initial land FeatureCollection
 * @param boundaries  initial boundaries FeatureCollection (active for the year)
 * @param labels      initial boundary-labels FeatureCollection
 * @param events      initial events FeatureCollection
 */
export function installLayers(map, { land, boundaries, labels, events }) {
  // Physical land/water silhouette for world context (Mediterranean, Black Sea, Red
  // Sea, Persian Gulf, Europe, Africa, etc). Sourced from Natural Earth 1:50m land
  // polygons - pure physical geography with no political information at all, so it
  // can't introduce modern-border anachronisms. Added first, so it sits below our
  // own boundaries/events layers and reads as background context.
  map.addSource("land", {
    type: "geojson",
    data: land,
  });

  map.addLayer(
    {
      id: "land-fill",
      type: "fill",
      source: "land",
      paint: { "fill-color": "#e4ded0", "fill-opacity": 0.65 },
    }
  );

  map.addSource("boundaries", {
    type: "geojson",
    data: boundaries,
  });

  map.addLayer(
    {
      id: "boundaries-fill",
      type: "fill",
      source: "boundaries",
      paint: { "fill-color": "#8a6f45", "fill-opacity": 0.08 },
    }
  );

  map.addLayer({
    id: "boundaries-line",
    type: "line",
    source: "boundaries",
    paint: {
      // Solid = source-dated geometry; dashed + darker amber + thicker = a
      // status flag (mandate/occupation/annexation/dispute). See BORDER_STYLE
      // and isDashedStatus for the "...-included" exception.
      "line-color": ["case", DASHED_EXPR, BORDER_STYLE.flagged.color, BORDER_STYLE.solid.color],
      "line-width": ["case", DASHED_EXPR, BORDER_STYLE.flagged.width, BORDER_STYLE.solid.width],
      "line-dasharray": [
        "case",
        DASHED_EXPR,
        ["literal", BORDER_STYLE.flagged.dash],
        ["literal", [1, 0]],
      ],
    },
  });

  map.addSource("boundary-labels", {
    type: "geojson",
    data: labels,
  });

  // User-drawn search area: sits under the event markers so they stay clickable.
  map.addSource("area", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "area-fill",
    type: "fill",
    source: "area",
    paint: { "fill-color": "#2f6f9f", "fill-opacity": 0.16 },
  });
  map.addLayer({
    id: "area-line",
    type: "line",
    source: "area",
    paint: { "line-color": "#1f5a8a", "line-width": 2.5, "line-dasharray": [3, 2] },
  });

  map.addSource("events", {
    type: "geojson",
    data: events,
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    // Number of search matches inside each cluster (m is 1 for every
    // feature when no search is active, so nothing dims in that case).
    // `searching` (s is the same on every feature) tells the count label
    // whether to show matches or the plain total.
    clusterProperties: { matches: ["+", ["get", "m"]], searching: ["max", ["get", "s"]] },
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "events",
    filter: ["has", "point_count"],
    paint: CLUSTER_PAINT,
  });

  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "events",
    filter: ["!", ["has", "point_count"]],
    paint: POINT_PAINT,
  });

  // Country labels sit ABOVE the event markers (below only hover/selection) so
  // markers never hide a state's name. Placement priority = state size (bigger
  // first) and big states print larger.
  map.addLayer({
    id: "boundaries-label",
    type: "symbol",
    source: "boundary-labels",
    layout: {
      // boundary-labels' "name" property is already the period-appropriate
      // display name, resolved at ingest time.
      "text-field": ["get", "name"],
      "text-font": LABEL_FONT,
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        ["+", 8, ["*", 3, ["get", "big"]]],
        5,
        ["+", 11, ["*", 6, ["get", "big"]]],
        8,
        ["+", 14, ["*", 8, ["get", "big"]]],
      ],
      "symbol-sort-key": ["-", 0, ["get", "area"]],
      "text-max-width": 7,
      "text-padding": 2,
      "symbol-placement": "point",
      "text-allow-overlap": false,
      "text-ignore-placement": false,
    },
    paint: {
      "text-color": "#f4f1ea",
      "text-halo-color": "rgba(15,17,20,0.9)",
      "text-halo-width": 1.6,
      "text-halo-blur": 0.3,
    },
  });

  // Cluster counts sit above the country labels, so they are placed first
  // (symbols are placed top layer down) and always drawn: a cluster on
  // "Syria" or "Kuwait" used to lose its number to the label. They still
  // take part in collision detection, so a country label that would sit
  // under a cluster's digits is dropped (it returns on zoom) instead of
  // being overprinted. A 0-match cluster has no text, so it blocks nothing.
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "events",
    filter: ["has", "point_count"],
    layout: {
      "text-field": CLUSTER_COUNT_TEXT,
      "text-font": LABEL_FONT,
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": false,
    },
    paint: CLUSTER_LABEL_PAINT,
  });

  // Hover and selection live in their own (unclustered) sources so the
  // highlighted event is visible even while its marker sits inside a cluster.
  map.addSource("hover", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "hover-ring",
    type: "circle",
    source: "hover",
    paint: {
      "circle-radius": 12,
      "circle-color": "rgba(255,255,255,0)",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#1b1b1b",
    },
  });

  // Pointer feedback: a ring on whichever cluster/dot is under the cursor, and a
  // short-lived flash on a clicked cluster (which then zooms in).
  map.addSource("pointer-hover", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "pointer-hover",
    type: "circle",
    source: "pointer-hover",
    paint: {
      "circle-radius": ["get", "r"],
      "circle-color": "rgba(255,210,90,0.18)",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffd25a",
    },
  });
  map.addSource("cluster-flash", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "cluster-flash",
    type: "circle",
    source: "cluster-flash",
    paint: {
      "circle-radius": ["get", "r"],
      "circle-color": "rgba(255,210,90,0.4)",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
    },
  });

  map.addSource("selected", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "selected-halo",
    type: "circle",
    source: "selected",
    paint: {
      "circle-radius": 20,
      "circle-color": "rgba(255,210,90,0.35)",
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#1b1b1b",
    },
  });
  // Approximate locations stay hollow when selected, like their regular dot.
  map.addLayer({
    id: "selected-point",
    type: "circle",
    source: "selected",
    paint: {
      "circle-radius": 11,
      "circle-color": ["case", IS_APPROX, HOLLOW_FILL, CATEGORY_COLOR_EXPRESSION],
      "circle-stroke-width": 4,
      "circle-stroke-color": ["case", IS_APPROX, CATEGORY_COLOR_EXPRESSION, "#ffffff"],
    },
  });

  map.addSource("area-handles", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "area-handles",
    type: "circle",
    source: "area-handles",
    paint: {
      "circle-radius": ["case", ["==", ["get", "kind"], "center"], 5, 8],
      "circle-color": "#ffffff",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#1f5a8a",
    },
  });
  map.addSource("area-label", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "area-label",
    type: "symbol",
    source: "area-label",
    layout: {
      "text-field": ["get", "text"],
      "text-font": LABEL_FONT,
      "text-size": 13,
      "text-offset": [0, -2.1],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#12385a",
      "text-halo-color": "rgba(255,255,255,0.95)",
      "text-halo-width": 2,
    },
  });
}
